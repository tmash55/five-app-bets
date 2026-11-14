"""Shared Cycles studio: soft product lighting for vinyl-toy style renders."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def setup_cycles(scene, samples: int = 96, width: int = 512, height: int = 640, transparent: bool = True):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.image_settings.compression = 60
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.threads_mode = "AUTO"


def look_at(obj, target, roll: float = 0.0):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    obj.rotation_euler.rotate_axis("Z", roll)


def add_camera(scene, location, target, lens: float = 85.0, ortho_scale: float | None = None):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam_data.clip_start = 0.05
    cam_data.clip_end = 200
    if ortho_scale is not None:
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = location
    look_at(cam, target)
    scene.camera = cam
    return cam


def add_area(scene, name, location, target, size, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "DISK"
    ld.size = size
    ld.energy = energy
    ld.color = color
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.location = location
    look_at(ob, target)
    return ob


def studio_lights(scene, target=(0, 0, 0.8), strength: float = 1.0, world: float = 0.22, world_color=(0.82, 0.88, 1.0)):
    """Big soft key from front-left, cool fill, warm rim from behind."""
    t = target
    add_area(scene, "key", (-2.2, -3.2, 3.4), t, 3.2, 520 * strength, (1.0, 0.97, 0.93))
    add_area(scene, "fill", (3.0, -2.4, 1.6), t, 4.0, 150 * strength, (0.86, 0.92, 1.0))
    add_area(scene, "rim", (1.6, 3.2, 3.0), t, 2.4, 420 * strength, (1.0, 0.93, 0.82))
    add_area(scene, "rim2", (-2.6, 2.6, 1.4), t, 2.0, 160 * strength, (0.8, 0.9, 1.0))
    w = bpy.data.worlds.new("world")
    scene.world = w
    bg = next(n for n in w.node_tree.nodes if n.bl_idname == "ShaderNodeBackground")
    bg.inputs["Color"].default_value = (*world_color, 1.0)
    bg.inputs["Strength"].default_value = world
    return w


def sunny_day(scene, sun_strength: float = 3.4, sky_strength: float = 0.9, sky=(0.42, 0.68, 1.0), sun_dir=(-0.55, -0.6, 0.72)):
    """Outdoor look: warm sun, blue sky fill, a soft warm bounce from below-front."""
    w = bpy.data.worlds.new("sky")
    scene.world = w
    nt = w.node_tree
    bg = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBackground")
    out = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputWorld")
    # vertical gradient: pale horizon, deeper blue overhead
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.80, 0.90, 1.0, 1)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = (*sky, 1)
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = sky_strength
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    sd = bpy.data.lights.new("sun", "SUN")
    sd.energy = sun_strength
    sd.color = (1.0, 0.95, 0.84)
    sd.angle = math.radians(9)
    sun = bpy.data.objects.new("sun", sd)
    scene.collection.objects.link(sun)
    sun.location = Vector(sun_dir) * 10
    look_at(sun, (0, 0, 0))
    add_area(scene, "bounce", (1.5, -7.0, 2.2), (0, 0, 0.9), 4.0, 240, (1.0, 0.92, 0.8))
    add_area(scene, "rim", (2.5, 3.5, 2.6), (0, 0, 0.9), 3.0, 260, (0.85, 0.93, 1.0))
    return w


def shadow_catcher(scene, size: float = 20.0, z: float = 0.0):
    me = bpy.data.meshes.new("catcher")
    s = size / 2
    me.from_pydata([(-s, -s, z), (s, -s, z), (s, s, z), (-s, s, z)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new("catcher", me)
    scene.collection.objects.link(ob)
    ob.is_shadow_catcher = True
    return ob


def ground(scene, color=(0.8, 0.8, 0.8), size: float = 60.0, roughness: float = 0.6):
    me = bpy.data.meshes.new("ground")
    s = size / 2
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    mat = bpy.data.materials.new("ground")
    bsdf = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    me.materials.append(mat)
    ob = bpy.data.objects.new("ground", me)
    scene.collection.objects.link(ob)
    return ob


def render(scene, path: str):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
