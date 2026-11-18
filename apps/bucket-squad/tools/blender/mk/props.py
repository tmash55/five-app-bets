"""Props: the ball (more to come: hoop, packs, coins)."""

from __future__ import annotations

import math

from . import geo
from .figure import Quality
from .geo import Geo

BALL_R = 0.17


def make_ball(qual: Quality, r: float = BALL_R) -> Geo:
    """Basketball centred on the origin: orange body with raised dark seams."""
    body = geo.ellipsoid(r, r, r, segs=qual.segs(20), rings=qual.n(12, 10), slot="ball")
    tube = r * 0.04
    n = qual.n(36, 24)
    rs = r * 1.002
    parts = [body]
    for plane in ("xy", "xz"):
        pts = geo.arc_points((0, 0, 0), rs, rs, 0, 2 * math.pi, n, plane)[:-1]
        parts.append(geo.sweep(pts, radius=tube, segs=5, closed=True, slot="seam"))
    for s in (1, -1):
        pts = []
        for k in range(n):
            t = 2 * math.pi * k / n
            x = s * (0.47 + 0.20 * math.cos(2 * t))
            rr = math.sqrt(max(0.0, 1 - x * x))
            pts.append((x * rs, rr * math.cos(t) * rs, rr * math.sin(t) * rs))
        parts.append(geo.sweep(pts, radius=tube, segs=5, closed=True, slot="seam"))
    return geo.merge(parts)
