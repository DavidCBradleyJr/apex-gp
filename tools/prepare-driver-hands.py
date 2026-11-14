"""Blender: fit a preserved Tripo glove rig to the game's steering grip.
The original calibration rig and atlas are never modified.
"""
import base64
import hashlib
import json
import math
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'assets/driver-pov'
source = ASSET / 'source/glove-atlas-revision.glb'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '365bc96a587fb46e74e885ec81a48eaf0eb404ccb294a2ea71a9444a53ed344e'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.import_scene.gltf(filepath=str(source))
glove = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
assert len(glove.data.polygons) == 49174
# Explicit smooth weights avoid the disconnected source's unstable bone-heat solve.
finger_points = {
    'index': [( .035, -.014, .700), (.035, -.014, .810), (.035, -.014, .895), (.035, -.014, .949)],
    'middle':[(-.058, -.017, .710), (-.058, -.017, .828), (-.058, -.017, .920), (-.058, -.017, .971)],
    'ring':  [(-.139, -.012, .690), (-.139, -.012, .810), (-.139, -.012, .901), (-.139, -.012, .952)],
    'pinky': [(-.226,  .002, .620), (-.226, .002, .733), (-.226, .002, .821), (-.226, .002, .873)],
    'thumb': [( .035, -.010, .385), (.110, -.010, .495), (.191, -.010, .605), (.252, -.010, .692)]}
scale = .300 / .9797580242156982
origin = Vector((-.065, -.010, .32))
def world(p):
    p = (Vector(p)-origin)*scale
    p.y *= .6
    return p
def smooth(t):
    t = max(0,min(1,t))
    return t*t*(3-2*t)
def chain(finger,p):
    points = [Vector(v) for v in finger_points[finger]]
    candidates=[]
    for i in range(3):
        delta=points[i+1]-points[i]
        t=max(0,min(1,(p-points[i]).dot(delta)/delta.length_squared))
        candidates.append(((p-points[i]-delta*t).length_squared,i+t))
    amount=min(candidates)[1]
    if amount<=.65:return {f'{finger}_0':1}
    if amount>=2.35:return {f'{finger}_2':1}
    joint=1 if amount<1.5 else 2
    blend=smooth((amount-(joint-.35))/.7)
    return {f'{finger}_{joint-1}':1-blend,f'{finger}_{joint}':blend}
armature=bpy.data.armatures.new('DriverGloveFit')
rig=bpy.data.objects.new('DriverGloveFit',armature)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,head,tail,parent in [('cuff',(-.065,-.01,0),origin,None),('wrist',origin,(-.065,-.01,.70),'cuff')]:
    bone=armature.edit_bones.new(name);bone.head=world(head);bone.tail=world(tail)
    if parent:bone.parent=armature.edit_bones[parent]
for finger,points in finger_points.items():
    for i in range(3):
        bone=armature.edit_bones.new(f'{finger}_{i}');bone.head=world(points[i]);bone.tail=world(points[i+1])
        bone.parent=armature.edit_bones[f'{finger}_{i-1}' if i else 'wrist']
bpy.ops.object.mode_set(mode='OBJECT')
groups={name:glove.vertex_groups.new(name=name) for name in armature.bones.keys()}
transform=glove.matrix_world.copy()
glove.matrix_world=Matrix.Identity(4)
for vertex in glove.data.vertices:
    p=transform@vertex.co
    thumb=smooth((p.x-.065)/.065)*smooth((p.z-.35)/.1)*(1-smooth((p.z-.72)/.05))
    finger=min((f for f in finger_points if f!='thumb'),key=lambda f:abs(p.x-finger_points[f][0][0]))
    influence=smooth((p.z-finger_points[finger][0][2]+.04)/.08)*(1-thumb)
    wrist=smooth((p.z-.26)/.10)
    weights={'cuff':(1-wrist)*(1-influence)*(1-thumb),'wrist':wrist*(1-influence)*(1-thumb)}
    for name,value in chain(finger,p).items():weights[name]=value*influence*(1-thumb)
    for name,value in chain('thumb',p).items():weights[name]=value*thumb
    weights=dict(sorted(weights.items(),key=lambda item:item[1],reverse=True)[:4]);total=sum(weights.values())
    assert total>0 and all(math.isfinite(value) and value>=0 for value in weights.values())
    for name,value in weights.items():
        if value>0:groups[name].add([vertex.index],value/total,'REPLACE')
    vertex.co=world(p)
modifier=glove.modifiers.new('Grip pose','ARMATURE');modifier.object=rig
for finger in ['index', 'middle', 'ring', 'pinky']:
    for i, curl in enumerate([0.95, 1.25, 0.85]):
        bone = rig.pose.bones[f'{finger}_{i}']
        bone.rotation_mode='XYZ';bone.rotation_euler=(-curl,0,0)
