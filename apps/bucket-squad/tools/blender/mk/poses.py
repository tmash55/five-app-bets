"""Poses for card art and previews (Blender space, Euler XYZ degrees per bone).

Sign cheat sheet (figure faces -Y, its left is +X, limbs hang down -Z):
  limb forward swing ....... negative X     limb back ........... positive X
  left arm/leg outward ..... negative Y     right outward ....... positive Y
  torso/head lean forward .. positive X     head turn to its left  positive Z
"""

POSES = {
    "ready": {
        "armL_up": (4, -16, 0), "armR_up": (4, 16, 0),
        "armL_lo": (-14, 0, 0), "armR_lo": (-14, 0, 0),
    },
    "wave": {
        "armL_up": (0, -148, 0), "armL_lo": (0, -32, 0), "handL": (0, 14, 0),
        "armR_up": (6, 14, 0), "armR_lo": (-12, 0, 0),
        "head": (0, 6, 4), "torso": (0, -3, 0),
    },
    "hold": {  # ball held in both hands at the tummy
        "armL_up": (-34, -8, 0), "armL_lo": (-62, 0, 38), "handL": (0, 0, 20),
        "armR_up": (-34, 8, 0), "armR_lo": (-62, 0, -38), "handR": (0, 0, -20),
        "head": (4, 0, 0),
    },
    "hip": {  # ball tucked on the right hip, left hand on the other hip
        "armR_up": (14, 34, 0), "armR_lo": (-58, 0, 24),
        "armL_up": (16, -42, 0), "armL_lo": (-70, 0, -58),
        "torso": (0, 0, -8), "head": (0, 0, 10),
        "legL_up": (0, -6, 0), "legR_up": (0, 6, 0),
    },
    "cheer": {  # jump with both arms up
        "root_offset": (0, 0, 0.22),
        "armL_up": (-10, -150, 0), "armL_lo": (0, -18, 0),
        "armR_up": (-10, 150, 0), "armR_lo": (0, 18, 0),
        "legL_up": (-38, -8, 0), "legL_lo": (72, 0, 0),
        "legR_up": (14, 8, 0), "legR_lo": (46, 0, 0),
        "head": (-8, 0, 0), "torso": (-6, 0, 0),
    },
    "dribble": {
        "torso": (14, 0, -10), "head": (-10, 0, 14),
        "armR_up": (-28, 12, 0), "armR_lo": (-38, 0, 0), "handR": (-28, 0, 0),
        "armL_up": (22, -36, 0), "armL_lo": (-48, 0, 0),
        "legL_up": (-26, -6, 0), "legL_lo": (30, 0, 0),
        "legR_up": (18, 6, 0), "legR_lo": (26, 0, 0),
        "root_offset": (0, 0, -0.03),
    },
    "present": {  # ball balanced up on the right hand, beside the head
        "armR_up": (-12, 100, 0), "armR_lo": (0, 60, 0), "handR": (0, 8, 0),
        "armL_up": (8, -30, 0), "armL_lo": (-50, 0, -30),
        "head": (0, -4, -8), "torso": (0, 2, 0),
        "legL_up": (0, -5, 0), "legR_up": (0, 5, 0),
    },
    "point": {
        "armR_up": (-84, 10, 0), "armR_lo": (-6, 0, 0),
        "armL_up": (10, -26, 0), "armL_lo": (-56, 0, -40),
        "torso": (0, 0, 6), "head": (0, 0, -4),
    },
    "flex": {
        "armL_up": (0, -84, 0), "armL_lo": (0, -104, 0),
        "armR_up": (0, 84, 0), "armR_lo": (0, 104, 0),
        "head": (-4, 0, 0),
    },
}

# where the ball goes for each pose: (bone, offset in that bone's local frame)
BALL = {
    "hold": ("torso", (0.0, -0.335, 0.115)),
    "hip": ("root", (-0.335, -0.06, 0.05)),
    "dribble": ("handR", (0.0, -0.02, -0.36)),
    "present": ("handR", (0.0, 0.0, -0.245)),
}
