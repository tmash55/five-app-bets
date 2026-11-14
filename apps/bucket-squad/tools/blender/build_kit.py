"""Export the figure kit for the game.

Writes every part variant (heads, hair, faces, bodies, digits, ball) in
bone-local, Y-up coordinates with a material slot per vertex. The app builds
any player by picking parts and colouring slots.

Run:  python tools/blender/build_kit.py  (python with `bpy` installed, or
      blender --background --python tools/blender/build_kit.py)
"""

from __future__ import annotations

import base64
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from mk import assemble, geo, hair, props  # noqa: E402
from mk import figure as fig  # noqa: E402
from mk.figure import BONES, Quality  # noqa: E402
from mk.geo import Geo  # noqa: E402

APP = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(APP, "src", "game", "kit", "kitData.json")

SLOTS = [
    "skin", "jersey", "jerseyTrim", "number", "shorts", "shortsTrim", "shortsShadow", "shoe", "shoeAccent", "sole",
    "sock", "sockHigh", "kneeL", "kneeR", "sleeveUpL", "sleeveLoL", "sleeveUpR", "sleeveLoR", "wristL", "wristR",
    "hair", "brow", "eye", "eyeShine", "mouth", "teeth", "band", "frame", "blush", "freckle", "bandaid", "ball", "seam",
    "nose", "earIn", "tongue", "cuffL", "cuffR", "hat", "hatBrim",
]
SLOT_INDEX = {s: i for i, s in enumerate(SLOTS)}


def to_three(v):
    """Blender (x, y, z) Z-up, facing -Y  ->  three.js (x, y, z) Y-up, facing +Z."""
    return (v[0], v[2], -v[1])


