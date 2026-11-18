"""Dev check: a grid of heads, one per hair style / look variation."""
import math, sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mk import studio, assemble
from mk.figure import Quality

out = sys.argv[-1]
styles = sys.argv[-2].split(',')
cols = 7
rows = (len(styles) + cols - 1) // cols
scene = studio.reset_scene()
VS = 1.95
studio.setup_cycles(scene, samples=28, width=1820, height=int(1820 * (rows * VS) / (cols * 0.92)), transparent=False)
skins = ["#8D5A3B", "#F1C7A5", "#C68642", "#5C3A26", "#E0AC69", "#FFDBAC", "#A9714B"]
hairs = ["#1C1310", "#5A3A22", "#141414", "#D9A441", "#B5522D", "#2B1B12", "#8B8B8B"]
for i, st in enumerate(styles):
    parts = st.split('+')
    look = dict(
        skin=skins[i % len(skins)], hair=dict(style=parts[0], color=hairs[i % len(hairs)]),
        eyes=["oval", "round", "wide", "tall"][i % 4], brows=["calm", "fierce", "raised", "thick"][i % 4],
        mouth=["smile", "grin", "smirk", "open", "flat"][i % 5], number=str(i),
        facial=next((p[2:] for p in parts[1:] if p.startswith('f:')), "none"),
        accessories=[p for p in parts[1:] if not p.startswith('f:')],
        kit=dict(jersey="#2F6BDE", trim="#FFD23F", band="#E8483A"),
    )
    rig = assemble.spawn_figure(f"f{i}", look, Quality(2.0, decal_offset=0.002))
    c, r = i % cols, i // cols
    rig.anchor.location = ((c - (cols - 1) / 2) * 0.92, 0, -(r - (rows - 1) / 2) * VS - 0.9)
    rig.anchor.rotation_euler = (0, 0, math.radians(28 if (i % 2 == 0) else -28))
    rig.pose({"armL_up": (0, -14, 0), "armR_up": (0, 14, 0)})
studio.studio_lights(scene, target=(0, 0, 0), strength=0.6, world=0.5)
bg = studio.ground(scene, color=(0.3, 0.33, 0.4))
bg.rotation_euler = (math.radians(90), 0, 0); bg.location = (0, 1.2, 0)
studio.add_camera(scene, (0, -14, 0), (0, 0, 0), ortho_scale=cols * 0.92)
studio.render(scene, out)