bpy.context.view_layer.update()
# Oppose the thumb towards the upper grip rather than leaving it flat across the palm.
thumb = rig.pose.bones['thumb_0']
pivot = thumb.head.copy()
thumb.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(.40,4,'Z') @ Matrix.Rotation(-.70,4,'Y') @ Matrix.Translation(-pivot) @ thumb.matrix
bpy.context.view_layer.update()
grip_bones = {n:list(rig.pose.bones[n].tail) for n in ['middle_0','middle_1','middle_2','thumb_2']}
mesh = bpy.data.meshes.new_from_object(glove.evaluated_get(bpy.context.evaluated_depsgraph_get()))
posed = bpy.data.objects.new('driver_left_glove_grip', mesh)
bpy.context.scene.collection.objects.link(posed)
# Export coordinates are +X forward, +Y up, +Z right. The left glove's fingers point inwards.
rotation = Matrix.Rotation(-1.10, 4, 'X')
cuff_axis = Vector((-0.60, -0.78, -0.18)).normalized()
cuff_rotation = (rotation @ Vector((0, 0, -1))).rotation_difference(cuff_axis)
cuff_points=[]
for vertex in mesh.vertices:
    p = vertex.co.copy()
    game = rotation @ Vector((p.y, p.x, p.z))
    if p.z < 0:
        t = min(1, -p.z / .075); t = t*t*(3-2*t)
        game = Quaternion().slerp(cuff_rotation, t) @ game
    vertex.co = (game.x, -game.z, game.y)
    if p.z < -.090:cuff_points.append(game.copy())
assert cuff_points
cuff_center=sum(cuff_points,Vector())/len(cuff_points)
mesh.validate(); mesh.update()
# The reflection changes winding; recalculate after the coordinate conversion.
bpy.ops.object.select_all(action='DESELECT')
posed.select_set(True); bpy.context.view_layer.objects.active = posed
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
for polygon in mesh.polygons: polygon.use_smooth = True
mod = posed.modifiers.new('Cockpit triangle budget', 'DECIMATE'); mod.ratio = .65
bpy.ops.object.modifier_apply(modifier=mod.name)
# Fit the inside of the glove to the actual runtime grip, allowing 1.5 mm of cloth clearance.
grip = json.loads((ASSET / 'source/grip-centreline.json').read_text())
centres = [Vector(p) for p in grip['points']]
tree = KDTree(len(centres))
for i,p in enumerate(centres): tree.insert(p,i)
tree.balance()
wrist = Vector((-.015,-.110,-.210))
adjusted, max_adjustment = 0, 0
for vertex in posed.data.vertices:
    point = Vector((vertex.co.x,vertex.co.z,-vertex.co.y)) + wrist
    _,index,_ = tree.find(point)
    candidates = []
    for i in [max(0,index-1),min(len(centres)-2,index)]:
        delta = centres[i+1]-centres[i]
        t = max(0,min(1,(point-centres[i]).dot(delta)/delta.length_squared))
        q = centres[i]+delta*t
        candidates.append(((point-q).length,q))
    distance,centre = min(candidates,key=lambda item:item[0])
    if distance < .022:
        t = max(0,(distance-.0195)/.0025); t=t*t*(3-2*t)
        radius = .0195+.0025*t
        direction=(point-centre).normalized() if distance>1e-8 else Vector((-1,0,0))
        correction=radius-distance
        point=centre+direction*radius-wrist
        vertex.co=(point.x,-point.z,point.y)
        max_adjustment=max(max_adjustment,correction); adjusted+=1
assert max_adjustment < .025
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
for material in posed.data.materials:
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .91
    bsdf.inputs['Metallic'].default_value = 0
    if 'Specular IOR Level' in bsdf.inputs: bsdf.inputs['Specular IOR Level'].default_value = .25
out = ASSET / 'derived/driver-left-glove.glb'
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
# Reimport the actual export, including UVs/maps and metre scale.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(out))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(objects) == 1
hand = objects[0]
triangles = sum(len(p.vertices)-2 for p in hand.data.polygons)
assert 28000 < triangles < 34000 and hand.data.uv_layers
points = [hand.matrix_world @ v.co for v in hand.data.vertices]
assert all(math.isfinite(c) for p in points for c in p)
lo = [min(p[i] for p in points) for i in range(3)]; hi = [max(p[i] for p in points) for i in range(3)]
assert all(.05 < hi[i]-lo[i] < .30 for i in range(3)), (lo,hi)
blob = out.read_bytes()
(ROOT / 'vendor/driver-hands.js').write_text('// Preserved Tripo glove, local grip derivative. See assets/driver-pov/production.json.\nwindow.DRIVER_HAND_GLB="' + base64.b64encode(blob).decode() + '";\n')
report = {'status':'exported and reimported; game fit requires rendered checks',
          'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob),'triangles':triangles,
          'bounds_blender': [lo,hi], 'uv_layers':len(hand.data.uv_layers),
          'game_wrist_positions': [[-.015,-.110,-.210],[-.015,-.110,.210]],
          'left_cuff_opening_center_local':list(cuff_center),
          'contact_fit': {'adjusted_vertices':adjusted,'max_adjustment_m':max_adjustment,'cloth_clearance_m':.0015},
          'right_hand':'mirrored local Z; shared static grip geometry',
          'posed_bone_tails_blender':grip_bones,
          'limitations':['source glove is inferred empty replica geometry','posed grip, not finger animation or hand-over-hand steering','contact check samples vertices; not a continuous mesh collision proof']}
(ASSET/'evidence/hand-export.json').write_text(json.dumps(report,indent=2)+'\n')
print('DRIVER_HAND_EXPORT_COMPLETE',json.dumps(report))
