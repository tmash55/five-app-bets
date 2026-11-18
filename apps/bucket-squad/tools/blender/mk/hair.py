"""Hair, facial hair and head accessories for the mini figure.

Hair is a shell grown off the analytic skull, plus loose pieces (ponytails,
puffs, locs...). Loose pieces that should swing in game are returned on the
auxiliary bones "hairA"/"hairB" together with their pivot.
"""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
from mathutils import Matrix, Vector

from . import geo
from .figure import EYE_X, EYE_Z, HEAD_C, HEAD_R, HZ, MOUTH_Z, Quality, skull_point, skull_radii
from .geo import Geo, Profile

D = math.radians
K = HEAD_R[0] / 0.365  # add-on pieces were sketched on a slightly smaller head

# hairline height (dz from head centre) against the angle from straight ahead
HAIRLINES = {
    "normal": [(0, 0.205), (35, 0.195), (55, 0.150), (72, 0.045), (84, 0.050), (96, 0.078), (112, 0.020), (132, -0.105), (180, -0.150)],
    "high": [(0, 0.225), (35, 0.220), (55, 0.200), (75, 0.165), (95, 0.160), (120, 0.130), (150, 0.070), (180, 0.040)],
    "low": [(0, 0.185), (35, 0.175), (55, 0.135), (72, 0.030), (84, 0.040), (96, 0.070), (112, 0.000), (132, -0.150), (180, -0.215)],
    "fringe": [(0, 0.120), (30, 0.115), (52, 0.105), (70, 0.030), (84, 0.045), (96, 0.075), (112, 0.010), (132, -0.130), (180, -0.190)],
    "round": [(0, 0.185), (35, 0.180), (60, 0.150), (80, 0.105), (96, 0.085), (112, 0.030), (132, -0.085), (180, -0.130)],
    "roundlow": [(0, 0.170), (35, 0.165), (60, 0.130), (80, 0.085), (96, 0.070), (112, 0.000), (132, -0.130), (180, -0.190)],
    "capFwd": [(0, 0.178), (40, 0.170), (75, 0.140), (100, 0.118), (140, 0.070), (180, 0.052)],
    "capBack": [(0, 0.165), (40, 0.158), (75, 0.135), (100, 0.118), (140, 0.085), (180, 0.070)],
    "beanie": [(0, 0.168), (40, 0.160), (70, 0.125), (95, 0.095), (135, 0.030), (180, 0.005)],
    "bucket": [(0, 0.150), (60, 0.140), (100, 0.130), (180, 0.120)],
    "top": [(0, 0.235), (40, 0.240), (70, 0.235), (100, 0.235), (140, 0.230), (180, 0.225)],
    "horseshoe": [(0, 0.05), (55, 0.05), (72, 0.035), (84, 0.050), (96, 0.078), (112, 0.020), (132, -0.105), (180, -0.150)],
}


def _front_angle(theta: float) -> float:
    """Unsigned angle (degrees) between a ring angle and straight ahead (-Y)."""
    a = (theta + math.pi / 2 + math.pi) % (2 * math.pi) - math.pi
    return abs(math.degrees(a))


def skull_normal(theta: float, dz: float) -> Vector:
    e = 1e-3
    rz = HEAD_R[2]
    dz = max(-rz + 0.004, min(rz - 0.004, dz))
    p = skull_point(theta, dz)
    du = skull_point(theta + e, dz) - p
    dv = skull_point(theta, min(rz - 0.002, dz + e)) - p
    n = du.cross(dv)
    if n.length < 1e-12:
        return Vector((0, 0, 1))
    n.normalize()
    # outward
    c = Vector((0, 0, HEAD_C[2]))
    if n.dot(p - c) < 0:
        n = -n
    return n


def hair_shell(
    qual: Quality,
    thickness: float | Callable[[float, float, float], float],
    hairline: str = "normal",
    rings: int = 9,
    segs: int = 28,
    slot: str = "hair",
    top_limit: float | None = None,
    lift: Callable[[float, float, float], Vector] | None = None,
    front_gap: float = 0.0,
) -> Geo:
    """Shell over the skull from the hairline up to the crown.

    thickness(theta, dz, v) -> how far the hair stands off the skull.
    top_limit: stop the shell at this dz instead of closing over the crown.
    lift(theta, dz, v) -> extra offset vector (for flat tops and sweeps).
    """
    hl = Profile(HAIRLINES[hairline])
    rz = HEAD_R[2]
    nr = qual.n(rings, 6)
    ns = qual.segs(segs)
    th = geo.ring_angles(ns)
    g = Geo()

    def thick(theta, dz, v):
        return thickness(theta, dz, v) if callable(thickness) else thickness

    top = rz - 0.012 if top_limit is None else top_limit
    for i in range(nr + 1):
        v = i / nr
        # ease so rings bunch near the hairline lip and spread over the dome
        for k in range(ns):
            theta = float(th[k])
            z0 = float(hl.sample(_front_angle(theta))[0])
            z0 = min(z0, top - 0.02)
            if i == 0:
                dz = z0
                p = skull_point(theta, dz) + skull_normal(theta, dz) * 0.0005
            else:
                vv = (i - 1) / (nr - 1)
                s = math.sin(vv * math.pi / 2) ** 0.85
                dz = z0 + (top - z0) * s
                t = thick(theta, dz, vv)
                if front_gap > 0:
                    t *= max(0.08, min(1.0, (_front_angle(theta) - front_gap) / 24.0))
                p = skull_point(theta, dz) + skull_normal(theta, dz) * t
                if lift is not None:
                    p = p + lift(theta, dz, vv)
            g.verts.append(tuple(p))
    def in_gap(j):
        mid = float(th[j]) + math.pi / ns
        return front_gap > 0 and _front_angle(mid) < front_gap

    for i in range(nr):
        for j in range(ns):
            if in_gap(j):
                continue
            a = i * ns + j
            b = i * ns + (j + 1) % ns
            c = (i + 1) * ns + (j + 1) % ns
            d = (i + 1) * ns + j
            g.faces.append((a, b, c, d))
            g.slots.append(slot)
            g.smooth.append(True)
    if top_limit is None:
        pole = len(g.verts)
        tp = thick(0.0, rz, 1.0)
        pv = Vector((0, 0, HEAD_C[2] + rz + tp))
        if lift is not None:
            pv = pv + lift(0.0, rz, 1.0)
        g.verts.append(tuple(pv))
        base = nr * ns
        for j in range(ns):
            g.faces.append((pole, base + j, base + (j + 1) % ns))
            g.slots.append(slot)
            g.smooth.append(True)
    else:
        # fold the open top edge back down to the skull
        base = nr * ns
        start = len(g.verts)
        for k in range(ns):
            theta = float(th[k])
            p = skull_point(theta, top + 0.012) + skull_normal(theta, top + 0.012) * 0.0005
            g.verts.append(tuple(p))
        for j in range(ns):
            if in_gap(j):
                continue
            g.faces.append((base + j, base + (j + 1) % ns, start + (j + 1) % ns, start + j))
            g.slots.append(slot)
            g.smooth.append(True)
    return g


