"""The mini figure: a chunky big-head collectible built from rigid parts.

Each part belongs to one joint ("bone"). Parts are returned in the rest pose
in figure space (feet on z=0, facing -Y); the exporter and the card renderer
re-express them relative to their bone pivot.

Every polygon carries a *slot* name (skin, jersey, hair, ...). A look maps
slots to colours, so one set of meshes dresses every player.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from mathutils import Matrix, Vector

from . import geo
from .geo import Geo, Profile

# --------------------------------------------------------------------------
# Skeleton (rest pose, figure space)
# --------------------------------------------------------------------------

UP = 0.035  # how far the whole upper body is lifted off the original sketch (longer legs)

HEAD_C = (0.0, 0.0, 1.195 + UP)  # centre of the skull
HEAD_R = (0.400, 0.350, 0.340)  # skull radii x, y, z
HZ = HEAD_C[2]
EYE_X = 0.112
EYE_Z = HZ - 0.036
BROW_GAP = 0.046
NOSE_Z = HZ - 0.108
MOUTH_Z = HZ - 0.190

SHOULDER_X = 0.268
SHOULDER_Z = 0.775 + UP
UPPER_ARM = 0.19
FOREARM = 0.155
HIP_X = 0.110
HIP_Z = 0.40 + UP
KNEE_Z = 0.245
ANKLE_Z = 0.088

BONES = [
    # name, parent, pivot
    ("root", None, (0.0, 0.0, 0.42 + UP)),
    ("torso", "root", (0.0, 0.0, 0.49 + UP)),
    ("head", "torso", (0.0, 0.0, 0.86 + UP)),
    ("eyeL", "head", (EYE_X, -0.318, EYE_Z)),
    ("eyeR", "head", (-EYE_X, -0.318, EYE_Z)),
    ("armL_up", "torso", (SHOULDER_X, 0.0, SHOULDER_Z)),
    ("armL_lo", "armL_up", (SHOULDER_X, 0.0, SHOULDER_Z - UPPER_ARM)),
    ("handL", "armL_lo", (SHOULDER_X, 0.0, SHOULDER_Z - UPPER_ARM - FOREARM)),
    ("armR_up", "torso", (-SHOULDER_X, 0.0, SHOULDER_Z)),
    ("armR_lo", "armR_up", (-SHOULDER_X, 0.0, SHOULDER_Z - UPPER_ARM)),
    ("handR", "armR_lo", (-SHOULDER_X, 0.0, SHOULDER_Z - UPPER_ARM - FOREARM)),
    ("legL_up", "root", (HIP_X, 0.0, HIP_Z)),
    ("legL_lo", "legL_up", (HIP_X, 0.0, KNEE_Z)),
    ("footL", "legL_lo", (HIP_X, 0.0, ANKLE_Z)),
    ("legR_up", "root", (-HIP_X, 0.0, HIP_Z)),
    ("legR_lo", "legR_up", (-HIP_X, 0.0, KNEE_Z)),
    ("footR", "legR_lo", (-HIP_X, 0.0, ANKLE_Z)),
]
BONE_POS = {b[0]: b[2] for b in BONES}
BONE_PARENT = {b[0]: b[1] for b in BONES}


@dataclass
class Quality:
    """Mesh density. game=1.0, card renders=2.0."""

    q: float = 1.0
    decal_offset: float = 0.006

    def n(self, base: int, minimum: int = 3, even: bool = False) -> int:
        v = max(minimum, int(round(base * self.q)))
        if even and v % 2:
            v += 1
        return v

    def segs(self, base: int) -> int:
        """Ring segment count, always a multiple of 4 so faces centre on the axes."""
        v = max(8, int(round(base * self.q / 4.0)) * 4)
        return v


# --------------------------------------------------------------------------
# Skull
# --------------------------------------------------------------------------

SKULL_N = 2.25  # horizontal squareness
SKULL_P = 2.45  # vertical squareness


def skull_radii(dz: float) -> tuple[float, float]:
    """Horizontal radii of the skull at height dz from the head centre.

    A kid's head: full cheeks low down, a slightly narrower crown.
    """
    rx, ry, rz = HEAD_R
    t = min(0.9995, abs(dz) / rz)
    k = (1.0 - t**SKULL_P) ** (1.0 / SKULL_P)
    cheek = 1.0 + 0.090 * math.exp(-(((dz + 0.130) / 0.140) ** 2))
    crown = 1.0 - 0.055 * max(0.0, dz / rz) ** 1.5
    return rx * k * cheek * crown, ry * k * crown * (1.0 + 0.03 * math.exp(-(((dz + 0.11) / 0.14) ** 2)))


def skull_rows(rings: int):
    rz = HEAD_R[2]
    rows = []
    for k in range(1, rings):
        phi = -math.pi / 2 + math.pi * k / rings
        dz = rz * math.sin(phi)
        rx, ry = skull_radii(dz)
        rows.append(dict(z=HEAD_C[2] + dz, rx=rx, ry=ry, n=SKULL_N))
    rows[0]["cap"] = rz - abs(rows[0]["z"] - HEAD_C[2])
    rows[-1]["cap"] = rz - abs(rows[-1]["z"] - HEAD_C[2])
    return rows


def skull_point(theta: float, dz: float, grow: float = 0.0) -> Vector:
    """Point on the (optionally inflated) skull. theta: 0=+X (left), -pi/2=front."""
    rx, ry = skull_radii(dz)
    x, y = geo.superellipse_xy(np.array([theta]), rx + grow, ry + grow, SKULL_N)
    return Vector((float(x[0]), float(y[0]), HEAD_C[2] + dz))


def make_skull(qual: Quality) -> Geo:
    return geo.loft(skull_rows(qual.n(16, even=True)), segs=qual.segs(28), slot="skin")


# --------------------------------------------------------------------------
# Decals (painted features that hug a surface)
# --------------------------------------------------------------------------


def disc2d(rx: float, rz: float, segs: int, rings: int, slot: str, n: float = 2.0) -> Geo:
    """Filled superellipse in the XZ plane facing -Y, tessellated for wrapping."""
    g = Geo()
    g.verts.append((0.0, 0.0, 0.0))
    th = np.arange(segs) * (2 * math.pi / segs)
    ux, uz = geo.superellipse_xy(th, 1.0, 1.0, n)
    for r in range(1, rings + 1):
        f = r / rings
        for k in range(segs):
            g.verts.append((rx * f * float(ux[k]), 0.0, rz * f * float(uz[k])))
    for k in range(segs):
        g.faces.append((0, 1 + (k + 1) % segs, 1 + k))
        g.slots.append(slot)
        g.smooth.append(True)
    for r in range(1, rings):
        a0 = 1 + (r - 1) * segs
        b0 = 1 + r * segs
        for k in range(segs):
            k2 = (k + 1) % segs
            g.faces.append((a0 + k, a0 + k2, b0 + k2, b0 + k))
            g.slots.append(slot)
            g.smooth.append(True)
    return g


def band2d(points, half_width, slot: str, round_ends: bool = True, cap_segs: int = 4) -> Geo:
    """A ribbon of constant (or per-point) half width along a polyline in the XZ plane."""
    P = [Vector((p[0], 0.0, p[1])) for p in points]
    n = len(P)
    hw = [half_width] * n if isinstance(half_width, (int, float)) else list(half_width)
    g = Geo()
    left, right = [], []
    for i in range(n):
        if i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = P[i + 1] - P[i - 1]
        t.normalize()
        nrm = Vector((-t.z, 0.0, t.x))
        left.append(P[i] + nrm * hw[i])
        right.append(P[i] - nrm * hw[i])
    for i in range(n):
        g.verts.append(tuple(left[i]))
        g.verts.append(tuple(P[i]))
        g.verts.append(tuple(right[i]))
    for i in range(n - 1):
        a = i * 3
        b = (i + 1) * 3
        for k in range(2):
            g.faces.append((a + k, a + k + 1, b + k + 1, b + k))
            g.slots.append(slot)
            g.smooth.append(True)
    if round_ends:
        for end in (0, n - 1):
            c = P[end]
            t = (P[1] - P[0]) if end == 0 else (P[-1] - P[-2])
            t.normalize()
            if end == 0:
                t = -t
            nrm = Vector((-t.z, 0.0, t.x))
            ci = len(g.verts)
            g.verts.append(tuple(c))
            arc = []
            for k in range(cap_segs + 1):
                a = -math.pi / 2 + math.pi * k / cap_segs
                p = c + (t * math.cos(a) + nrm * math.sin(a)) * hw[end]
                arc.append(len(g.verts))
                g.verts.append(tuple(p))
            for k in range(cap_segs):
                g.faces.append((ci, arc[k], arc[k + 1]))
                g.slots.append(slot)
                g.smooth.append(True)
    # make sure faces look toward -Y
    return _face_minus_y(g)


def _face_minus_y(g: Geo) -> Geo:
    out = g.copy()
    faces = []
    for f in g.faces:
        a, b, c = (Vector(g.verts[f[0]]), Vector(g.verts[f[1]]), Vector(g.verts[f[2]]))
        nrm = (b - a).cross(c - a)
        faces.append(tuple(reversed(f)) if nrm.y > 0 else f)
    out.faces = faces
    return out


def place_decal(g2d: Geo, bvh, at_x: float, at_z: float, offset: float, tilt: float = 0.0) -> Geo:
    """Move a flat XZ decal to (at_x, at_z) and wrap it onto the surface in front (-Y side)."""
    m = Matrix.Translation((at_x, 0.0, at_z)) @ Matrix.Rotation(tilt, 4, "Y")
    return geo.wrap_onto(_face_minus_y(g2d.transformed(m)), bvh, direction=(0, 1, 0), offset=offset, start=-2.0)


# --------------------------------------------------------------------------
# Face
# --------------------------------------------------------------------------

EYE_STYLES = {
    # rx, rz, squareness
    "oval": (0.037, 0.056, 2.0),
    "round": (0.045, 0.049, 2.0),
    "wide": (0.050, 0.042, 2.2),
    "tall": (0.033, 0.064, 2.2),
}

BROW_STYLES = {
    # inner dz, outer dz, half width, length
    "calm": (0.000, 0.004, 0.0100, 0.078),
    "fierce": (-0.022, 0.014, 0.0115, 0.084),
    "raised": (0.018, 0.006, 0.0095, 0.078),
    "thick": (-0.008, 0.008, 0.0160, 0.088),
}

MOUTH_STYLES = ["smile", "bigsmile", "grin", "tooth", "smirk", "open", "flat"]
NOSE_STYLES = ["button", "wide", "small", "none"]


def make_eyes(qual: Quality, bvh, style: str = "oval") -> dict:
    rx, rz, n = EYE_STYLES[style]
    out = {}
    for side, bone in ((1, "eyeL"), (-1, "eyeR")):
        ex, ez = side * EYE_X, EYE_Z
        eye = place_decal(disc2d(rx, rz, qual.n(18, 10), qual.n(3, 2), "eye", n), bvh, ex, ez, qual.decal_offset)
        # one small painted catch light, up and to the side
        hi1 = place_decal(
            disc2d(rx * 0.30, rz * 0.24, qual.n(10, 8), 1, "eyeShine"),
            bvh,
            ex - 0.011,
            ez + rz * 0.42,
            qual.decal_offset * 1.9,
        )
        out[bone] = geo.merge([eye, hi1])
    return out


def make_brows(qual: Quality, bvh, style: str = "calm", eye_style: str = "oval") -> Geo:
    inner_dz, outer_dz, hw, length = BROW_STYLES[style]
    rz = EYE_STYLES[eye_style][1]
    parts = []
    for side in (1, -1):
        x0 = side * (EYE_X - length / 2)
        x1 = side * (EYE_X + length / 2)
        z = EYE_Z + rz + BROW_GAP
        steps = qual.n(5, 4)
        pts = []
        for k in range(steps + 1):
            f = k / steps
            arch = 0.012 * math.sin(math.pi * f)
            pts.append((x0 + (x1 - x0) * f, z + inner_dz + (outer_dz - inner_dz) * f + arch))
        hws = [hw * (0.8 + 0.2 * math.sin(math.pi * (k / steps))) for k in range(steps + 1)]
        parts.append(place_decal(band2d(pts, hws, "brow"), bvh, 0.0, 0.0, qual.decal_offset))
    return geo.merge(parts)


def make_nose(qual: Quality, bvh, style: str = "button") -> Geo:
    """A soft round kid nose that actually sticks out, so profiles read as a cartoon."""
    if style == "none":
        return Geo()
    rx, ry, rz = {"button": (0.044, 0.040, 0.036), "wide": (0.056, 0.040, 0.034), "small": (0.032, 0.032, 0.028)}[style]
    loc, _n = geo.project_to(bvh, (0.0, -2.0, NOSE_Z), (0, 1, 0))
    y = (loc.y if loc is not None else -HEAD_R[1]) + ry * 0.42
    return geo.ellipsoid(rx, ry, rz, segs=qual.segs(12), rings=qual.n(8, 6), slot="nose").translated(0.0, y, NOSE_Z)


def _smile_pts(width: float, depth: float, z: float, steps: int, lift: float = 0.0):
    pts = []
    for k in range(steps + 1):
        f = k / steps
        x = -width / 2 + width * f
        pts.append((x, z + depth * (4 * (f - 0.5) ** 2) + lift * (f - 0.5)))
    return pts


def make_mouth(qual: Quality, bvh, style: str = "smile") -> Geo:
    z = MOUTH_Z
    off = qual.decal_offset
    steps = qual.n(10, 6)
    if style == "smile":
        g = place_decal(band2d(_smile_pts(0.17, 0.040, z - 0.012, steps), 0.0105, "mouth"), bvh, 0.0, 0.0, off)
        return g
    if style == "bigsmile":
        # closed wide smile with little cheek ticks at each end
        g = place_decal(band2d(_smile_pts(0.23, 0.058, z - 0.02, steps), 0.011, "mouth"), bvh, 0.0, 0.0, off)
        for side in (1, -1):
            g.add(place_decal(band2d([(side * 0.108, z + 0.022), (side * 0.128, z + 0.052)], [0.010, 0.006], "mouth"), bvh, 0.0, 0.0, off))
        return g
    if style in ("grin", "tooth"):
        # open happy mouth: dark D shape, pink tongue, white teeth along the top
        outer = disc2d(0.090, 0.060, qual.n(20, 12), 2, "mouth", 2.3)
        outer.verts = [(x, y, zz if zz < 0 else zz * 0.28) for (x, y, zz) in outer.verts]
        tongue = disc2d(0.050, 0.026, qual.n(14, 10), 1, "tongue", 2.2)
        g = geo.merge(
            [
                place_decal(outer, bvh, 0.0, z + 0.018, off),
                place_decal(tongue, bvh, 0.0, z - 0.020, off * 1.6),
            ]
        )
        if style == "grin":
            teeth = disc2d(0.070, 0.0125, qual.n(14, 10), 1, "teeth", 3.0)
            g.add(place_decal(teeth, bvh, 0.0, z + 0.021, off * 1.9))
        else:
            # one proud front tooth
            g.add(place_decal(disc2d(0.019, 0.017, 8, 1, "teeth", 3.2), bvh, -0.012, z + 0.018, off * 1.9))
        return g
    if style == "smirk":
        pts = [(-0.06 + 0.13 * f, z - 0.008 + 0.04 * f * f) for f in np.linspace(0, 1, steps + 1)]
        return place_decal(band2d(pts, 0.0105, "mouth"), bvh, 0.0, 0.0, off)
    if style == "open":
        g = place_decal(disc2d(0.042, 0.048, qual.n(14, 10), 2, "mouth"), bvh, 0.0, z, off)
        g.add(place_decal(disc2d(0.026, 0.02, 10, 1, "tongue"), bvh, 0.0, z - 0.02, off * 1.6))
        return g
    if style == "flat":
        pts = [(-0.055 + 0.11 * f, z + 0.005 * math.sin(math.pi * f)) for f in np.linspace(0, 1, steps + 1)]
        return place_decal(band2d(pts, 0.010, "mouth"), bvh, 0.0, 0.0, off)
    raise ValueError(style)


def make_ears(qual: Quality) -> Geo:
    parts = []
    for side in (1, -1):
        e = geo.ellipsoid(0.056, 0.074, 0.102, segs=qual.segs(10), rings=qual.n(6, 4), slot="skin")
        rx, _ry = skull_radii(-0.07)
        parts.append(e.translated(side * (rx + 0.012), 0.030, HEAD_C[2] - 0.07))
        inner = geo.ellipsoid(0.022, 0.042, 0.060, segs=8, rings=qual.n(4, 4), slot="earIn")
        parts.append(inner.translated(side * (rx + 0.052), 0.014, HEAD_C[2] - 0.07))
    return geo.merge(parts)


# --------------------------------------------------------------------------
# Body
# --------------------------------------------------------------------------

TORSO_PROFILE = Profile(
    [
        (0.455 + UP, 0.196, 0.142),
        (0.54 + UP, 0.212, 0.158),
        (0.66 + UP, 0.216, 0.160),
        (0.76 + UP, 0.210, 0.150),
        (0.815 + UP, 0.190, 0.138),
        (0.850 + UP, 0.128, 0.110),
        (0.872 + UP, 0.092, 0.088),
    ]
)
TORSO_N = 2.7


def torso_radii(z: float):
    v = TORSO_PROFILE.sample(z)
    return float(v[0]), float(v[1])


def make_torso(qual: Quality) -> Geo:
    segs = qual.segs(20)
    stripe = max(1, segs // 20)

    def z_slot(z, ang):
        if z > 0.862 + UP:
            return "skin"
        if z > 0.838 + UP:
            return "jerseyTrim"
        j = int(round(ang / (2 * math.pi / segs))) % segs
        if z < 0.80 + UP and (min(j, segs - j) < stripe or abs(j - segs // 2) < stripe):
            return "jerseyTrim"
        return "jersey"

    return geo.profile_loft(TORSO_PROFILE, rings=qual.n(11, 8), segs=segs, n=TORSO_N, z_slot=z_slot, round1=0.01)


def make_armhole_trim(qual: Quality) -> Geo:
    """A trim ring round each arm hole, laid on the torso surface."""
    bvh = geo.bvh_of(geo.profile_loft(TORSO_PROFILE, rings=24, segs=40, n=TORSO_N, round1=0.01))
    parts = []
    n = qual.n(16, 10)
    for side in (1, -1):
        pts = []
        for k in range(n):
            a = 2 * math.pi * k / n
            y = 0.080 * math.cos(a)
            z = SHOULDER_Z - 0.012 + 0.092 * math.sin(a)
            loc, _nrm = geo.project_to(bvh, (side * 1.0, y, z), (-side, 0, 0))
            x = loc.x if loc is not None else side * 0.1
            pts.append((x + side * 0.004, y, z))
        parts.append(geo.sweep(pts, radius=0.0115, segs=6, closed=True, slot="jerseyTrim"))
    return geo.merge(parts)


NUMBER_LAYOUT = {
    # where: (height, x centre, back?)
    "f1": (0.118, 0.0, False),
    "f2l": (0.110, -0.047, False),
    "f2r": (0.110, 0.047, False),
    "b1": (0.165, 0.0, True),
    "b2l": (0.150, 0.064, True),
    "b2r": (0.150, -0.064, True),
}

_TORSO_BVH = None


def _torso_bvh():
    global _TORSO_BVH
    if _TORSO_BVH is None:
        _TORSO_BVH = geo.bvh_of(geo.profile_loft(TORSO_PROFILE, rings=26, segs=48, n=TORSO_N, round1=0.01))
    return _TORSO_BVH


def make_digit(qual: Quality, digit: str, where: str, font_path: str | None) -> Geo:
    """One jersey digit wrapped onto the chest or back. `where` is a NUMBER_LAYOUT key."""
    height, cx, back = NUMBER_LAYOUT[where]
    g = geo.text_geo(digit, font_path, height, 0.0, "number", resolution=qual.n(2, 2))
    if not g.faces:
        return g
    if back:
        g = g.transformed(Matrix.Rotation(math.pi, 4, "Z")).translated(cx, 0.0, 0.655 + UP)
        return geo.wrap_onto(g, _torso_bvh(), direction=(0, -1, 0), offset=qual.decal_offset, start=-2.0)
    g = g.translated(cx, 0.0, 0.672 + UP)
    return geo.wrap_onto(g, _torso_bvh(), direction=(0, 1, 0), offset=qual.decal_offset, start=-2.0)


def number_parts(number: str) -> list:
    """[(digit, where)] for a 1 or 2 digit jersey number."""
    n = str(number)[:2]
    if len(n) == 1:
        return [(n, "f1"), (n, "b1")]
    return [(n[0], "f2l"), (n[1], "f2r"), (n[0], "b2l"), (n[1], "b2r")]


def make_number(qual: Quality, number: str, font_path: str | None) -> Geo:
    """Chest and back numbers wrapped onto the torso."""
    return geo.merge([make_digit(qual, d, where, font_path) for d, where in number_parts(number)])


def make_pelvis(qual: Quality) -> Geo:
    prof = Profile([(0.392 + UP, 0.172, 0.114), (0.425 + UP, 0.210, 0.152), (0.455 + UP, 0.216, 0.160), (0.50 + UP, 0.204, 0.150)])

    def z_slot(z, ang):
        return "shortsTrim" if z > 0.462 + UP else "shorts"

    return geo.profile_loft(prof, rings=qual.n(6, 5), segs=qual.segs(20), n=2.7, z_slot=z_slot, round0=0.02, round1=0.005)


def make_thigh(qual: Quality, side: int, short: bool = False) -> Geo:
    """Shorts leg + the bit of leg under it. short=True is the old-school cut."""
    hem = (0.325 if short else 0.243)
    segs = qual.segs(12)
    prof = Profile([(hem, 0.120, 0.138), (0.5 * (hem + HIP_Z), 0.115, 0.140), (HIP_Z + 0.012, 0.108, 0.140)])

    def z_slot(z, ang):
        j = int(round(ang / (2 * math.pi / segs))) % segs
        outer = 0 if side > 0 else segs // 2
        if z < hem + 0.022:
            return "shortsTrim"
        if j == outer:
            return "shortsTrim"
        return "shorts"

    shorts = geo.profile_loft(prof, rings=qual.n(5, 4), segs=segs, n=2.5, z_slot=z_slot, round1=0.03)
    # close the hem underneath so you never see inside the shorts
    hem_cap = geo.loft([dict(z=hem, rx=0.120, ry=0.136, n=2.5), dict(z=hem + 0.004, rx=0.07, ry=0.07, n=2.0)], segs=segs, cap0=False, cap1=False, slot="shortsShadow")
    hem_cap.faces = [tuple(reversed(f)) for f in hem_cap.faces]
    leg = geo.capsule(0.078, 0.074, HIP_Z - KNEE_Z, segs=qual.segs(10), rings=qual.n(3, 2), slot="skin").translated(0, 0, HIP_Z)
    g = geo.merge([shorts, hem_cap, leg])
    return g.translated(side * HIP_X, 0.0, 0.0)


def make_shin(qual: Quality, side: int) -> Geo:
    length = KNEE_Z - ANKLE_Z + 0.02

    def z_slot(z, ang):
        # z is relative to the knee here
        if z < -0.098:
            return "sock"
        if z < -0.050:
            return "sockHigh"
        return "kneeL" if side > 0 else "kneeR"

    g = geo.capsule(0.076, 0.066, length, segs=qual.segs(10), rings=qual.n(5, 4), z_slot=z_slot)
    return g.translated(side * HIP_X, 0.0, KNEE_Z)


def make_shoe(qual: Quality, side: int) -> Geo:
    """A chunky high-top: rubber toe, colour stripe, padded collar, flared midsole."""
    rows_src = [
        # along (heel->toe), half width, half height
        (0.000, 0.060, 0.048),
        (0.028, 0.090, 0.070),
        (0.100, 0.101, 0.078),
        (0.175, 0.104, 0.066),
        (0.245, 0.100, 0.055),
        (0.300, 0.078, 0.044),
    ]
    prof = Profile([(r[0], r[1], r[2]) for r in rows_src])
    rings = qual.n(10, 8)
    segs = qual.segs(12)
    rows = []
    for k in range(rings):
        t = prof.t0 + (prof.t1 - prof.t0) * k / (rings - 1)
        v = prof.sample(t)
        rows.append(dict(z=float(t), rx=float(v[0]), ry=float(v[1]), n=3.2, cy=float(v[1])))
    rows[0]["cap"] = 0.012
    rows[-1]["cap"] = 0.032
    body = geo.loft(rows, segs=segs, slot="shoe")
    slots = []
    for f in body.faces:
        c = [sum(body.verts[i][k] for i in f) / len(f) for k in range(3)]
        along, height = c[2], c[1]
        if height < 0.034:
            slots.append("sole")
        elif along > 0.238:
            slots.append("sole")
        elif 0.118 < along < 0.172 and height < 0.115:
            slots.append("shoeAccent")
        else:
            slots.append("shoe")
    body.slots = slots
    # flare the midsole so the shoe sits on a visible rubber platform
    mid_along = 0.15
    flared = []
    for (x, y, z) in body.verts:
        if y < 0.036:
            k = 1.0 + 0.085 * (1.0 - y / 0.036) ** 0.5
            flared.append((x * k, y, mid_along + (z - mid_along) * (1.0 + (k - 1.0) * 0.5)))
        else:
            flared.append((x, y, z))
    body.verts = flared
    # loft space (x, y=up, z=along) -> figure space (x, y=-along+heel, z=up)
    heel_y = 0.094
    m = Matrix(((1, 0, 0, 0), (0, 0, -1, heel_y), (0, 1, 0, 0), (0, 0, 0, 1)))
    body = body.transformed(m)
    body.verts = [(x, y, max(0.0, z)) for (x, y, z) in body.verts]
    collar_prof = Profile([(0.105, 0.082, 0.090), (0.152, 0.090, 0.098), (0.180, 0.083, 0.091)])

    def collar_slot(z, ang):
        return "shoeAccent" if z > 0.160 else "shoe"

    collar = geo.profile_loft(collar_prof, rings=qual.n(4, 3), segs=segs, n=2.4, z_slot=collar_slot, round1=0.012).translated(0, 0.012, 0)
    # a little lace panel on the instep
    lace = geo.ellipsoid(0.048, 0.062, 0.014, segs=qual.segs(8), rings=4, slot="sole", n=2.6).transformed(
        Matrix.Translation((0, -0.062, 0.139)) @ Matrix.Rotation(math.radians(-24), 4, "X")
    )
    g = geo.merge([body, collar, lace])
    return g.translated(side * HIP_X, 0.0, 0.0)


def make_upper_arm(qual: Quality, side: int) -> Geo:
    slot = "sleeveUpL" if side > 0 else "sleeveUpR"
    cuff = "cuffL" if side > 0 else "cuffR"

    def z_slot(z, ang):
        return cuff if z < -UPPER_ARM + 0.075 else slot

    g = geo.capsule(0.080, 0.072, UPPER_ARM, segs=qual.segs(10), rings=qual.n(5, 4), z_slot=z_slot)
    return g.translated(side * SHOULDER_X, 0.0, SHOULDER_Z)


def make_forearm(qual: Quality, side: int) -> Geo:
    lo = "sleeveLoL" if side > 0 else "sleeveLoR"
    wrist = "wristL" if side > 0 else "wristR"

    def z_slot(z, ang):
        return wrist if z < -FOREARM + 0.052 else lo

    g = geo.capsule(0.070, 0.062, FOREARM, segs=qual.segs(10), rings=qual.n(5, 4), z_slot=z_slot)
    return g.translated(side * SHOULDER_X, 0.0, SHOULDER_Z - UPPER_ARM)


def make_hand(qual: Quality, side: int) -> Geo:
    palm = geo.ellipsoid(0.066, 0.055, 0.080, segs=qual.segs(10), rings=qual.n(6, 5), slot="skin", n=2.3).translated(0, 0, -0.060)
    thumb = geo.ellipsoid(0.028, 0.032, 0.042, segs=8, rings=qual.n(4, 4), slot="skin")
    thumb = thumb.transformed(Matrix.Translation((-side * 0.034, -0.044, -0.040)) @ Matrix.Rotation(side * 0.5, 4, "Y"))
    g = geo.merge([palm, thumb])
    wrist_z = SHOULDER_Z - UPPER_ARM - FOREARM
    return g.translated(side * SHOULDER_X, 0.0, wrist_z)


def make_neck(qual: Quality) -> Geo:
    return geo.loft(
        [dict(z=0.845 + UP, rx=0.092, ry=0.088), dict(z=0.905 + UP, rx=0.088, ry=0.084)],
        segs=qual.segs(12),
        slot="skin",
        cap0=False,
    )