def pack(g: Geo, pivot):
    """Geo (figure space) -> dict of numpy arrays in bone-local three.js space."""
    if not g.faces:
        return None
    V = np.array(g.verts, dtype=np.float64)
    tris, tslot, tsmooth = [], [], []
    for f, s, sm in zip(g.faces, g.slots, g.smooth):
        for k in range(1, len(f) - 1):
            tris.append((f[0], f[k], f[k + 1]))
            tslot.append(SLOT_INDEX[s])
            tsmooth.append(sm)
    T = np.array(tris, dtype=np.int64)
    tslot = np.array(tslot)
    tsmooth = np.array(tsmooth, dtype=bool)
    fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    area = np.linalg.norm(fn, axis=1)
    keep = area > 1e-10
    T, tslot, tsmooth, fn = T[keep], tslot[keep], tsmooth[keep], fn[keep]
    vn = np.zeros_like(V)
    for k in range(3):
        np.add.at(vn, T[tsmooth][:, k], fn[tsmooth])
    ln = np.linalg.norm(vn, axis=1)
    ln[ln < 1e-12] = 1.0
    vn = vn / ln[:, None]
    out_pos, out_nrm, out_slot, idx = [], [], [], []
    seen = {}
    for t, s, sm, n in zip(T, tslot, tsmooth, fn):
        for k in range(3):
            vi = int(t[k])
            if sm:
                key = (vi, int(s))
                j = seen.get(key)
                if j is None:
                    j = len(out_pos)
                    seen[key] = j
                    out_pos.append(V[vi])
                    out_nrm.append(vn[vi])
                    out_slot.append(s)
            else:
                j = len(out_pos)
                out_pos.append(V[vi])
                out_nrm.append(n / (np.linalg.norm(n) or 1.0))
                out_slot.append(s)
            idx.append(j)
    P = np.array(out_pos) - np.array(pivot)
    N = np.array(out_nrm)
    P3 = np.stack([P[:, 0], P[:, 2], -P[:, 1]], axis=1)
    N3 = np.stack([N[:, 0], N[:, 2], -N[:, 1]], axis=1)
    return dict(pos=P3, nrm=N3, slot=np.array(out_slot, dtype=np.uint8), idx=np.array(idx, dtype=np.uint32))


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(arr.tobytes()).decode("ascii")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    qual = Quality(1.0, decal_offset=0.006)
    font = assemble.FONT
    skull_bvh = geo.bvh_of(fig.make_skull(Quality(2.0)))
    bone_pos = dict(fig.BONE_POS)
    for a in assemble.AUX_BONES:
        bone_pos[a] = fig.HEAD_C

    raw = {}  # name -> (bone, pivot, packed)

    def add(name: str, bone: str, g: Geo, pivot=None):
        pv = pivot if pivot is not None else bone_pos[bone]
        packed = pack(g, pv)
        if packed is None:
            return
        raw[name] = (bone, pivot, packed)

    # head
    add("head", "head", geo.merge([fig.make_skull(qual), fig.make_ears(qual)]))
    for style in fig.EYE_STYLES:
        eyes = fig.make_eyes(qual, skull_bvh, style)
        add(f"eye.{style}.L", "eyeL", eyes["eyeL"])
        add(f"eye.{style}.R", "eyeR", eyes["eyeR"])
        for brow in fig.BROW_STYLES:
            add(f"brow.{brow}.{style}", "head", fig.make_brows(qual, skull_bvh, brow, style))
    for style in fig.MOUTH_STYLES:
        add(f"mouth.{style}", "head", fig.make_mouth(qual, skull_bvh, style))
    for style in fig.NOSE_STYLES:
        add(f"nose.{style}", "head", fig.make_nose(qual, skull_bvh, style))
    for style in hair.HAIR_STYLES:
        h = hair.make_hair(qual, style)
        for key, val in h.items():
            if key == "head":
                add(f"hair.{style}", "head", val)
            else:
                g, pivot = val
                add(f"hair.{style}.{'A' if key == 'hairA' else 'B'}", key, g, tuple(pivot))
        if style != "bald":
            hh = hair.make_hair(qual, style, under_hat=True)
            if "head" in hh:
                add(f"hairHat.{style}", "head", hh["head"])
    for style in hair.FACIAL_STYLES:
        add(f"facial.{style}", "head", hair.make_facial_hair(qual, style, skull_bvh))
    for name in hair.HEAD_ACCESSORY_NAMES:
        add(f"acc.{name}", "head", hair.make_accessory(qual, name, skull_bvh))
        if name in ("headband", "sweatband"):
            add(f"acc.{name}.low", "head", hair.make_accessory(qual, name, skull_bvh, "afro"))

    # body
    add("torso", "torso", geo.merge([fig.make_torso(qual), fig.make_neck(qual), fig.make_armhole_trim(qual)]))
    for where in fig.NUMBER_LAYOUT:
        for d in "0123456789":
            add(f"num.{where}.{d}", "torso", fig.make_digit(qual, d, where, font))
    add("pelvis", "root", fig.make_pelvis(qual))
    for side, s in ((1, "L"), (-1, "R")):
        add(f"thigh.long.{s}", f"leg{s}_up", fig.make_thigh(qual, side, False))
        add(f"thigh.short.{s}", f"leg{s}_up", fig.make_thigh(qual, side, True))
        add(f"shin.{s}", f"leg{s}_lo", fig.make_shin(qual, side))
        add(f"shoe.{s}", f"foot{s}", fig.make_shoe(qual, side))
        add(f"armUp.{s}", f"arm{s}_up", fig.make_upper_arm(qual, side))
        add(f"armLo.{s}", f"arm{s}_lo", fig.make_forearm(qual, side))
        add(f"hand.{s}", f"hand{s}", fig.make_hand(qual, side))

    # ball (its own little object, pivot at centre)
    raw["ball"] = ("ball", (0, 0, 0), pack(props.make_ball(qual), (0, 0, 0)))

    max_abs = max(float(np.abs(p[2]["pos"]).max()) for p in raw.values())
    pos_scale = max_abs / 32767.0
    parts = {}
    total_v = total_t = 0
    for name, (bone, pivot, pk) in raw.items():
        q = np.round(pk["pos"] / pos_scale).astype(np.int16)
        n = np.clip(np.round(pk["nrm"] * 127.0), -127, 127).astype(np.int8)
        nv = len(q)
        idx = pk["idx"].astype(np.uint16) if nv < 65536 else pk["idx"]
        entry = dict(bone=bone, v=nv, t=len(idx) // 3, pos=b64(q), nrm=b64(n), slot=b64(pk["slot"]), idx=b64(idx))
        if pivot is not None and bone in assemble.AUX_BONES:
            entry["pivot"] = [round(c, 5) for c in to_three(pivot)]
        parts[name] = entry
        total_v += nv
        total_t += len(idx) // 3

    order = [b[0] for b in BONES] + list(assemble.AUX_BONES)
    parent = dict(fig.BONE_PARENT)
    for a in assemble.AUX_BONES:
        parent[a] = "head"
    bones = [dict(name=b, parent=parent[b], pivot=[round(c, 5) for c in to_three(bone_pos[b])]) for b in order]

    data = dict(
        version=1,
        posScale=pos_scale,
        slots=SLOTS,
        bones=bones,
        metrics=dict(
            height=round(fig.HZ + fig.HEAD_R[2], 4),
            headCenter=[round(c, 5) for c in to_three(fig.HEAD_C)],
            headRadius=list(fig.HEAD_R),
            ballRadius=props.BALL_R,
            upperArm=fig.UPPER_ARM,
            forearm=fig.FOREARM,
            hand=0.058,
            thigh=round(fig.HIP_Z - fig.KNEE_Z, 4),
            shin=round(fig.KNEE_Z - fig.ANKLE_Z, 4),
            ankle=fig.ANKLE_Z,
        ),
        styles=dict(
            eyes=list(fig.EYE_STYLES),
            brows=list(fig.BROW_STYLES),
            mouths=fig.MOUTH_STYLES,
            noses=fig.NOSE_STYLES,
            hats=sorted(hair.HATS),
            hair=hair.HAIR_STYLES,
            volumeHair=sorted(hair.VOLUME_STYLES),
            facial=hair.FACIAL_STYLES,
            accessories=hair.HEAD_ACCESSORY_NAMES,
        ),
        parts=parts,
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"kit: {len(parts)} parts, {total_v} verts, {total_t} tris -> {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")
    biggest = sorted(parts.items(), key=lambda kv: -kv[1]["t"])[:12]
    print("largest parts:", ", ".join(f"{k}:{v['t']}" for k, v in biggest))


if __name__ == "__main__":
    main()
