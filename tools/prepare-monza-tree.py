"""Run with Blender --background --python tools/prepare-monza-tree.py.
Preserve the Tripo source; produce a small vertex-coloured roadside tree.
"""
import base64
import hashlib
import json
import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'assets/tracks/monza'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ASSET / 'source/hornbeam.glb'))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(meshes) == 1, 'Expected one static Tripo tree'
tree = meshes[0]
bpy.context.view_layer.objects.active = tree
tree.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
zs = [v.co.z for v in tree.data.vertices]
base, height = min(zs), max(zs) - min(zs)
assert height > 0
for v in tree.data.vertices:
    v.co.z -= base
    v.co *= 16 / height
mod = tree.modifiers.new('Roadside triangle budget', 'DECIMATE')
mod.ratio = 6000 / len(tree.data.polygons)
bpy.ops.object.modifier_apply(modifier=mod.name)
tree.data.validate()
bpy.context.view_layer.update()
col = tree.data.color_attributes.new(name='Colour', type='FLOAT_COLOR', domain='CORNER')
# The Studio export has no UVs/maps. Keep that fact explicit; colour the derivative locally.
for face in tree.data.polygons:
    for li in face.loop_indices:
        v = tree.data.vertices[tree.data.loops[li].vertex_index].co
        r = math.hypot(v.x, v.y)
        bark = v.z < 3.6 or r < max(0.25, 0.65 - v.z * 0.035)
        variation = 0.86 + 0.14 * math.sin(v.x * 4.1 + v.z * 3.7) * math.cos(v.y * 3.4)
        rgb = (0.15, 0.105, 0.063) if bark else (0.055, 0.145, 0.027)
        col.data[li].color = tuple(c * variation for c in rgb) + (1,)
    face.use_smooth = True
mat = bpy.data.materials.new('Local bark and summer foliage')
mat.use_nodes = True
nodes = mat.node_tree.nodes
bsdf = nodes.get('Principled BSDF')
attr = nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Colour'
mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.92
mat.diffuse_color = (0.08, 0.18, 0.04, 1)
tree.data.materials.clear(); tree.data.materials.append(mat)
tree.name = 'Monza hornbeam — local colour derivative'
out = ASSET / 'hornbeam-runtime.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                         export_yup=True)
triangles = sum(len(p.vertices) - 2 for p in tree.data.polygons)
assert 4000 <= triangles <= 6500, triangles
assert 15 < tree.dimensions.z < 17, list(tree.dimensions)
blob = out.read_bytes()
(ROOT / 'vendor/monza-tree.js').write_text('// Tripo Studio b4eceda4; local 6k-triangle colour derivative. See assets/tracks/monza/production.json.\nwindow.MONZA_TREE_GLB="' + base64.b64encode(blob).decode() + '";\n')
report = {'triangles': triangles, 'height_m': tree.dimensions.z, 'bytes': len(blob),
          'sha256': hashlib.sha256(blob).hexdigest(), 'materials': 1,
          'source_has_textures': False, 'colour': 'local vertex colours; no generated texture maps'}
(ASSET / 'evidence/tree-preparation.json').write_text(json.dumps(report, indent=2) + '\n')
print('MONZA_TREE_PREPARED', json.dumps(report))
