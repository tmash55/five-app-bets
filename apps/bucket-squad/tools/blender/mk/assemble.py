"""Turn a look (plain dict, same shape as the app's roster JSON) into parts,
a colour palette, and a posable Blender rig of empties + meshes."""

from __future__ import annotations

import colorsys
import math
import os

import bpy
from mathutils import Euler, Vector

from . import figure as fig
from . import geo, hair
from .figure import BONES, BONE_PARENT, BONE_POS, Quality
from .geo import Geo

FONT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts", "Graduate-Regular.ttf")

AUX_BONES = ("hairA", "hairB")

DEFAULT_KIT = dict(
    jersey="#E8483A",
    trim="#FFFFFF",
    number="#FFFFFF",
    shorts="#E8483A",
    shortsTrim="#FFFFFF",
    shoe="#FFFFFF",
    shoeAccent="#E8483A",
    sole="#F4F1EA",
    sock="#FFFFFF",
    band="#FFFFFF",
)


# --------------------------------------------------------------------------
# Colour helpers
# --------------------------------------------------------------------------


def hex_to_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def rgb_to_hex(rgb) -> str:
    return "#" + "".join(f"{max(0, min(255, int(round(c * 255)))):02X}" for c in rgb)


def shade(h: str, lightness: float = 1.0, saturation: float = 1.0) -> str:
    r, g, b = hex_to_rgb(h)
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    return rgb_to_hex(colorsys.hls_to_rgb(hh, max(0, min(1, ll * lightness)), max(0, min(1, ss * saturation))))


def mix(a: str, b: str, t: float) -> str:
    ra, rb = hex_to_rgb(a), hex_to_rgb(b)
    return rgb_to_hex(tuple(ra[i] + (rb[i] - ra[i]) * t for i in range(3)))


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def palette(look: dict) -> dict:
    """slot name -> hex colour. The app's TypeScript palette() mirrors this."""
    kit = {**DEFAULT_KIT, **look.get("kit", {})}
    skin = look.get("skin", "#C68642")
    acc = set(look.get("accessories", []))
    hair_c = look.get("hair", {}).get("color", "#1C1310")
    band = kit["band"]
    sleeve = look.get("sleeveColor", band)
    top = look.get("top", "jersey")  # jersey | tee
    under = look.get("undershirt")  # colour of a tee worn under a jersey
    pants = look.get("bottom", "shorts") == "pants"

    def arm_up(side):
        if top == "tee":
            return kit["jersey"]
        if under:
            return under
        return sleeve if f"sleeve{side}" in acc else skin

    def cuff(side):
        if top == "tee":
            return kit["trim"]
        if under:
            return under
        return sleeve if f"sleeve{side}" in acc else skin

    hat = look.get("hatColor", kit["jersey"])
    pal = {
        "skin": skin,
        "jersey": kit["jersey"],
        "jerseyTrim": kit["trim"],
        "number": kit["number"],
        "shorts": kit["shorts"],
        "shortsTrim": kit["shortsTrim"],
        "shortsShadow": shade(kit["shorts"], 0.45),
        "shoe": kit["shoe"],
        "shoeAccent": kit["shoeAccent"],
        "sole": kit["sole"],
        "sock": kit["sock"],
        "sockHigh": kit["shorts"] if pants else (kit["sock"] if look.get("highSocks") else skin),
        "kneeL": kit["shorts"] if pants else (sleeve if "kneepadL" in acc or "legSleeveL" in acc else skin),
        "kneeR": kit["shorts"] if pants else (sleeve if "kneepadR" in acc or "legSleeveR" in acc else skin),
        "sleeveUpL": arm_up("L"),
        "sleeveUpR": arm_up("R"),
        "cuffL": cuff("L"),
        "cuffR": cuff("R"),
        "sleeveLoL": sleeve if "sleeveL" in acc else skin,
        "sleeveLoR": sleeve if "sleeveR" in acc else skin,
        "wristL": band if "wristbandL" in acc else (sleeve if "sleeveL" in acc else skin),
        "wristR": band if "wristbandR" in acc else (sleeve if "sleeveR" in acc else skin),
        "hair": hair_c,
        "brow": look.get("browColor", shade(hair_c, 0.55) if _lum(hair_c) > 0.25 else hair_c),
        "eye": "#17120F",
        "eyeShine": "#FFFFFF",
        "mouth": "#5B241E",
        "teeth": "#FFFFFF",
        "band": band,
        "frame": look.get("frameColor", "#1E1E24"),
        "blush": mix(skin, "#FF6F7D", 0.38),
        "nose": mix(shade(skin, 0.96), "#E8695F", 0.14),
        "earIn": shade(skin, 0.84),
        "tongue": "#F2707F",
        "hat": hat,
        "hatBrim": look.get("hatBrimColor", shade(hat, 0.78)),
        "freckle": shade(skin, 0.68),
        "bandaid": "#F2D3A6",
    }
    return pal


