"""Procedural geometry helpers for the mini-figure kit.

Everything is built from a few analytic primitives (lofted superellipse
rings, swept tubes, ellipsoids) so the same code can produce a low-poly
in-game mesh and a dense render mesh by changing one quality number.

Conventions: Blender Z-up, figures face -Y, the character's left is +X.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Iterable, Sequence

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

# --------------------------------------------------------------------------
# Raw mesh container
# --------------------------------------------------------------------------


@dataclass
class Geo:
    """A soup of verts + polygons with a material slot name per polygon."""

    verts: list = field(default_factory=list)  # [(x, y, z)]
    faces: list = field(default_factory=list)  # [(i, j, k[, l])]
    slots: list = field(default_factory=list)  # slot name per face
    smooth: list = field(default_factory=list)  # bool per face

    def add(self, other: "Geo") -> "Geo":
        off = len(self.verts)
        self.verts.extend(other.verts)
        self.faces.extend(tuple(i + off for i in f) for f in other.faces)
        self.slots.extend(other.slots)
        self.smooth.extend(other.smooth)
        return self

    def transformed(self, m: Matrix) -> "Geo":
        g = Geo()
        g.verts = [tuple(m @ Vector(v)) for v in self.verts]
        flip = m.determinant() < 0
        g.faces = [tuple(reversed(f)) if flip else f for f in self.faces]
        g.slots = list(self.slots)
        g.smooth = list(self.smooth)
        return g

    def translated(self, x=0.0, y=0.0, z=0.0) -> "Geo":
        return self.transformed(Matrix.Translation((x, y, z)))

    def mirrored_x(self) -> "Geo":
        return self.transformed(Matrix.Scale(-1, 4, (1, 0, 0)))

    def set_slot(self, slot: str) -> "Geo":
        self.slots = [slot] * len(self.faces)
        return self

    def remap_slots(self, mapping: dict) -> "Geo":
        self.slots = [mapping.get(s, s) for s in self.slots]
        return self

    def copy(self) -> "Geo":
        g = Geo()
        g.verts = list(self.verts)
        g.faces = list(self.faces)
        g.slots = list(self.slots)
        g.smooth = list(self.smooth)
        return g


def merge(parts: Iterable[Geo]) -> Geo:
    out = Geo()
    for p in parts:
        out.add(p)
    return out


# --------------------------------------------------------------------------
# Profiles
# --------------------------------------------------------------------------


class Profile:
    """Smooth interpolation through control rows (monotone-ish cubic).

    rows: [(t, a, b, ...)] sorted by t. sample(t) -> np.array of the values.
    """

    def __init__(self, rows: Sequence[Sequence[float]]):
        arr = np.array(rows, dtype=float)
        self.t = arr[:, 0]
        self.v = arr[:, 1:]
        # Catmull-Rom tangents with end clamping
        n = len(self.t)
        m = np.zeros_like(self.v)
        for i in range(n):
            if i == 0:
                m[i] = (self.v[1] - self.v[0]) / (self.t[1] - self.t[0])
            elif i == n - 1:
                m[i] = (self.v[-1] - self.v[-2]) / (self.t[-1] - self.t[-2])
            else:
                m[i] = (self.v[i + 1] - self.v[i - 1]) / (self.t[i + 1] - self.t[i - 1])
        self.m = m

    def sample(self, t: float) -> np.ndarray:
        ts = self.t
        if t <= ts[0]:
            return self.v[0].copy()
        if t >= ts[-1]:
            return self.v[-1].copy()
        i = int(np.searchsorted(ts, t) - 1)
        h = ts[i + 1] - ts[i]
        u = (t - ts[i]) / h
        h00 = 2 * u**3 - 3 * u**2 + 1
        h10 = u**3 - 2 * u**2 + u
        h01 = -2 * u**3 + 3 * u**2
        h11 = u**3 - u**2
        return h00 * self.v[i] + h10 * h * self.m[i] + h01 * self.v[i + 1] + h11 * h * self.m[i + 1]

    @property
    def t0(self) -> float:
        return float(self.t[0])

    @property
    def t1(self) -> float:
        return float(self.t[-1])


def superellipse_xy(theta: np.ndarray, rx: float, ry: float, n: float = 2.0):
    c, s = np.cos(theta), np.sin(theta)
    e = 2.0 / n
    return rx * np.sign(c) * np.abs(c) ** e, ry * np.sign(s) * np.abs(s) ** e


def ring_angles(segs: int) -> np.ndarray:
    """Vertex angles; faces end up centred on +X, +Y, -X, -Y."""
    return (np.arange(segs) - 0.5) * (2 * math.pi / segs)


# --------------------------------------------------------------------------
# Loft
# --------------------------------------------------------------------------


def loft(
    rings: Sequence[dict],
    segs: int = 16,
    cap0: bool = True,
    cap1: bool = True,
    slot: str | Callable[[int, int, int, int], str] = "default",
    smooth: bool = True,
) -> Geo:
    """Stack of superellipse rings along +Z.

    Each ring: dict(z, rx, ry, n=2, cx=0, cy=0).
    slot may be a callable (ring_index, seg_index, n_rings, n_segs) -> slot
    name, called per quad (ring_index is the lower ring of the quad; caps get
    ring_index -1 for the bottom and n_rings-1 for the top).
    """
    g = Geo()
    th = ring_angles(segs)
    nr = len(rings)
    for r in rings:
        x, y = superellipse_xy(th, r["rx"], r["ry"], r.get("n", 2.0))
        cx, cy = r.get("cx", 0.0), r.get("cy", 0.0)
        for k in range(segs):
            g.verts.append((cx + float(x[k]), cy + float(y[k]), float(r["z"])))

    def slot_of(i, j):
        return slot(i, j, nr, segs) if callable(slot) else slot

    for i in range(nr - 1):
        for j in range(segs):
            a = i * segs + j
            b = i * segs + (j + 1) % segs
            c = (i + 1) * segs + (j + 1) % segs
            d = (i + 1) * segs + j
            g.faces.append((a, b, c, d))
            g.slots.append(slot_of(i, j))
            g.smooth.append(smooth)
    if cap0:
        r = rings[0]
        p = len(g.verts)
        g.verts.append((r.get("cx", 0.0), r.get("cy", 0.0), r["z"] - r.get("cap", 0.0)))
        for j in range(segs):
            g.faces.append((p, (j + 1) % segs, j))
            g.slots.append(slot_of(-1, j))
            g.smooth.append(smooth)
    if cap1:
        r = rings[-1]
        p = len(g.verts)
        base = (nr - 1) * segs
        g.verts.append((r.get("cx", 0.0), r.get("cy", 0.0), r["z"] + r.get("cap", 0.0)))
        for j in range(segs):
            g.faces.append((p, base + j, base + (j + 1) % segs))
            g.slots.append(slot_of(nr - 1, j))
            g.smooth.append(smooth)
    return g


def profile_loft(
    prof: Profile,
    rings: int,
    segs: int,
    n: float | Callable[[float], float] = 2.0,
    slot="default",
    round0: float = 0.0,
    round1: float = 0.0,
    z_slot: Callable[[float, float], str] | None = None,
    spacing: str = "even",
) -> Geo:
    """Dense loft sampled from a Profile of (z, rx, ry[, cx, cy]).

    round0/round1: add a dome of that height below/above the profile ends.
    z_slot(z_mid, angle) -> slot overrides `slot` when given.
    """
    zs = np.linspace(prof.t0, prof.t1, rings)
    if spacing == "cos":
        u = (1 - np.cos(np.linspace(0, math.pi, rings))) / 2
        zs = prof.t0 + (prof.t1 - prof.t0) * u
    rows = []
    dome_steps = max(2, rings // 4)

    def row(z, scale=1.0, zoff=0.0):
        v = prof.sample(float(z))
        rx, ry = v[0] * scale, v[1] * scale
        cx = v[2] if len(v) > 2 else 0.0
        cy = v[3] if len(v) > 3 else 0.0
        nn = n(float(z)) if callable(n) else n
        return dict(z=float(z) + zoff, rx=float(rx), ry=float(ry), n=nn, cx=float(cx), cy=float(cy))

    if round0 > 0:
        for k in range(dome_steps, 0, -1):
            phi = (k / (dome_steps + 0.35)) * (math.pi / 2)
            rows.append(row(prof.t0, math.cos(phi), -round0 * math.sin(phi)))
    for z in zs:
        rows.append(row(z))
    if round1 > 0:
        for k in range(1, dome_steps + 1):
            phi = (k / (dome_steps + 0.35)) * (math.pi / 2)
            rows.append(row(prof.t1, math.cos(phi), round1 * math.sin(phi)))
    if round0 > 0:
        rows[0]["cap"] = round0 * (1 - math.sin((dome_steps / (dome_steps + 0.35)) * math.pi / 2))
    if round1 > 0:
        rows[-1]["cap"] = round1 * (1 - math.sin((dome_steps / (dome_steps + 0.35)) * math.pi / 2))

    th_mid = (np.arange(segs)) * (2 * math.pi / segs)

    def slot_fn(i, j, nr, ns):
        if z_slot is None:
            return slot(i, j, nr, ns) if callable(slot) else slot
        if i < 0:
            zm = rows[0]["z"]
        elif i >= nr - 1:
            zm = rows[-1]["z"]
        else:
            zm = 0.5 * (rows[i]["z"] + rows[i + 1]["z"])
        return z_slot(zm, float(th_mid[j]))

    return loft(rows, segs=segs, slot=slot_fn)


def ellipsoid(rx, ry, rz, segs=12, rings=8, slot="default", n=2.0) -> Geo:
    rows = []
    for k in range(1, rings):
        phi = -math.pi / 2 + math.pi * k / rings
        rows.append(dict(z=rz * math.sin(phi), rx=rx * math.cos(phi), ry=ry * math.cos(phi), n=n))
    rows[0]["cap"] = rz - abs(rows[0]["z"])
    rows[-1]["cap"] = rz - abs(rows[-1]["z"])
    return loft(rows, segs=segs, slot=slot)


def capsule(r0, r1, length, segs=10, rings=3, slot="default", z_slot=None, n=2.0, ry_scale=1.0) -> Geo:
    """Capsule hanging down -Z from the origin: radius r0 at the top, r1 at the bottom."""
    prof = Profile([(-length, r1, r1 * ry_scale), (0.0, r0, r0 * ry_scale)])
    return profile_loft(prof, rings=max(2, rings), segs=segs, n=n, slot=slot, round0=r1 * 0.9, round1=r0 * 0.9, z_slot=z_slot)


# --------------------------------------------------------------------------
# Sweeps
# --------------------------------------------------------------------------


def sweep(
    points: Sequence[Sequence[float]],
    radius: float | Sequence[float] = 0.01,
    segs: int = 6,
    closed: bool = False,
    slot: str = "default",
    flat: float = 1.0,
    up: Sequence[float] | None = None,
    caps: bool = True,
    n: float = 2.0,
) -> Geo:
    """Sweep a (super)elliptical section along a polyline.

    radius may be per-point. `flat` scales the section along the binormal
    (flat < 1 makes a ribbon). `up` fixes the frame's reference up vector,
    otherwise frames are parallel-transported.
    """
    P = [Vector(p) for p in points]
    npts = len(P)
    radii = [radius] * npts if isinstance(radius, (int, float)) else list(radius)
    tangents = []
    for i in range(npts):
        if closed:
            t = P[(i + 1) % npts] - P[(i - 1) % npts]
        elif i == 0:
            t = P[1] - P[0]
        elif i == npts - 1:
            t = P[-1] - P[-2]
        else:
            t = P[i + 1] - P[i - 1]
        tangents.append(t.normalized())
    frames = []
    if up is not None:
        upv = Vector(up).normalized()
        for t in tangents:
            b = t.cross(upv)
            if b.length < 1e-6:
                b = t.orthogonal()
            b.normalize()
            nrm = b.cross(t).normalized()
            frames.append((nrm, b))
    else:
        nrm = tangents[0].orthogonal().normalized()
        for i, t in enumerate(tangents):
            if i > 0:
                axis = tangents[i - 1].cross(t)
                if axis.length > 1e-8:
                    ang = tangents[i - 1].angle(t)
                    nrm = Matrix.Rotation(ang, 3, axis.normalized()) @ nrm
            nrm = (nrm - t * nrm.dot(t)).normalized()
            frames.append((nrm, t.cross(nrm).normalized()))
    g = Geo()
    th = np.arange(segs) * (2 * math.pi / segs)
    cx, cy = superellipse_xy(th, 1.0, 1.0, n)
    for i in range(npts):
        nrm, b = frames[i]
        for k in range(segs):
            v = P[i] + nrm * (radii[i] * float(cx[k])) + b * (radii[i] * flat * float(cy[k]))
            g.verts.append(tuple(v))
    rings_n = npts if closed else npts - 1
    for i in range(rings_n):
        i2 = (i + 1) % npts
        for j in range(segs):
            a = i * segs + j
            b_ = i * segs + (j + 1) % segs
            c = i2 * segs + (j + 1) % segs
            d = i2 * segs + j
            g.faces.append((a, d, c, b_))
            g.slots.append(slot)
            g.smooth.append(True)
    if caps and not closed:
        p0 = len(g.verts)
        g.verts.append(tuple(P[0] - tangents[0] * radii[0] * 0.6))
        for j in range(segs):
            g.faces.append((p0, j, (j + 1) % segs))
            g.slots.append(slot)
            g.smooth.append(True)
        p1 = len(g.verts)
        base = (npts - 1) * segs
        g.verts.append(tuple(P[-1] + tangents[-1] * radii[-1] * 0.6))
        for j in range(segs):
            g.faces.append((p1, base + (j + 1) % segs, base + j))
            g.slots.append(slot)
            g.smooth.append(True)
    return g


def arc_points(center, radius_x, radius_y, a0, a1, steps, plane="xz"):
    """Points on an elliptical arc. plane 'xz' -> x=cos, z=sin; 'xy' -> x=cos, y=sin."""
    pts = []
    for k in range(steps + 1):
        a = a0 + (a1 - a0) * k / steps
        c, s = math.cos(a), math.sin(a)
        if plane == "xz":
            pts.append((center[0] + radius_x * c, center[1], center[2] + radius_y * s))
        elif plane == "xy":
            pts.append((center[0] + radius_x * c, center[1] + radius_y * s, center[2]))
        else:
            pts.append((center[0], center[1] + radius_x * c, center[2] + radius_y * s))
    return pts


# --------------------------------------------------------------------------
# Blender object helpers
# --------------------------------------------------------------------------


def to_mesh(name: str, g: Geo, mat_for_slot: Callable[[str], bpy.types.Material]) -> bpy.types.Mesh:
    me = bpy.data.meshes.new(name)
    me.from_pydata(g.verts, [], g.faces)
    slot_names = []
    for s in g.slots:
        if s not in slot_names:
            slot_names.append(s)
    for s in slot_names:
        me.materials.append(mat_for_slot(s))
    idx = {s: i for i, s in enumerate(slot_names)}
    me.polygons.foreach_set("material_index", [idx[s] for s in g.slots])
    me.polygons.foreach_set("use_smooth", list(g.smooth))
    me.update()
    me.validate()
    return me


def to_object(name: str, g: Geo, mat_for_slot, collection=None, parent=None, location=(0, 0, 0)) -> bpy.types.Object:
    me = to_mesh(name, g, mat_for_slot)
    ob = bpy.data.objects.new(name, me)
    ob.location = location
    (collection or bpy.context.scene.collection).objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def bvh_of(g: Geo) -> BVHTree:
    tris = []
    for f in g.faces:
        if len(f) == 3:
            tris.append(f)
        else:
            tris.append((f[0], f[1], f[2]))
            tris.append((f[0], f[2], f[3]))
    return BVHTree.FromPolygons([Vector(v) for v in g.verts], tris)


def project_to(bvh: BVHTree, origin, direction):
    """Ray-cast; returns (location, normal) or (None, None)."""
    loc, nrm, _idx, _dist = bvh.ray_cast(Vector(origin), Vector(direction).normalized())
    return loc, nrm


def text_geo(body: str, font_path: str | None, height: float, depth: float, slot: str, resolution: int = 3) -> Geo:
    """Flat extruded text in the XZ plane, centred on the origin, facing -Y."""
    cu = bpy.data.curves.new("txt", type="FONT")
    cu.body = body
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.size = 1.0
    cu.extrude = 0.0
    cu.resolution_u = resolution
    if font_path:
        cu.font = bpy.data.fonts.load(font_path, check_existing=True)
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    if not xs:
        bpy.data.objects.remove(ob)
        return Geo()
    h = max(ys) - min(ys)
    s = height / h if h > 1e-6 else 1.0
    cx = 0.5 * (max(xs) + min(xs))
    cy = 0.5 * (max(ys) + min(ys))
    g = Geo()
    # front faces at y = -depth (facing -Y), back faces omitted (they sit on the body)
    for v in me.vertices:
        g.verts.append(((v.co.x - cx) * s, -depth, (v.co.y - cy) * s))
    for p in me.polygons:
        g.faces.append(tuple(reversed(tuple(p.vertices))))
        g.slots.append(slot)
        g.smooth.append(False)
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    bpy.data.curves.remove(cu)
    return g


def text_width(g: Geo) -> float:
    if not g.verts:
        return 0.0
    xs = [v[0] for v in g.verts]
    return max(xs) - min(xs)


def wrap_onto(g: Geo, bvh: BVHTree, direction=(0, 1, 0), offset=0.004, start=-2.0) -> Geo:
    """Project every vertex along `direction` onto a surface, keeping a small offset."""
    d = Vector(direction).normalized()
    out = g.copy()
    new = []
    for v in g.verts:
        o = Vector(v)
        o = o - d * o.dot(d) + d * start
        loc, _n = project_to(bvh, o, d)
        if loc is None:
            new.append(v)
        else:
            p = loc - d * offset
            new.append((p.x, p.y, p.z))
    out.verts = new
    return out
