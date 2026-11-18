"""Dev check: one figure seen from four sides, to judge proportions."""
import math, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mk import studio, assemble
from mk.figure import Quality

out = sys.argv[-1] if sys.argv[-1].endswith('.png') else '/tmp/turnaround.png'
scene = studio.reset_scene()
studio.setup_cycles(scene, samples=48, width=1600, height=620, transparent=False)
look = dict(
    skin="#8D5A3B", hair=dict(style="afro", color="#1C1310"), eyes="oval", brows="calm", mouth="smile",
    number="7", accessories=["headband", "wristbandR"],
    kit=dict(jersey="#2F6BDE", trim="#FFD23F", number="#FFFFFF", shorts="#2F6BDE", shortsTrim="#FFD23F", shoe="#FFFFFF", shoeAccent="#2F6BDE", band="#FFD23F"),
)
t = time.time()
angles = [0, 35, 90, 180]
for i, a in enumerate(angles):
    rig = assemble.spawn_figure(f"f{i}", look, Quality(2.0, decal_offset=0.002))
    rig.anchor.location = ((i - 1.5) * 1.15, 0, 0)
    rig.anchor.rotation_euler = (0, 0, math.radians(a))
    rig.pose({"armL_up": (0, -14, 0), "armR_up": (0, 14, 0), "armL_lo": (-10, 0, 0), "armR_lo": (-10, 0, 0)})
print("build seconds", time.time() - t)
studio.ground(scene, color=(0.55, 0.6, 0.68))
studio.studio_lights(scene, target=(0, 0, 0.8))
studio.add_camera(scene, (0, -9.5, 1.25), (0, 0, 0.78), lens=70)
t = time.time()
studio.render(scene, out)
print("render seconds", time.time() - t)
