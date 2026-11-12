"""Dev/preview: a sunny line-up of sample kids in different outfits and poses."""
import math, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from mk import studio, assemble, geo, props
from mk.figure import Quality
from mk.poses import POSES, BALL

out = sys.argv[-1]
samples = int(os.environ.get("SAMPLES", "40"))
scene = studio.reset_scene()
W, H = [int(v) for v in os.environ.get('SIZE', '1920x900').split('x')]
studio.setup_cycles(scene, samples=samples, width=W, height=H, transparent=False)

RED = dict(jersey="#E5483B", trim="#FFFFFF", number="#FFFFFF", shorts="#2B3A67", shortsTrim="#FFFFFF", shoe="#FFFFFF", shoeAccent="#E5483B", band="#FFD23F")
TEAL = dict(jersey="#18A999", trim="#FFE066", number="#FFFFFF", shorts="#18A999", shortsTrim="#FFE066", shoe="#2B2D42", shoeAccent="#FFE066", band="#FFE066")
PURPLE = dict(jersey="#7B4FD6", trim="#FFB627", number="#FFB627", shorts="#3A2A78", shortsTrim="#FFB627", shoe="#FFFFFF", shoeAccent="#7B4FD6", band="#FFB627")
ORANGE = dict(jersey="#FF8A1F", trim="#1F2A44", number="#1F2A44", shorts="#1F2A44", shortsTrim="#FF8A1F", shoe="#FF8A1F", shoeAccent="#FFFFFF", band="#FFFFFF")
GREEN = dict(jersey="#3FA34D", trim="#FFFFFF", number="#FFFFFF", shorts="#F4F1EA", shortsTrim="#3FA34D", shoe="#3FA34D", shoeAccent="#FFFFFF", band="#FFFFFF")
PINK = dict(jersey="#F25C9A", trim="#2B2D42", number="#FFFFFF", shorts="#2B2D42", shortsTrim="#F25C9A", shoe="#FFFFFF", shoeAccent="#F25C9A", band="#7FDBDA")
BLUE = dict(jersey="#2F6BDE", trim="#FFD23F", number="#FFFFFF", shorts="#2F6BDE", shortsTrim="#FFD23F", shoe="#F2F2F2", shoeAccent="#2F6BDE", band="#FFD23F")
YELLOW = dict(jersey="#FFC629", trim="#2B2D42", number="#2B2D42", shorts="#2B2D42", shortsTrim="#FFC629", shoe="#2B2D42", shoeAccent="#FFC629", band="#E5483B")

kids = [
    dict(pose="hip", look=dict(skin="#8D5A3B", hair=dict(style="hightop", color="#1C1310"), eyes="oval", brows="fierce", mouth="smirk", number="3", top="jersey", kit=BLUE, accessories=["wristbandL"])),
    dict(pose="wave", look=dict(skin="#F3C9A8", hair=dict(style="pigtails", color="#C4532D"), eyes="round", brows="raised", mouth="grin", number="12", top="tee", kit=PINK, accessories=["freckles", "lashes"], nose="small")),
    dict(pose="hold", look=dict(skin="#C68642", hair=dict(style="short", color="#231710"), eyes="oval", brows="calm", mouth="bigsmile", number="8", top="tee", kit=GREEN, accessories=["capBack"], hatColor="#E5483B", build=dict(height=0.94))),
    dict(pose="cheer", look=dict(skin="#5C3A26", hair=dict(style="puffs", color="#19100C"), eyes="tall", brows="raised", mouth="grin", number="21", top="jersey", kit=YELLOW, accessories=["lashes", "wristbandR"], highSocks=True)),
    dict(pose="dribble", look=dict(skin="#E7B48A", hair=dict(style="spiky", color="#2A1B12"), eyes="wide", brows="fierce", mouth="tooth", number="5", top="jersey", undershirt="#FFFFFF", kit=RED, accessories=["headband", "bandaid"])),
    dict(pose="ready", look=dict(skin="#FFD9B8", hair=dict(style="bob", color="#1B1B1F"), eyes="oval", brows="calm", mouth="smile", number="17", top="tee", kit=TEAL, accessories=["glasses"], nose="small", build=dict(height=0.97))),
    dict(pose="present", look=dict(skin="#A9714B", hair=dict(style="cornrows", color="#141010"), eyes="round", brows="thick", mouth="open", number="30", top="jersey", kit=PURPLE, accessories=["sleeveR"], sleeveColor="#FFFFFF", build=dict(height=1.06))),
    dict(pose="flex", look=dict(skin="#F1C7A5", hair=dict(style="curly", color="#D9A441"), eyes="wide", brows="thick", mouth="bigsmile", number="44", top="jersey", kit=ORANGE, accessories=["sweatband"], bottom="shorts", build=dict(height=1.08, bulk=1.1), nose="wide")),
    dict(pose="point", look=dict(skin="#7A4B2E", hair=dict(style="braids", color="#1A1210"), eyes="oval", brows="fierce", mouth="smile", number="10", top="tee", kit=BLUE, accessories=["lashes", "beanie"], hatColor="#7B4FD6", bottom="pants")),
]

q = Quality(2.0, decal_offset=0.002)
n = len(kids)
for i, k in enumerate(kids):
    rig = assemble.spawn_figure(f"k{i}", k["look"], q)
    x = (i - (n - 1) / 2) * float(os.environ.get('SPACING', '0.95'))
    y = 0.28 * math.cos(i * 1.7) + (0.5 if i % 2 else 0.0)
    rig.anchor.location = (x, y, 0)
    rig.anchor.rotation_euler = (0, 0, math.radians(-x * 7 + (10 if i % 2 else -6)))
    rig.pose(POSES[k["pose"]])
    if k["pose"] in BALL:
        bone, off = BALL[k["pose"]]
        bpy.context.view_layer.update()
        mw = rig.bones[bone].matrix_world
        pal = {"ball": "#E8792B", "seam": "#2A1A14"}
        ball = geo.to_object(f"ball{i}", props.make_ball(q), lambda s: assemble.vinyl_material("ball", pal[s], s))
        ball.location = mw @ Vector(off)
        ball.rotation_euler = (0.4 * i, 0.9, 0.3 * i)

# a loose ball on the grass
pal = {"ball": "#E8792B", "seam": "#2A1A14"}
b = geo.to_object("ballg", props.make_ball(q), lambda s: assemble.vinyl_material("ball", pal[s], s))
b.location = (0.55, -1.25, 0.17); b.rotation_euler = (0.3, 0.2, 1.0)

studio.sunny_day(scene)
studio.ground(scene, color=(0.20, 0.52, 0.16), roughness=0.95)
cam = [float(v) for v in os.environ.get('CAM', '0,-12.8,1.7,0,0,0.80,50').split(',')]
studio.add_camera(scene, tuple(cam[0:3]), tuple(cam[3:6]), lens=cam[6])
t = time.time()
studio.render(scene, out)
print("render seconds", time.time() - t)