def _lumps(theta: float, dz: float, f1: float, f2: float) -> float:
    return 0.5 + 0.5 * math.sin(theta * f1 + dz * 23.0) * math.sin(dz * f2 + theta * 2.0)


def _blob(center, radii, qual: Quality, slot="hair", segs=12, rings=8, n=2.0) -> Geo:
    return geo.ellipsoid(radii[0] * K, radii[1] * K, radii[2] * K, segs=qual.segs(segs), rings=qual.n(rings, 5), slot=slot, n=n).translated(*center)


def _hc(x, y, dz):
    return (x * K, y * K, HEAD_C[2] + dz * K)


def _tail(points, radii, qual: Quality, slot="hair", segs=10, flat=1.0) -> Geo:
    """Tapered tube through points (smoothly resampled)."""
    arr = np.array(points, dtype=float)
    n = len(arr)
    prof = Profile([(i / (n - 1), *arr[i], radii[i]) for i in range(n)])
    steps = qual.n(max(6, n * 3), 6)
    pts, rr = [], []
    for k in range(steps + 1):
        v = prof.sample(k / steps)
        pts.append((float(v[0]), float(v[1]), float(v[2])))
        rr.append(max(0.004, float(v[3]) * K))
    return geo.sweep(pts, radius=rr, segs=qual.segs(segs), slot=slot, flat=flat)



_SKULL_BVH = None


def _skull_bvh():
    global _SKULL_BVH
    if _SKULL_BVH is None:
        from .figure import make_skull

        _SKULL_BVH = geo.bvh_of(make_skull(Quality(2.0)))
    return _SKULL_BVH


def _on_skull(direction: Vector, lift: float = 0.0) -> Vector:
    """Point where a ray from the head centre along `direction` leaves the skull."""
    c = Vector(HEAD_C)
    d = direction.normalized()
    loc, _n = geo.project_to(_skull_bvh(), c + d * 2.0, -d)
    if loc is None:
        loc = c + d * 0.33
    return loc + d * lift


def _bumpy_blob(center, radii, qual: Quality, amp: float = 0.016, freq: float = 6.0, slot="hair", segs=20, rings=14, n=2.0, seed=0.0) -> Geo:
    """Ellipsoid with soft cloud-like lumps: reads as a sculpted mass of curls."""
    radii = (radii[0] * K, radii[1] * K, radii[2] * K)
    amp = amp * K
    g = geo.ellipsoid(radii[0], radii[1], radii[2], segs=qual.segs(segs), rings=qual.n(rings, 8), slot=slot, n=n)
    out = []
    for v in g.verts:
        d = Vector((v[0] / radii[0], v[1] / radii[1], v[2] / radii[2]))
        ln = d.length or 1.0
        d = d / ln
        k = (
            math.sin(freq * d.x + 1.3 + seed) * math.sin(freq * 0.9 * d.y + 0.7 + seed * 2) * math.sin(freq * 1.1 * d.z + 2.1)
            + 0.5 * math.sin(freq * 1.9 * d.x + 0.4) * math.sin(freq * 2.1 * d.z + 1.1 + seed)
        )
        p = Vector(v) + d * (amp * k)
        out.append((p.x + center[0], p.y + center[1], p.z + center[2]))
    g.verts = out
    return g


def _row_points(beta_deg: float, g0: float, g1: float, steps: int, lift: float):
    """A front-to-back line over the scalp at lateral angle beta."""
    pts = []
    b = math.radians(beta_deg)
    for k in range(steps + 1):
        gm = math.radians(g0 + (g1 - g0) * k / steps)
        d = Vector((math.sin(b), -math.cos(b) * math.cos(gm), math.cos(b) * math.sin(gm)))
        pts.append(tuple(_on_skull(d, lift)))
    return pts

# --------------------------------------------------------------------------
# Styles
# --------------------------------------------------------------------------

HAIR_STYLES = [
    "bald", "buzz", "fade", "short", "waves", "curly", "minifro", "afro", "bigafro", "flattop", "hightop",
    "slick", "mohawk", "frohawk", "cornrows", "spiky", "sidepart", "bowl", "horseshoe", "locs", "toplocs",
    "bun", "topknot", "ponytail", "highpony", "pigtails", "puffs", "bob", "long", "braids",
]
FACIAL_STYLES = ["mustache", "handlebar", "goatee", "soulpatch", "beard", "bigbeard", "chinstrap"]
HEAD_ACCESSORY_NAMES = ["headband", "sweatband", "bandana", "goggles", "glasses", "bow", "capFwd", "capBack", "beanie", "bucket", "freckles", "blush", "lashes", "bandaid"]



