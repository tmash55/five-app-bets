"""Draws what the phone shows before the game is running: the app icon and the loading picture.

    python tools/brand/make_brand.py            # writes assets/images/*.png

`src/theme/brand.json` holds the two wall colours the app's config needs before any code runs
(a test keeps them equal to the theme) and how wide the loading picture is drawn.

Both are the arcade's hoop sign: a backboard, a ball about to drop, the rim and its net, bent
out of neon tube. The loading picture has the game's name lit under it.

Every colour is read from `src/theme/arcade.ts` and the lettering is the same font file the app
loads, so these pictures follow the theme instead of keeping their own copy of it. Needs Pillow.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "images"
THEME = (ROOT / "src" / "theme" / "arcade.ts").read_text()
FONT = ROOT / "node_modules" / "@expo-google-fonts" / "bungee" / "400Regular" / "Bungee_400Regular.ttf"

# Everything is drawn twice as big as it is saved, then shrunk: smooth tubes without jagged edges.
SS = 2
SIDE = 1024

RGB = tuple[int, int, int]


# --- the theme --------------------------------------------------------------


def _rgb(hex_colour: str) -> RGB:
    n = int(hex_colour[1:7], 16)
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


def night(name: str) -> RGB:
    """One colour of the room, by its name in the theme."""
    body = re.search(r"export const night = \{(.*?)\n\} as const", THEME, re.S)
    found = body and re.search(r"\b%s: '(#[0-9A-Fa-f]{6})'" % name, body.group(1))
    if not found:
        raise SystemExit(f"arcade.ts has no night.{name}")
    return _rgb(found.group(1))


def tube(name: str) -> tuple[RGB, RGB]:
    """A neon tube by name: the colour of its gas, and the near-white it lights."""
    body = re.search(r"export const tube = \{(.*?)\n\} as const", THEME, re.S)
    found = body and re.search(r"\b%s: \{ glass: '(#[0-9A-Fa-f]{6})', tint: '(#[0-9A-Fa-f]{6})'" % name, body.group(1))
    if not found:
        raise SystemExit(f"arcade.ts has no tube.{name}")
    return _rgb(found.group(1)), _rgb(found.group(2))


def lattice_alpha() -> float:
    found = re.search(r"lattice: 'rgba\(255, 255, 255, ([0-9.]+)\)'", THEME)
    if not found:
        raise SystemExit("arcade.ts has no night.lattice")
    return float(found.group(1))


# --- lines ------------------------------------------------------------------

Point = tuple[float, float]


def arc(cx: float, cy: float, rx: float, ry: float, a0: float, a1: float, steps: int = 48) -> list[Point]:
    """Part of an ellipse, angles in degrees, clockwise from three o'clock."""
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / steps)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]


def round_rect(x: float, y: float, w: float, h: float, r: float) -> list[Point]:
    pts: list[Point] = []
    pts += arc(x + w - r, y + r, r, r, -90, 0, 12)
    pts += arc(x + w - r, y + h - r, r, r, 0, 90, 12)
    pts += arc(x + r, y + h - r, r, r, 90, 180, 12)
    pts += arc(x + r, y + r, r, r, 180, 270, 12)
    return pts + [pts[0]]


def bow(a: Point, b: Point, bend: float, steps: int = 32) -> list[Point]:
    """A line from a to b pushed sideways in the middle by `bend`."""
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy) or 1
    cx, cy = mx - dy / length * bend * 2, my + dx / length * bend * 2
    out = []
    for i in range(steps + 1):
        t = i / steps
        out.append(((1 - t) ** 2 * a[0] + 2 * t * (1 - t) * cx + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * cy + t * t * b[1]))
    return out


class Sign:
    """Tubes of one colour, drawn in the sign's own units and placed on the picture by `at` and `k`."""

    def __init__(self, size: int, at: Point, k: float):
        self.body = Image.new("L", (size, size), 0)
        self.hot = Image.new("L", (size, size), 0)
        self._body = ImageDraw.Draw(self.body)
        self._hot = ImageDraw.Draw(self.hot)
        self.at, self.k = at, k

    def line(self, pts: list[Point], width: float) -> None:
        """A tube along the points, with round ends and round corners (stamped as overlapping dots)."""
        k, (ox, oy) = self.k, self.at
        w = width * k
        dots: list[Point] = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            # close enough together that even the thin white-hot middle comes out smooth
            n = max(1, int(math.hypot(x1 - x0, y1 - y0) * k / max(1.0, w / 16)))
            dots += [(ox + (x0 + (x1 - x0) * i / n) * k, oy + (y0 + (y1 - y0) * i / n) * k) for i in range(n)]
        dots.append((ox + pts[-1][0] * k, oy + pts[-1][1] * k))
        for draw, r in ((self._body, w / 2), (self._hot, w * 0.19)):
            for x, y in dots:
                draw.ellipse([x - r, y - r, x + r, y + r], fill=255)