def _lum(h: str) -> float:
    r, g, b = hex_to_rgb(h)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# --------------------------------------------------------------------------
# Parts
# --------------------------------------------------------------------------


def build_parts(look: dict, qual: Quality, with_number: bool = True):
    """Returns (parts, aux_pivots): parts is {bone: Geo} in figure rest space."""
    parts: dict[str, Geo] = {b[0]: Geo() for b in BONES}
    for a in AUX_BONES:
        parts[a] = Geo()
    aux_pivots = {a: fig.HEAD_C for a in AUX_BONES}

    skull = fig.make_skull(qual)
    skull_bvh = geo.bvh_of(fig.make_skull(Quality(2.0)))
    parts["head"].add(skull)
    parts["head"].add(fig.make_ears(qual))
    eyes = fig.make_eyes(qual, skull_bvh, look.get("eyes", "oval"))
    parts["eyeL"].add(eyes["eyeL"])
    parts["eyeR"].add(eyes["eyeR"])
    parts["head"].add(fig.make_brows(qual, skull_bvh, look.get("brows", "calm"), look.get("eyes", "oval")))
    parts["head"].add(fig.make_mouth(qual, skull_bvh, look.get("mouth", "smile")))

    hair_style = look.get("hair", {}).get("style", "buzz")
    accessories = list(look.get("accessories", []))
    if look.get("blush", True) and "blush" not in accessories:
        accessories.append("blush")
    wearing_hat = any(a in hair.HATS for a in accessories)
    h = hair.make_hair(qual, hair_style, under_hat=wearing_hat)
    for key, val in h.items():
        if key == "head":
            parts["head"].add(val)
        else:
            g, pivot = val
            parts[key].add(g)
            aux_pivots[key] = tuple(pivot)
    parts["head"].add(fig.make_nose(qual, skull_bvh, look.get("nose", "button")))
    parts["head"].add(hair.make_facial_hair(qual, look.get("facial", "none"), skull_bvh))
    for acc in accessories:
        if acc in HEAD_ACCESSORIES:
            parts["head"].add(hair.make_accessory(qual, acc, skull_bvh, hair_style))

    parts["torso"].add(fig.make_torso(qual))
    parts["torso"].add(fig.make_neck(qual))
    parts["torso"].add(fig.make_armhole_trim(qual))
    if with_number and look.get("number") not in (None, ""):
        parts["torso"].add(fig.make_number(qual, str(look["number"]), FONT))
    parts["root"].add(fig.make_pelvis(qual))
    short = bool(look.get("shortShorts"))
    for side, s in ((1, "L"), (-1, "R")):
        parts[f"leg{s}_up"].add(fig.make_thigh(qual, side, short))
        parts[f"leg{s}_lo"].add(fig.make_shin(qual, side))
        parts[f"foot{s}"].add(fig.make_shoe(qual, side))
        parts[f"arm{s}_up"].add(fig.make_upper_arm(qual, side))
        parts[f"arm{s}_lo"].add(fig.make_forearm(qual, side))
        parts[f"hand{s}"].add(fig.make_hand(qual, side))
    return parts, aux_pivots


HEAD_ACCESSORIES = set(hair.HEAD_ACCESSORY_NAMES)


# --------------------------------------------------------------------------
# Render materials
# --------------------------------------------------------------------------

ROUGH = {
    "eye": 0.55,
    "eyeShine": 0.5,
    "frame": 0.45,
    "teeth": 0.6,
    "sole": 0.8,
}
SKIN_SLOTS = {"skin", "nose", "earIn"}
CLOTH_SLOTS = {"jersey", "jerseyTrim", "shorts", "shortsTrim", "sock", "sockHigh", "hat", "hatBrim", "band", "number"}


