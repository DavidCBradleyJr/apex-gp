"""Blender: inspect/render a preserved Tripo GLB without editing the source.

Arguments after --: source.glb evidence_directory expected_parts expected_triangles.
The view labels assume Tripo +Z forward; confirm that from the renders.
"""
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

source_path, output_path, expected_parts, expected_triangles = sys.argv[sys.argv.index("--") + 1:]
source, output = Path(source_path).resolve(), Path(output_path).resolve()
output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
assert len(meshes) == int(expected_parts), "Source part count changed"
assert sum(len(o.data.polygons) for o in meshes) == int(expected_triangles), "Source face count changed"

report = {"source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
          "coordinates": "Blender: X=glTF X, Y=-glTF Z, Z=glTF Y",
          "acceptance": "geometry inspection only; no texture, animation or engine acceptance",
          "parts": []}
all_points = []
for o in meshes:
    points = [o.matrix_world @ v.co for v in o.data.vertices]
    assert points and all(math.isfinite(v) for p in points for v in p), o.name
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    report["parts"].append({"name": o.name, "faces": len(o.data.polygons),
                            "min": lo, "max": hi})
    all_points.extend(points)
    o.color = (0.61, 0.66, 0.70, 1)
report["min"] = [min(p[i] for p in all_points) for i in range(3)]
report["max"] = [max(p[i] for p in all_points) for i in range(3)]

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
shading = scene.display.shading
shading.light = "STUDIO"
shading.color_type = "TEXTURE" if len(bpy.data.images) else "OBJECT"
shading.show_shadows = True
shading.show_cavity = True
shading.cavity_type = "BOTH"
shading.background_type = "VIEWPORT"
shading.background_color = (0.055, 0.065, 0.08)
bpy.ops.object.camera_add()
camera = bpy.context.object
scene.camera = camera
camera.data.type = "ORTHO"
target = Vector((0, 0, 0.10))
views = {"front": ((0, -2, 0.32), 0.75),
         "right": ((-2, 0, 0.25), 1.18),
         "rear": ((0, 2, 0.40), 0.75),
         "top": ((0, 0, 2), 1.60),
         "front-oblique": ((-1.5, -2, 1.1), 1.20),
         "rear-oblique": ((-1.5, 2, 0.9), 1.20)}
for name, (position, scale) in views.items():
    camera.location = position
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = scale
    scene.render.filepath = str(output / (name + ".png"))
    bpy.ops.render.render(write_still=True)
report["renders"] = [name + ".png" for name in views]
(output / "inspection.json").write_text(json.dumps(report, indent=2) + "\n")
print("QUALIFICATION_COMPLETE", len(meshes), "parts;", expected_triangles, "triangles; finite coordinates")