def _wash(size: tuple[int, int], colour: RGB, alpha: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", size, colour + (0,))
    layer.putalpha(alpha)
    return layer


def light(mask: Image.Image, colour: RGB, reach: float) -> Image.Image:
    """The light a tube throws: a wide soft one and a tight bright one."""
    out = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    # a thin line loses its strength when it is blurred wide, so each pass is turned back up
    for radius, gain, alpha in ((reach, 4.2, 0.62), (reach * 0.42, 2.4, 0.8), (reach * 0.14, 1.4, 0.9)):
        blurred = mask.filter(ImageFilter.GaussianBlur(radius))
        out = Image.alpha_composite(out, _wash(mask.size, colour, blurred.point(lambda v, g=gain, a=alpha: min(255, int(v * g)) * a)))
    return out


def lit(signs: list[tuple[Sign, RGB, RGB]], size: int, reach: float) -> Image.Image:
    """All the tubes of a sign, lit: every tube's light first, so no light falls over a neighbour's glass."""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for sign, glass, _ in signs:
        out = Image.alpha_composite(out, light(sign.body, glass, reach))
    for sign, glass, _ in signs:
        out = Image.alpha_composite(out, _wash((size, size), glass, sign.body))
    for sign, _, tint in signs:
        out = Image.alpha_composite(out, _wash((size, size), tint, sign.hot.filter(ImageFilter.GaussianBlur(max(1.0, reach * 0.03)))))
    return out


# --- the hoop sign ----------------------------------------------------------

# The sign is drawn in a box 92 wide and 96 tall, the same box as the sign on the home page's wall.
HOOP_W, HOOP_H = 92.0, 96.0


def hoop(size: int, at: Point, k: float, reach: float, bold: float = 1.0) -> Image.Image:
    """The sign. `bold` fattens every tube, for a picture that is seen small."""
    cyan, pink, orange = Sign(size, at, k), Sign(size, at, k), Sign(size, at, k)
    # the backboard
    cyan.line(round_rect(6, 6, 80, 54, 6), 3 * bold)
    # the ball, sitting just above the rim
    cx, cy, r = 46.0, 40.5, 15.5
    orange.line(arc(cx, cy, r, r, 0, 360, 72), 3 * bold)
    orange.line([(cx, cy - r), (cx, cy + r)], 2 * bold)
    orange.line(bow((cx - r, cy), (cx + r, cy), -2.2), 2 * bold)
    orange.line(bow((cx - r * 0.72, cy - r * 0.69), (cx - r * 0.72, cy + r * 0.69), -5.4), 2 * bold)
    orange.line(bow((cx + r * 0.72, cy - r * 0.69), (cx + r * 0.72, cy + r * 0.69), 5.4), 2 * bold)
    # the rim and its net
    pink.line([(27, 61.5), (65, 61.5)], 4 * bold)
    for a, b in (((31, 65), (36, 89)), ((61, 65), (56, 89)), ((41, 65), (43, 89)), ((51, 65), (49, 89)), ((34, 77.5), (58, 77.5))):
        pink.line([a, b], 2.2 * bold)
    return lit([(cyan, *tube("cyan")), (orange, *tube("orange")), (pink, *tube("pink"))], size, reach)


# --- the name ---------------------------------------------------------------


def word(size: int, text: str, centre: Point, height: float, gap: float, glass: RGB, tint: RGB, reach: float) -> Image.Image:
    """One lit word, its capitals `height` tall and centred on `centre`."""
    font = ImageFont.truetype(str(FONT), 200)
    # the capitals' own height in this font, to size the word by what is seen
    top, bottom = font.getbbox("B")[1], font.getbbox("B")[3]
    font = ImageFont.truetype(str(FONT), max(8, round(200 * height / (bottom - top))))
    widths = [font.getlength(ch) for ch in text]
    total = sum(widths) + gap * (len(text) - 1)
    box = font.getbbox("B")
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    x = centre[0] - total / 2
    y = centre[1] - (box[1] + box[3]) / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=255)
        x += w + gap
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # fat letters keep their strength when blurred, so their light needs little turning up
    for radius, gain, alpha in ((reach, 1.5, 0.6), (reach * 0.45, 1.25, 0.8), (reach * 0.16, 1.0, 0.9)):
        blurred = mask.filter(ImageFilter.GaussianBlur(radius))
        out = Image.alpha_composite(out, _wash((size, size), glass, blurred.point(lambda v, g=gain, a=alpha: min(255, int(v * g)) * a)))
    return Image.alpha_composite(out, _wash((size, size), tint, mask))