def make_hair(qual: Quality, style: str, under_hat: bool = False) -> dict:
    """Returns {"head": Geo, "hairA": (Geo, pivot), "hairB": (Geo, pivot)} (aux entries optional).

    under_hat: keep only what would show below a cap (a low shell plus any
    tails/pigtails that hang free).
    """
    out: dict = {}
    if style in ("bald", "none"):
        return out
    if under_hat:
        full = make_hair(qual, style, False)
        thin = 0.012 if style in ("buzz", "fade", "horseshoe") else 0.026
        out["head"] = hair_shell(qual, thin, hairline="normal" if style not in ("bob", "long", "pigtails") else "fringe")
        if style in ("bob", "long"):
            out["head"].add(_curtain(qual, bottom=-0.27 if style == "bob" else -0.30, flare=0.04, front_limit=64))
        for key in ("hairA", "hairB"):
            if key in full and style in ("ponytail", "pigtails", "long", "braids", "locs"):
                out[key] = full[key]
        return out

    if style == "buzz":
        out["head"] = hair_shell(qual, 0.011)
    elif style == "fade":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.012 + 0.03 * max(0.0, (dz - 0.15) / 0.2), hairline="high")
    elif style == "short":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.02 + 0.018 * _lumps(th, dz, 9, 31) * min(1, v * 3))
    elif style == "waves":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.016 + 0.006 * (0.5 + 0.5 * math.sin(dz * 110)))
    elif style == "curly":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.04 + 0.03 * _lumps(th, dz, 11, 43) * min(1, v * 4 + 0.3), rings=11)
    elif style == "afro":
        out["head"] = _bumpy_blob(_hc(0, 0.075, 0.135), (0.418, 0.405, 0.385), qual, amp=0.018, freq=6.5)
    elif style == "bigafro":
        out["head"] = _bumpy_blob(_hc(0, 0.135, 0.215), (0.50, 0.47, 0.455), qual, amp=0.022, freq=6.0, segs=24, rings=16)
    elif style == "minifro":
        out["head"] = _bumpy_blob(_hc(0, 0.06, 0.105), (0.392, 0.375, 0.345), qual, amp=0.012, freq=7.5)
    elif style == "flattop":
        out["head"] = hair_shell(qual, 0.012, hairline="high")
        deck = geo.profile_loft(Profile([(0.12, 0.300, 0.280), (0.28, 0.305, 0.285), (0.385, 0.308, 0.288)]), rings=qual.n(5, 4), segs=qual.segs(24), n=3.6, round1=0.02, slot="hair")
        out["head"].add(deck.transformed(Matrix.Scale(K, 4)).translated(0, 0.012, HEAD_C[2]))
    elif style == "hightop":
        out["head"] = hair_shell(qual, 0.012, hairline="high")
        deck = geo.profile_loft(Profile([(0.12, 0.285, 0.270), (0.32, 0.292, 0.276), (0.47, 0.285, 0.270)]), rings=qual.n(6, 4), segs=qual.segs(24), n=3.0, round1=0.04, slot="hair")
        out["head"].add(deck.transformed(Matrix.Scale(K, 4)).translated(0, 0.012, HEAD_C[2]))
    elif style == "slick":
        out["head"] = hair_shell(qual, 0.009)
        pts = _row_points(0, 22, 172, qual.n(16, 10), 0.03)
        rr = [0.05 + 0.045 * math.sin(math.pi * k / (len(pts) - 1)) ** 0.7 for k in range(len(pts))]
        out["head"].add(geo.sweep(pts, radius=rr, segs=qual.segs(10), slot="hair", flat=0.62, up=(1, 0, 0)))
    elif style == "mohawk":
        pts = _row_points(0, 30, 165, qual.n(16, 10), 0.055)
        rr = [0.07 + 0.075 * math.sin(math.pi * k / (len(pts) - 1)) ** 0.6 for k in range(len(pts))]
        out["head"] = geo.sweep(pts, radius=rr, segs=qual.segs(10), slot="hair", flat=0.36, up=(0, 0, 1) if False else None)
    elif style == "frohawk":
        out["head"] = hair_shell(qual, 0.009)
        n = 5
        for k in range(n):
            gm = 34 + (150 - 34) * k / (n - 1)
            d = Vector((0, -math.cos(math.radians(gm)), math.sin(math.radians(gm))))
            c = _on_skull(d, 0.03)
            r = 0.135 - 0.014 * abs(k - 1.6)
            out["head"].add(_bumpy_blob(tuple(c), (r * 0.82, r * 1.2, r), qual, amp=0.007, freq=5, segs=14, rings=9, seed=k))
    elif style == "cornrows":
        out["head"] = hair_shell(qual, 0.008)
        for beta in (-64, -48, -32, -16, 0, 16, 32, 48, 64):
            g1 = 196 - abs(beta) * 0.25
            pts = _row_points(beta, 26 + abs(beta) * 0.18, g1, qual.n(14, 9), 0.006)
            out["head"].add(geo.sweep(pts, radius=0.021, segs=6, slot="hair", flat=0.8))
    elif style == "spiky":
        def thick_s(th, dz, v):
            return 0.02 + 0.075 * max(0.0, _lumps(th, dz, 7, 19) - 0.35) * min(1, v * 2.5)

        out["head"] = hair_shell(qual, thick_s, rings=12, segs=36)
    elif style == "sidepart":
        def thick_sp(th, dz, v):
            p = skull_point(th, dz)
            front = max(0.0, -p.y / 0.33)
            sweep = 0.5 + 0.5 * math.tanh((p.x + 0.06) * 14)
            return 0.022 + 0.05 * front * sweep * min(1, v * 3)

        out["head"] = hair_shell(qual, thick_sp, hairline="fringe", rings=10)
    elif style == "bowl":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.03 + 0.012 * min(1, v * 4), hairline="fringe", rings=9)
    elif style == "horseshoe":
        # bald on top, hair round the sides: every old-school coach
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.022 + 0.016 * math.sin(v * math.pi), hairline="horseshoe", top_limit=0.16, rings=6, front_gap=66)
    elif style == "locs":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.022 + 0.01 * _lumps(th, dz, 14, 47))
        strands = []
        n = 15
        for i in range(n):
            # from behind one ear, round the back, to behind the other
            theta = -math.pi / 2 + math.radians(100) + math.radians(160) * i / (n - 1)
            p0 = skull_point(theta, 0.08, 0.02)
            out_dir = Vector((p0.x, p0.y, 0)).normalized()
            ln = 0.26 + 0.05 * math.sin(i * 2.3)
            p1 = p0 + out_dir * 0.07 + Vector((0, 0, -ln * 0.45))
            p2 = p0 + out_dir * 0.085 + Vector((0, 0, -ln))
            strands.append(_tail([p0, p1, p2], [0.028, 0.027, 0.022], qual, segs=8))
        out["hairA"] = (geo.merge(strands), _hc(0, 0.12, 0.05))
    elif style == "toplocs":
        # shaved sides, locs falling forward off the top
        out["head"] = hair_shell(qual, 0.012, hairline="high")
        strands = []
        rows = [(-0.12, 0.26), (0.0, 0.29), (0.12, 0.26), (-0.19, 0.17), (0.19, 0.17), (-0.07, 0.31), (0.07, 0.31)]
        for i, (x, dz) in enumerate(rows):
            for j, yy in enumerate((-0.16, -0.02, 0.12)):
                p0 = Vector((x, yy, HEAD_C[2] + dz - abs(yy) * 0.2))
                fall = Vector((x * 0.9, -0.25 if yy < 0 else (0.2 if yy > 0.05 else -0.05), 0)).normalized()
                p1 = p0 + fall * 0.09 + Vector((0, 0, 0.03))
                p2 = p0 + fall * 0.16 + Vector((0, 0, -0.07 - 0.02 * ((i + j) % 3)))
                strands.append(_tail([p0, p1, p2], [0.03, 0.028, 0.022], qual, segs=8))
        out["head"].add(geo.merge(strands))
    elif style == "bun":
        out["head"] = hair_shell(qual, 0.022, hairline="normal")
        out["head"].add(_blob(_hc(0, 0.16, 0.34), (0.105, 0.105, 0.095), qual))
        out["head"].add(geo.sweep(geo.arc_points(_hc(0, 0.14, 0.275), 0.075, 0.075, 0, 2 * math.pi, 14, "xy")[:-1], 0.016, segs=6, closed=True, slot="band"))
    elif style == "topknot":
        out["head"] = hair_shell(qual, 0.012, hairline="high")
        out["head"].add(_blob(_hc(0, 0.04, 0.385), (0.085, 0.085, 0.08), qual))
    elif style == "ponytail":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.026 + 0.012 * min(1, v * 3), hairline="normal")
        base = Vector(_hc(0, 0.30, 0.16))
        pts = [base, base + Vector((0, 0.12, 0.06)), base + Vector((0, 0.19, -0.10)), base + Vector((0, 0.15, -0.30))]
        tail = _tail(pts, [0.055, 0.075, 0.068, 0.02], qual, segs=12)
        tie = geo.sweep(geo.arc_points(tuple(base + Vector((0, 0.025, 0.012))), 0.06, 0.06, 0, 2 * math.pi, 12, "xz")[:-1], 0.02, segs=6, closed=True, slot="band")
        out["head"].add(tie)
        out["hairA"] = (tail, tuple(base))
    elif style == "highpony":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.024 + 0.01 * min(1, v * 3), hairline="normal")
        base = Vector(_hc(0, 0.17, 0.33))
        pts = [base, base + Vector((0, 0.10, 0.13)), base + Vector((0, 0.24, 0.05)), base + Vector((0, 0.27, -0.20))]
        tail = _tail(pts, [0.06, 0.085, 0.075, 0.02], qual, segs=12)
        tie = geo.sweep(geo.arc_points(tuple(base + Vector((0, 0.02, 0.025))), 0.062, 0.062, 0, 2 * math.pi, 12, "xy")[:-1], 0.022, segs=6, closed=True, slot="band")
        out["head"].add(tie)
        out["hairA"] = (tail, tuple(base))
    elif style == "pigtails":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.026 + 0.012 * min(1, v * 3), hairline="fringe")
        for side, key in ((1, "hairA"), (-1, "hairB")):
            base = Vector(_hc(side * 0.335, 0.07, 0.07))
            pts = [base, base + Vector((side * 0.11, 0.02, 0.02)), base + Vector((side * 0.15, 0.03, -0.14)), base + Vector((side * 0.11, 0.03, -0.30))]
            tail = _tail(pts, [0.05, 0.08, 0.07, 0.02], qual, segs=10)
            tie = _blob(tuple(base + Vector((side * 0.03, 0.0, 0.0))), (0.04, 0.055, 0.055), qual, slot="band", segs=8, rings=6)
            out["head"].add(tie)
            out[key] = (tail, tuple(base))
    elif style == "puffs":
        out["head"] = hair_shell(qual, 0.02, hairline="normal")
        for side, key in ((1, "hairA"), (-1, "hairB")):
            c = _hc(side * 0.25, 0.04, 0.33)
            puff = _blob(c, (0.135, 0.13, 0.125), qual, segs=14, rings=9)
            # lumpy cloud silhouette
            puff.verts = [
                tuple(Vector(v) + (Vector(v) - Vector(c)).normalized() * 0.012 * math.sin(v[0] * 60) * math.sin(v[2] * 55 + v[1] * 40))
                for v in puff.verts
            ]
            tie = geo.sweep(geo.arc_points(_hc(side * 0.185, 0.03, 0.265), 0.07, 0.07, 0, 2 * math.pi, 12, "xy")[:-1], 0.017, segs=6, closed=True, slot="band")
            out["head"].add(tie.transformed(Matrix.Translation(Vector(_hc(side * 0.185, 0.03, 0.265))) @ Matrix.Rotation(side * -0.6, 4, "Y") @ Matrix.Translation(-Vector(_hc(side * 0.185, 0.03, 0.265)))))
            out[key] = (puff, _hc(side * 0.19, 0.03, 0.26))
    elif style == "bob":
        def thick_b(th, dz, v):
            return 0.032 + 0.03 * max(0.0, 1 - (dz + 0.2) / 0.3) * min(1, v * 5 + 0.4)

        out["head"] = hair_shell(qual, thick_b, hairline="fringe", rings=10)
        # curtain down past the jaw at sides and back
        curtain = _curtain(qual, bottom=-0.27, flare=0.045, front_limit=62)
        out["head"].add(curtain)
    elif style == "long":
        out["head"] = hair_shell(qual, lambda th, dz, v: 0.03 + 0.012 * min(1, v * 3), hairline="fringe", rings=10)
        out["head"].add(_curtain(qual, bottom=-0.30, flare=0.03, front_limit=64))
        back = _curtain_tail(qual, bottom=-0.56)
        out["hairA"] = (back, _hc(0, 0.2, -0.28))
    elif style == "braids":
        out["head"] = hair_shell(qual, 0.008)
        for beta in (-64, -48, -32, -16, 0, 16, 32, 48, 64):
            pts = _row_points(beta, 26 + abs(beta) * 0.18, 150, qual.n(12, 8), 0.006)
            out["head"].add(geo.sweep(pts, radius=0.021, segs=6, slot="hair", flat=0.8))
        for side, key in ((1, "hairA"), (-1, "hairB")):
            base = Vector(_hc(side * 0.24, 0.22, -0.10))
            beads = []
            n = 6
            for i in range(n):
                f = i / (n - 1)
                c = base + Vector((side * 0.035 * math.sin(f * 2.0), 0.02 * f, -0.085 * i))
                r = 0.05 - 0.012 * f
                beads.append(_blob(tuple(c), (r, r, r * 1.05), qual, segs=8, rings=6))
            end = base + Vector((side * 0.03, 0.02, -0.085 * (n - 1) - 0.045))
            beads.append(_blob(tuple(end), (0.03, 0.03, 0.035), qual, slot="band", segs=8, rings=6))
            out[key] = (geo.merge(beads), tuple(base))
    elif style == "bandana":
        out["head"] = hair_shell(qual, 0.012)
    else:
        raise ValueError(f"unknown hair style {style}")
    return out


