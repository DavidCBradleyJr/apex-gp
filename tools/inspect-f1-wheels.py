"""Render inspected ledger tyre candidates and attached links without changing sources."""
import bpy,bmesh,hashlib,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector
root=Path(__file__).resolve().parents[1]/'assets/f1-2026'
team=sys.argv[sys.argv.index('--')+1]
entry=next(t for t in json.loads((root/'production.json').read_text())['teams'] if t['id']==team)
plan=entry['wheel_reconstruction_plan'];source=root/entry['atlas']['atlas']
assert hashlib.sha256(source.read_bytes()).hexdigest()==entry['atlas']['atlas_sha256']
output=root/f'evidence/{team}-wheel-isolation';output.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)==entry['model']['mesh_count']
assert sum(len(o.data.polygons) for o in meshes)==entry['model']['triangle_count']
colours=[(1,.05,.05,1),(.05,.65,1,1),(1,.8,.05,1),(.05,.9,.15,1)]
parts={f"tripo_part_{w['part']}":colour for w,colour in zip(plan['wheels'],colours)}
assert len(parts)==4
for wheel,colour in zip(plan['wheels'],colours):
    for part in wheel.get('moving_source_parts',[]):parts[f'tripo_part_{part}']=colour
assert all(name in bpy.data.objects for name in parts)
rotation=Matrix.Rotation(plan['rotation_to_canonical_z'],4,'Z')
for o in meshes:
    o.data.transform(rotation@o.matrix_world);o.parent=None;o.matrix_world=Matrix.Identity(4)
    assert all(math.isfinite(c) for v in o.data.vertices for c in v.co)
    o.color=parts.get(o.name,(.22,.22,.22,1))
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x,scene.render.resolution_y=1200,900;scene.render.resolution_percentage=100
scene.display.shading.light='STUDIO';scene.display.shading.color_type='OBJECT'
scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO'
for isolated in [False,True]:
    for o in meshes:o.hide_render=isolated and o.name not in parts
    for name,position in [('front-oblique',(-1,-2,1)),('rear-oblique',(-1,2,.9)),('top',(0,0,2))]:
        camera.location=position;camera.data.ortho_scale=1.4
        camera.rotation_euler=(Vector((0,0,.1))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(output/(('isolated-' if isolated else 'body-')+name+'.png'))
        bpy.ops.render.render(write_still=True)
topology=[]
for wheel in plan['wheels']:
    tyre=bpy.data.objects[f"tripo_part_{wheel['part']}"]
    points=[v.co for v in tyre.data.vertices]
    target=Vector([(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)])
    extras={f'tripo_part_{p}' for p in wheel.get('moving_source_parts',[])}
    for o in meshes:o.hide_render=o!=tyre and o.name not in extras
    camera.location=target+Vector((-wheel['lateral_sign'],.35,.25))
    camera.data.ortho_scale=.30
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(output/(wheel['name']+'-inboard.png'));bpy.ops.render.render(write_still=True)
    bm=bmesh.new();bm.from_mesh(tyre.data);seen=set();islands=[]
    for start_vertex in bm.verts:
        if start_vertex in seen:continue
        stack=[start_vertex];seen.add(start_vertex);vertices=[]
        while stack:
            vertex=stack.pop();vertices.append(vertex)
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other not in seen:seen.add(other);stack.append(other)
        faces={f for v in vertices for f in v.link_faces}
        islands.append({'triangles':len(faces),'min':[min(v.co[i] for v in vertices) for i in range(3)],
                        'max':[max(v.co[i] for v in vertices) for i in range(3)]})
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bad=[e for e in bm.edges if not e.is_manifold];area=sum(f.calc_area() for f in bm.faces)
    item={'name':wheel['name'],'part':wheel['part'],'boundary_edges':sum(e.is_boundary for e in bad),
          'nonmanifold_edges':len(bad),'source_area':area,'proposed_caps':[],
          'shared_index_islands':sorted(islands,key=lambda x:-x['triangles'])}
    if bad and all(e.is_boundary for e in bad):
        caps=bmesh.ops.holes_fill(bm,edges=bad,sides=0)['faces']
        item['proposed_caps']=[{'area':f.calc_area(),'points':[list(v.co) for v in f.verts],
            'extent':max(max(v.co[i] for v in f.verts)-min(v.co[i] for v in f.verts) for i in range(3))} for f in caps]
    topology.append(item);bm.free()
(output/'source-topology.json').write_text(json.dumps(topology,indent=2)+'\n')
(output/'legend.json').write_text(json.dumps({'source_sha256':entry['atlas']['atlas_sha256'],
    'canonical_forward':'-Y','wheels':[dict(w,colour=c) for w,c in zip(plan['wheels'],colours)],
    'status':'source isolation only; cuts and motion not qualified'},indent=2)+'\n')
print('F1_WHEEL_ISOLATION_COMPLETE',team)