# --- the wall ---------------------------------------------------------------


def wall(size: int, pitch: float) -> Image.Image:
    """The arcade's wall: dark at the top, indigo lower down, quilted with thin diagonal lines."""
    top, mid, bottom = night("wallTop"), night("wallMid"), night("wallBottom")
    column = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        a, b, u = (top, mid, t / 0.62) if t < 0.62 else (mid, bottom, (t - 0.62) / 0.38)
        column.putpixel((0, y), tuple(round(a[i] + (b[i] - a[i]) * u) for i in range(3)))
    out = column.resize((size, size)).convert("RGBA")
    lines = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(lines)
    step = pitch * math.sqrt(2)
    x = -float(size)
    while x < size * 2:
        draw.line([(x, 0), (x + size, size)], fill=255, width=max(1, SS))
        draw.line([(x, 0), (x - size, size)], fill=255, width=max(1, SS))
        x += step
    return Image.alpha_composite(out, _wash((size, size), (255, 255, 255), lines.point(lambda v: v * lattice_alpha())))


def bloom(size: int, centre: Point, radius: float, colour: RGB, alpha: float) -> Image.Image:
    """A soft round light on the wall behind the sign."""
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([centre[0] - radius * 0.5, centre[1] - radius * 0.5, centre[0] + radius * 0.5, centre[1] + radius * 0.5], fill=255)
    return _wash((size, size), colour, mask.filter(ImageFilter.GaussianBlur(radius * 0.36)).point(lambda v: v * alpha))


# --- the pictures -----------------------------------------------------------


def _sign_at(size: int, centre: Point, height: float, bold: float = 1.0) -> Image.Image:
    """The hoop sign, `height` tall, centred on `centre`."""
    k = height / HOOP_H
    return hoop(size, (centre[0] - HOOP_W * k / 2, centre[1] - HOOP_H * k / 2), k, reach=k * 5.2, bold=bold)


def icon() -> Image.Image:
    """The app icon: the sign on the wall, filling the square. Its tubes are fat, because an icon is seen small."""
    s = SIDE * SS
    out = wall(s, pitch=34 * SS)
    out = Image.alpha_composite(out, bloom(s, (s * 0.5, s * 0.46), s * 0.8, tube("violet")[0], 0.26))
    out = Image.alpha_composite(out, _sign_at(s, (s * 0.5, s * 0.512), s * 0.78, bold=1.5))
    return out.resize((SIDE, SIDE), Image.LANCZOS).convert("RGB")


def background() -> Image.Image:
    """Android's icon is two layers: this is the wall behind the sign."""
    s = SIDE * SS
    out = wall(s, pitch=34 * SS)
    out = Image.alpha_composite(out, bloom(s, (s * 0.5, s * 0.47), s * 0.62, tube("violet")[0], 0.26))
    return out.resize((SIDE, SIDE), Image.LANCZOS).convert("RGB")


def foreground() -> Image.Image:
    """Android's icon: the sign alone, inside the middle two thirds, which is all a round mask is sure to show."""
    s = SIDE * SS
    return _sign_at(s, (s * 0.5, s * 0.508), s * 0.5, bold=1.5).resize((SIDE, SIDE), Image.LANCZOS)


def loading() -> Image.Image:
    """
    The loading picture: the sign with BUCKET SQUAD lit under it, on nothing (the wall colour is set
    in the app's config). The sign and all of its light stay inside a circle 0.9 of the side across:
    Android shows a loading picture through a round window, and brand.json's width is chosen to fit it.
    """
    s = SIDE * SS
    out = _sign_at(s, (s * 0.5, s * 0.325), s * 0.43, bold=1.25)
    pink, cyan = tube("pink"), tube("cyan")
    out = Image.alpha_composite(out, word(s, "BUCKET", (s * 0.5, s * 0.64), s * 0.098, s * 0.006, pink[0], pink[1], s * 0.03))
    out = Image.alpha_composite(out, word(s, "SQUAD", (s * 0.5, s * 0.77), s * 0.098, s * 0.012, cyan[0], cyan[1], s * 0.03))
    return out.resize((SIDE, SIDE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    made = icon()
    made.save(OUT / "icon.png")
    made.resize((64, 64), Image.LANCZOS).save(OUT / "favicon.png")
    background().save(OUT / "android-icon-background.png")
    foreground().save(OUT / "android-icon-foreground.png")
    loading().save(OUT / "splash-icon.png")
    for name in ("icon", "favicon", "android-icon-background", "android-icon-foreground", "splash-icon"):
        print("wrote", (OUT / f"{name}.png").relative_to(ROOT))


if __name__ == "__main__":
    main()