def _curtain(qual: Quality, bottom: float, flare: float, front_limit: float) -> Geo:
    """Hair hanging from ear height down to `bottom`, open at the face.

    A closed slab (outer face, inner face, rounded bottom and front edges) so it
    reads as a chunky mass of hair from every angle rather than a paper sheet.
    """
    ns = qual.segs(28)
    th = geo.ring_angles(ns)
    nr = qual.n(5, 4)
    g = Geo()
    cols = [k for k in range(ns) if _front_angle(float(th[k])) >= front_limit]
    # keep columns contiguous: order them going round the back
    cols.sort(key=lambda k: ((float(th[k]) + math.pi / 2) % (2 * math.pi)))
    nc = len(cols)
    top = 0.10

    def point(theta: float, f: float, off: float) -> Vector:
        dz = top + (bottom - top) * f
        ref = max(dz, -0.16)
        p = skull_point(theta, ref, off)
        p.z = HEAD_C[2] + dz
        if f > 0.8:  # ends curl in a touch
            c = Vector((0, 0, p.z))
            p = c + (p - c) * (1 - 0.12 * (f - 0.8) / 0.2)
        return p

    for layer in (0, 1):
        for i in range(nr + 1):
            f = i / nr
            for j, k in enumerate(cols):
                # thin the slab toward its front edges so they read as soft locks
                edge = min(j, nc - 1 - j) / max(1.0, nc * 0.12)
                full = 0.034 + flare * f
                off = full if layer == 0 else 0.004
                if layer == 0:
                    off = 0.012 + (full - 0.012) * min(1.0, 0.45 + 0.55 * edge)
                g.verts.append(tuple(point(float(th[k]), f, off)))
    nv = (nr + 1) * nc
    quads = []  # (face, wanted direction)
    for i in range(nr):
        for j in range(nc - 1):
            a, b, c, d = i * nc + j, i * nc + j + 1, (i + 1) * nc + j + 1, (i + 1) * nc + j
            quads.append(((a, b, c, d), "out"))
            quads.append(((nv + a, nv + b, nv + c, nv + d), "in"))
    for j in range(nc - 1):  # bottom rim
        a, b = nr * nc + j, nr * nc + j + 1
        quads.append(((a, b, nv + b, nv + a), "down"))
    for j, nb in ((0, 1), (nc - 1, nc - 2)):  # front edges
        for i in range(nr):
            a, d = i * nc + j, (i + 1) * nc + j
            quads.append(((a, d, nv + d, nv + a), ("edge", i * nc + nb)))
    for f, want in quads:
        pa, pb, pc = (Vector(g.verts[f[0]]), Vector(g.verts[f[1]]), Vector(g.verts[f[2]]))
        nrm = (pb - pa).cross(pc - pa)
        centre = sum((Vector(g.verts[v]) for v in f), Vector()) / len(f)
        if want == "out":
            ref = Vector((centre.x, centre.y, 0.0))
        elif want == "in":
            ref = -Vector((centre.x, centre.y, 0.0))
        elif want == "down":
            ref = Vector((0.0, 0.0, -1.0))
        else:
            ref = centre - Vector(g.verts[want[1]])
        g.faces.append(f if nrm.dot(ref) >= 0 else tuple(reversed(f)))
        g.slots.append("hair")
        g.smooth.append(True)
    return g


