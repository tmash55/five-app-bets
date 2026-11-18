"""Dev check: close-ups (shoes / face) from a few angles."""
import math, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mk import studio, assemble
from mk.figure import Quality

out = sys.argv[-1]
scene = studio.reset_scene()
studio.setup_cycles(scene, samples=40, width=1500, height=560, transparent=False)
look = dict(
    skin="#8D5A3B", hair=dict(style="afro", color="#1C1310"), eyes="oval", brows="calm", mouth="smile",
    number="7", accessories=["headband", "wristbandR"],
    kit=dict(jersey="#2F6BDE", trim="#FFD23F", number="#FFFFFF", shorts="#2F6BDE", shortsTrim="#FFD23F", shoe="#F2F2F2", shoeAccent="#2F6BDE", band="#FFD23F"),
)
angles = [0, 40, 90, 140, 180]
for i, a in enumerate(angles):
    rig = assemble.spawn_figure(f"f{i}", look, Quality(2.0, decal_offset=0.002))
    rig.anchor.location = ((i - 2) * 0.95, 0, 0)
    rig.anchor.rotation_euler = (0, 0, math.radians(a))
    rig.pose({"armL_up": (0, -14, 0), "armR_up": (0, 14, 0)})
studio.ground(scene, color=(0.25, 0.28, 0.33))
studio.studio_lights(scene, target=(0, 0, 0.3), strength=0.55)
studio.add_camera(scene, (0, -7.5, 0.9), (0, 0, 0.27), lens=85)
studio.render(scene, out)