def vinyl_material(name: str, hex_color: str, slot: str, is_skin: bool = False) -> bpy.types.Material:
    """Soft matte cartoon look: no gloss anywhere, a velvety edge light, warm glow in the skin."""
    key = f"{name}:{slot}:{hex_color}:{int(is_skin)}"
    mat = bpy.data.materials.get(key)
    if mat:
        return mat
    mat = bpy.data.materials.new(key)
    bsdf = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    r, g, b = (srgb_to_linear(c) for c in hex_to_rgb(hex_color))
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = ROUGH.get(slot, 0.95)
    bsdf.inputs["Specular IOR Level"].default_value = 0.08
    skin = is_skin or slot in SKIN_SLOTS
    if slot not in ("eye", "eyeShine", "mouth", "teeth", "tongue", "brow"):
        bsdf.inputs["Sheen Weight"].default_value = 0.55 if slot in CLOTH_SLOTS else 0.32
        bsdf.inputs["Sheen Roughness"].default_value = 0.5
        bsdf.inputs["Sheen Tint"].default_value = (1.0, 0.93, 0.84, 1.0)
    if skin:
        bsdf.inputs["Subsurface Weight"].default_value = 0.38
        bsdf.inputs["Subsurface Radius"].default_value = (0.10, 0.04, 0.02)
        bsdf.inputs["Subsurface Scale"].default_value = 0.55
    if slot == "eyeShine":
        bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
        bsdf.inputs["Emission Strength"].default_value = 0.8
    return mat


# --------------------------------------------------------------------------
# Rig
# --------------------------------------------------------------------------


class Rig:
    def __init__(self, name: str, anchor: bpy.types.Object, bones: dict, objects: list):
        self.name = name
        self.anchor = anchor  # move/rotate/scale this to place the figure
        self.bones = bones
        self.objects = objects

    def pose(self, pose: dict):
        """pose: {bone: (rx, ry, rz) degrees, 'root_offset': (x, y, z)}."""
        for b, e in self.bones.items():
            e.rotation_euler = Euler((0, 0, 0))
        for b, rot in pose.items():
            if b == "root_offset":
                base = Vector(BONE_POS["root"])
                self.bones["root"].location = base + Vector(rot)
                continue
            if b.endswith("_scale"):
                self.bones[b[:-6]].scale = rot
                continue
            self.bones[b].rotation_euler = Euler(tuple(math.radians(a) for a in rot), "XYZ")

    def remove(self):
        for o in self.objects:
            me = o.data
            bpy.data.objects.remove(o)
            if me and me.users == 0:
                bpy.data.meshes.remove(me)
        for e in self.bones.values():
            bpy.data.objects.remove(e)
        bpy.data.objects.remove(self.anchor)


def spawn_figure(name: str, look: dict, qual: Quality, collection=None) -> Rig:
    coll = collection or bpy.context.scene.collection
    parts, aux_pivots = build_parts(look, qual)
    pal = palette(look)

    anchor = bpy.data.objects.new(f"{name}_anchor", None)
    coll.objects.link(anchor)
    bones = {}
    pos = dict(BONE_POS)
    parent = dict(BONE_PARENT)
    for a in AUX_BONES:
        pos[a] = aux_pivots[a]
        parent[a] = "head"
    order = [b[0] for b in BONES] + list(AUX_BONES)
    for b in order:
        e = bpy.data.objects.new(f"{name}_{b}", None)
        e.empty_display_size = 0.05
        coll.objects.link(e)
        p = parent[b]
        if p is None:
            e.parent = anchor
            e.location = pos[b]
        else:
            e.parent = bones[p]
            e.location = Vector(pos[b]) - Vector(pos[p])
        bones[b] = e

    skin_hex = pal["skin"]

    def mat_for(slot):
        c = pal.get(slot, "#FF00FF")
        return vinyl_material(name, c, slot, is_skin=(c == skin_hex))

    objects = []
    for b in order:
        g = parts[b]
        if not g.faces:
            continue
        local = g.translated(-pos[b][0], -pos[b][1], -pos[b][2])
        ob = geo.to_object(f"{name}_{b}_mesh", local, mat_for, collection=coll, parent=bones[b])
        objects.append(ob)

    build = look.get("build", {})
    hscale = build.get("height", 1.0)
    bulk = build.get("bulk", 1.0)
    anchor.scale = (hscale * bulk, hscale * bulk, hscale)
    # keep the head from growing/shrinking as much as the body: the chibi read stays
    head_comp = build.get("head", 1.0) / (hscale**0.6)
    bones["head"].scale = (head_comp / bulk, head_comp / bulk, head_comp)
    return Rig(name, anchor, bones, objects)