def _curtain_tail(qual: Quality, bottom: float) -> Geo:
    """The long back section of hair below the shoulders."""
    pts_c = [_hc(0, 0.25, -0.24), _hc(0, 0.29, -0.36), _hc(0, 0.27, bottom + 0.08), _hc(0, 0.22, bottom)]
    return _tail(pts_c, [0.20, 0.21, 0.17, 0.05], qual, segs=14, flat=0.42)


# --------------------------------------------------------------------------
# Facial hair
# --------------------------------------------------------------------------


def _jaw_shell(qual: Quality, thickness: float, top_rows, bottom_rows, half_angle: float = 90.0, slot="hair") -> Geo:
    """A beard: a shell along the jaw whose top edge dips under the mouth.

    top_rows/bottom_rows: [(angle from front in degrees, dz)].
    """
    ns = qual.n(26, 16)
    nr = qual.n(6, 4)
    top = Profile(top_rows)
    bot = Profile(bottom_rows)
    g = Geo()
    rz = HEAD_R[2]
    for i in range(nr + 1):
        f = i / nr
        for k in range(ns + 1):
            a = -half_angle + 2 * half_angle * k / ns
            theta = -math.pi / 2 + math.radians(a)
            z_top = float(top.sample(abs(a))[0])
            z_bot = float(bot.sample(abs(a))[0])
            dz = z_bot + (z_top - z_bot) * f
            dz = max(-rz + 0.004, dz)
            fade = min(1.0, (half_angle - abs(a)) / 14.0)
            edge = math.sin(f * math.pi) ** 0.55
            p = skull_point(theta, dz) + skull_normal(theta, dz) * (0.001 + thickness * edge * (0.25 + 0.75 * fade))
            g.verts.append(tuple(p))
    w = ns + 1
    for i in range(nr):
        for j in range(ns):
            g.faces.append((i * w + j, i * w + j + 1, (i + 1) * w + j + 1, (i + 1) * w + j))
            g.slots.append(slot)
            g.smooth.append(True)
    return g


BEARD_TOP = [(0, -0.232), (12, -0.226), (22, -0.185), (34, -0.125), (52, -0.075), (72, -0.02), (90, 0.05)]
BEARD_BOTTOM = [(0, -0.331), (25, -0.325), (50, -0.29), (72, -0.20), (90, -0.06)]


def make_facial_hair(qual: Quality, style: str, bvh) -> Geo:
    from .figure import band2d, disc2d, place_decal

    off = qual.decal_offset
    if style in (None, "none"):
        return Geo()
    if style == "mustache":
        pts = [(-0.085 + 0.17 * f, MOUTH_Z + 0.050 + 0.016 * math.sin(math.pi * f)) for f in np.linspace(0, 1, qual.n(8, 6) + 1)]
        hw = [0.012 + 0.014 * math.sin(math.pi * f) for f in np.linspace(0, 1, len(pts))]
        return place_decal(band2d(pts, hw, "hair"), bvh, 0.0, 0.0, off * 1.3)
    if style == "handlebar":
        pts = []
        for f in np.linspace(0, 1, qual.n(12, 8) + 1):
            x = -0.11 + 0.22 * f
            pts.append((x, MOUTH_Z + 0.048 + 0.02 * math.cos((f - 0.5) * math.pi) + 0.035 * abs(2 * f - 1) ** 3))
        hw = [0.010 + 0.014 * math.sin(math.pi * f) for f in np.linspace(0, 1, len(pts))]
        return place_decal(band2d(pts, hw, "hair"), bvh, 0.0, 0.0, off * 1.3)
    if style == "goatee":
        g = place_decal(disc2d(0.07, 0.052, qual.n(16, 10), 2, "hair", 2.5), bvh, 0.0, MOUTH_Z - 0.098, off * 1.3)
        pts = [(-0.075 + 0.15 * f, MOUTH_Z + 0.052 + 0.014 * math.sin(math.pi * f)) for f in np.linspace(0, 1, qual.n(8, 6) + 1)]
        g.add(place_decal(band2d(pts, 0.016, "hair"), bvh, 0.0, 0.0, off * 1.3))
        for side in (1, -1):
            g.add(place_decal(band2d([(side * 0.078, MOUTH_Z + 0.05), (side * 0.086, MOUTH_Z - 0.02), (side * 0.06, MOUTH_Z - 0.08)], 0.014, "hair"), bvh, 0.0, 0.0, off * 1.3))
        return g
    if style == "soulpatch":
        return place_decal(disc2d(0.022, 0.03, 10, 1, "hair"), bvh, 0.0, MOUTH_Z - 0.060, off * 1.3)
    if style in ("beard", "bigbeard"):
        big = style == "bigbeard"
        g = _jaw_shell(qual, 0.05 if big else 0.028, BEARD_TOP, BEARD_BOTTOM)
        if big:
            g.add(_bumpy_blob((0, -0.20, HEAD_C[2] - 0.335), (0.19, 0.12, 0.12), qual, amp=0.008, freq=6, segs=16, rings=10))
        # moustache joined to the beard down both sides of the mouth
        pts = [(-0.085 + 0.17 * f, MOUTH_Z + 0.052 + 0.014 * math.sin(math.pi * f)) for f in np.linspace(0, 1, qual.n(8, 6) + 1)]
        g.add(place_decal(band2d(pts, 0.017, "hair"), bvh, 0.0, 0.0, off * 1.3))
        for side in (1, -1):
            g.add(place_decal(band2d([(side * 0.088, MOUTH_Z + 0.05), (side * 0.102, MOUTH_Z - 0.02), (side * 0.095, MOUTH_Z - 0.075)], 0.017, "hair"), bvh, 0.0, 0.0, off * 1.3))
        return g
    if style == "chinstrap":
        return _jaw_shell(qual, 0.012, [(0, -0.285), (30, -0.262), (60, -0.165), (90, 0.03)], [(0, -0.331), (30, -0.322), (60, -0.25), (90, -0.06)])
    raise ValueError(f"unknown facial hair {style}")


# --------------------------------------------------------------------------
# Accessories
# --------------------------------------------------------------------------


def _head_ring(qual: Quality, dz_front: float, dz_back: float, grow: float, radius: float, flat: float, slot: str, segs: int = 28) -> Geo:
    pts = []
    ns = qual.segs(segs)
    for k in range(ns):
        theta = 2 * math.pi * k / ns
        fa = _front_angle(theta) / 180.0
        dz = dz_front + (dz_back - dz_front) * (0.5 - 0.5 * math.cos(fa * math.pi))
        pts.append(tuple(skull_point(theta, dz) + skull_normal(theta, dz) * grow))
    return geo.sweep(pts, radius=radius, segs=8, closed=True, slot=slot, flat=flat, up=(0, 0, 1), n=3.0)


VOLUME_STYLES = {"afro", "bigafro", "minifro"}
HATS = {"capFwd", "capBack", "beanie", "bucket"}


def _brim(qual: Quality, line: str, centre_deg: float) -> Geo:
    """A curved cap brim growing out of the hat line, centred on `centre_deg` from the front."""
    hl = Profile(HAIRLINES[line])
    nu = qual.n(12, 8)
    nv = qual.n(4, 3)
    span = math.radians(62)
    c = math.radians(centre_deg)
    g = Geo()
    for j in range(nv + 1):
        v = j / nv
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            ang = c + u * span  # from the front, signed
            theta = -math.pi / 2 + ang
            fa = abs(math.degrees((ang + math.pi) % (2 * math.pi) - math.pi))
            dz = float(hl.sample(fa)[0]) + 0.012
            base = skull_point(theta, dz) + skull_normal(theta, dz) * 0.026
            fwd = Vector((math.sin(c), -math.cos(c), 0.0))
            outv = Vector((base.x, base.y, 0)).normalized()
            dirv = (fwd * 0.75 + outv * 0.25).normalized()
            reach = 0.215 * (math.cos(u * math.pi / 2) ** 0.55)
            p = base + dirv * (reach * v) + Vector((0, 0, -0.035 * v - 0.03 * v * u * u))
            g.verts.append(tuple(p))
    w = nu + 1
    n_top = len(g.verts)
    g.verts.extend([(x, y, z - 0.014) for (x, y, z) in g.verts])

    def quad(ids, want):
        a, b_, cc = (Vector(g.verts[ids[0]]), Vector(g.verts[ids[1]]), Vector(g.verts[ids[2]]))
        nrm = (b_ - a).cross(cc - a)
        g.faces.append(ids if nrm.dot(want) > 0 else tuple(reversed(ids)))
        g.slots.append("hatBrim")
        g.smooth.append(True)

    up = Vector((0, 0, 1))
    for j in range(nv):
        for i in range(nu):
            a, b_, cc, d = j * w + i, j * w + i + 1, (j + 1) * w + i + 1, (j + 1) * w + i
            quad((a, b_, cc, d), up)
            quad((n_top + a, n_top + b_, n_top + cc, n_top + d), -up)
    fwd = Vector((math.sin(c), -math.cos(c), 0.0))
    for i in range(nu):
        a, b_ = nv * w + i, nv * w + i + 1
        mid = (Vector(g.verts[a]) + Vector(g.verts[b_])) / 2
        quad((a, b_, n_top + b_, n_top + a), fwd + Vector((mid.x, mid.y, 0)).normalized() * 0.5)
    return g


def make_accessory(qual: Quality, name: str, bvh, hair_style: str = "buzz") -> Geo:
    from .figure import band2d, disc2d, place_decal

    if name == "headband":
        if hair_style in VOLUME_STYLES:
            return _head_ring(qual, 0.098, 0.06, 0.017, 0.038, 0.42, "band")
        return _head_ring(qual, 0.175, 0.13, 0.017, 0.038, 0.42, "band")
    if name == "sweatband":
        if hair_style in VOLUME_STYLES:
            return _head_ring(qual, 0.092, 0.05, 0.02, 0.05, 0.4, "band")
        return _head_ring(qual, 0.165, 0.12, 0.02, 0.05, 0.4, "band")
    if name == "bandana":
        g = _head_ring(qual, 0.19, 0.12, 0.016, 0.05, 0.35, "band")
        knot = geo.ellipsoid(0.04, 0.03, 0.035, segs=8, rings=6, slot="band").translated(0, HEAD_R[1] + 0.03, HEAD_C[2] + 0.12)
        for side in (1, -1):
            t = _tail([_hc(0, 0.36, 0.12), _hc(side * 0.07, 0.42, 0.07), _hc(side * 0.11, 0.43, -0.03)], [0.028, 0.032, 0.012], qual, slot="band", segs=8, flat=0.35)
            g.add(t)
        g.add(knot)
        return g
    if name in ("goggles", "glasses"):
        g = Geo()
        r = 0.094 if name == "goggles" else 0.086
        tube = 0.017 if name == "goggles" else 0.011
        stand = 0.03
        for side in (1, -1):
            ring_pts = []
            n = qual.n(18, 12)
            for k in range(n):
                a = 2 * math.pi * k / n
                x = side * (EYE_X + 0.004) + r * 0.98 * math.cos(a)
                z = EYE_Z + r * 0.9 * math.sin(a)
                loc, _nrm = geo.project_to(bvh, (x, -2.0, z), (0, 1, 0))
                y = (loc.y if loc is not None else -0.3) - stand
                ring_pts.append((x, y, z))
            g.add(geo.sweep(ring_pts, radius=tube, segs=6, closed=True, slot="frame"))
        # bridge
        loc, _nrm = geo.project_to(bvh, (0.0, -2.0, EYE_Z + 0.012), (0, 1, 0))
        by = (loc.y if loc is not None else -0.33) - stand
        g.add(geo.sweep([(-0.045, by + 0.008, EYE_Z + 0.008), (0, by - 0.004, EYE_Z + 0.016), (0.045, by + 0.008, EYE_Z + 0.008)], radius=tube * 0.9, segs=6, slot="frame"))
        # strap / temples round the head
        strap = []
        ns = qual.segs(24)
        for k in range(ns + 1):
            a = 62 + (360 - 124) * k / ns
            theta = -math.pi / 2 + math.radians(a)
            p = skull_point(theta, -0.02 + 0.03 * math.sin(math.radians(a) / 2)) + skull_normal(theta, 0.0) * 0.012
            strap.append(tuple(p))
        if name == "goggles":
            g.add(geo.sweep(strap, radius=0.022, segs=6, slot="band", flat=0.35, up=(0, 0, 1)))
        else:
            g.add(geo.sweep(strap[: ns // 4], radius=0.009, segs=6, slot="frame"))
            g.add(geo.sweep(strap[-(ns // 4) :], radius=0.009, segs=6, slot="frame"))
        return g
    if name == "bow":
        g = Geo()
        c = Vector(_hc(0.17, -0.06, 0.335))
        for side in (1, -1):
            lobe = geo.ellipsoid(0.075, 0.035, 0.055, segs=10, rings=6, slot="band", n=2.6)
            lobe = lobe.transformed(Matrix.Translation(c + Vector((side * 0.07, 0, 0.0))) @ Matrix.Rotation(side * 0.35, 4, "Y"))
            g.add(lobe)
        g.add(geo.ellipsoid(0.03, 0.035, 0.035, segs=8, rings=6, slot="band").translated(*c))
        return g.transformed(Matrix.Translation(c) @ Matrix.Rotation(-0.35, 4, "Y") @ Matrix.Translation(-c))
    if name in ("capFwd", "capBack"):
        line = name
        g = hair_shell(qual, lambda th, dz, v: 0.030 + 0.016 * min(1.0, v * 3), hairline=line, slot="hat", rings=8)
        g.add(geo.ellipsoid(0.034, 0.034, 0.018, segs=8, rings=4, slot="hatBrim").translated(0, 0, HEAD_C[2] + HEAD_R[2] + 0.04))
        g.add(_brim(qual, line, 0.0 if name == "capFwd" else 180.0))
        return g
    if name == "beanie":
        g = hair_shell(qual, lambda th, dz, v: 0.040 + 0.02 * math.sin(min(1.0, v) * math.pi * 0.5), hairline="beanie", slot="hat", rings=9)
        hl = Profile(HAIRLINES["beanie"])
        pts = []
        ns = qual.segs(28)
        for k in range(ns):
            theta = 2 * math.pi * k / ns
            dz = float(hl.sample(_front_angle(theta))[0]) + 0.032
            pts.append(tuple(skull_point(theta, dz) + skull_normal(theta, dz) * 0.046))
        g.add(geo.sweep(pts, radius=0.046, segs=8, closed=True, slot="hatBrim", flat=0.55, up=(0, 0, 1), n=2.6))
        g.add(_bumpy_blob(_hc(0, 0.02, 0.43), (0.085, 0.085, 0.08), qual, amp=0.008, freq=9, slot="hatBrim", segs=12, rings=8))
        return g
    if name == "bucket":
        g = hair_shell(qual, lambda th, dz, v: 0.034 + 0.012 * min(1.0, v * 3), hairline="bucket", slot="hat", rings=8)
        hl = Profile(HAIRLINES["bucket"])
        ns = qual.segs(28)
        nr = qual.n(4, 3)
        th = geo.ring_angles(ns)
        ring = Geo()
        for i in range(nr + 1):
            f = i / nr
            for k in range(ns):
                theta = float(th[k])
                dz = float(hl.sample(_front_angle(theta))[0])
                base = skull_point(theta, dz) + skull_normal(theta, dz) * 0.034
                outv = Vector((base.x, base.y, 0)).normalized()
                ring.verts.append(tuple(base + outv * (0.15 * f) + Vector((0, 0, -0.085 * f**1.3))))
        nv = len(ring.verts)
        ring.verts.extend([(x, y, z - 0.012) for (x, y, z) in ring.verts])
        for i in range(nr):
            for j in range(ns):
                a, b, c, d = i * ns + j, i * ns + (j + 1) % ns, (i + 1) * ns + (j + 1) % ns, (i + 1) * ns + j
                ring.faces.append((a, d, c, b))
                ring.slots.append("hatBrim")
                ring.smooth.append(True)
                ring.faces.append((nv + a, nv + b, nv + c, nv + d))
                ring.slots.append("hatBrim")
                ring.smooth.append(True)
        g.add(ring)
        return g
    if name == "freckles":
        g = Geo()
        for side in (1, -1):
            for dx, dz in ((0.0, 0.0), (0.035, 0.012), (-0.03, 0.016), (0.012, -0.022)):
                g.add(place_decal(disc2d(0.008, 0.008, 6, 1, "freckle"), bvh, side * (0.205 + dx), HZ - 0.110 + dz, qual.decal_offset))
        return g
    if name == "blush":
        g = Geo()
        for side in (1, -1):
            g.add(place_decal(disc2d(0.045, 0.03, 12, 2, "blush"), bvh, side * 0.225, HZ - 0.117, qual.decal_offset * 0.8))
        return g
    if name == "lashes":
        g = Geo()
        for side in (1, -1):
            for k, (dx, dz, ang) in enumerate(((0.045, 0.050, 0.6), (0.058, 0.026, 0.25))):
                x0 = side * (EYE_X + dx)
                z0 = EYE_Z + dz
                x1 = x0 + side * 0.028 * math.cos(ang)
                z1 = z0 + 0.028 * math.sin(ang) + 0.012
                g.add(place_decal(band2d([(x0, z0), (x1, z1)], [0.008, 0.004], "eye"), bvh, 0.0, 0.0, qual.decal_offset))
        return g
    if name == "bandaid":
        g = place_decal(disc2d(0.045, 0.016, 10, 1, "bandaid", 4.0), bvh, 0.2, HZ - 0.075, qual.decal_offset, tilt=0.5)
        return g
    if name == "tooth":
        # gap-tooth grin detail handled by the mouth style; nothing here
        return Geo()
    raise ValueError(f"unknown accessory {name}")
