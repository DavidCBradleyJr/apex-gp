"""Rebuild inspected source tyre outer halves; retain only identified inboard links."""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix,Vector

root=Path(__file__).resolve().parents[1]/'assets/f1-2026'
team=sys.argv[sys.argv.index('--')+1]
ledger=json.loads((root/'production.json').read_text())
entry=next(t for t in ledger['teams'] if t['id']==team)
plan=entry['wheel_reconstruction_plan']
assert plan['canonical_forward']=='-Y' and len(plan['wheels'])==4
assert [w['name'] for w in plan['wheels']]==['front_right','front_left','rear_right','rear_left']
source=root/entry['atlas']['atlas']
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
assert source_hash==entry['atlas']['atlas_sha256']
output=root/f'models/{team}/derivatives/atlas-rebuilt-wheels.glb'
evidence=root/f'evidence/{team}-rebuilt-wheels'
evidence.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)==entry['model']['mesh_count']
assert sum(len(o.data.polygons) for o in meshes)==entry['model']['triangle_count']
rotation=Matrix.Rotation(plan['rotation_to_canonical_z'],4,'Z')
for o in meshes:
    o.data.transform(rotation@o.matrix_world)
    o.parent=None;o.matrix_world=Matrix.Identity(4)


def black_uv(bm,faces):
    uv=bm.loops.layers.uv.verify()
    for face in faces:
        for i,loop in enumerate(face.loops):
            angle=i*math.tau/len(face.loops)
            loop[uv].uv=(2042/2048+math.cos(angle)/2048,6/2048+math.sin(angle)/2048)


report={'status':'source-derived tyre reconstruction; runtime rig and engine checks pending',
        'source_sha256':source_hash,'canonical_forward':'-Y','parts':[],
        'limits':plan.get('limits','Mirrored inner tyre faces/lettering and fixed axle connectors are inferred; measured uprights/brakes remain due.')}
for wheel in plan['wheels']:
    part,sign=wheel['part'],wheel['lateral_sign']
    assert sign in [-1,1]
    tyre=bpy.data.objects[f'tripo_part_{part}']
    if wheel.get('moving_source_parts'):
        assert all(p not in [w['part'] for w in plan['wheels']] for p in wheel['moving_source_parts'])
        bpy.ops.object.select_all(action='DESELECT');tyre.select_set(True)
        expected_faces=len(tyre.data.polygons)
        for p in wheel['moving_source_parts']:
            extra=bpy.data.objects[f'tripo_part_{p}'];extra.select_set(True);expected_faces+=len(extra.data.polygons)
        bpy.context.view_layer.objects.active=tyre;bpy.ops.object.join()
        assert len(tyre.data.polygons)==expected_faces
    selection_report=None
    if wheel.get('fixed_source_components'):
        rule=wheel['fixed_source_components'];bm=bmesh.new();bm.from_mesh(tyre.data)
        bm.faces.ensure_lookup_table();seen=set();selected=set();components=0
        for start_vertex in bm.verts:
            if start_vertex in seen:continue
            stack=[start_vertex];seen.add(start_vertex);island=[]
            while stack:
                vertex=stack.pop();island.append(vertex)
                for edge in vertex.link_edges:
                    other=edge.other_vert(vertex)
                    if other not in seen:seen.add(other);stack.append(other)
            inboard=max(abs(v.co.x) for v in island)<rule['max_abs_lateral']
            if inboard and rule.get('radial_centre_yz'):
                cy,cz=rule['radial_centre_yz']
                radial=max(math.hypot(v.co.y-cy,v.co.z-cz) for v in island)
                lo,hi=rule['tyre_foreaft_bounds']
                inboard=(radial<rule['max_radial_distance'] or
                         min(v.co.y for v in island)<lo or max(v.co.y for v in island)>hi)
            fixed=inboard or max(v.co.z for v in island)>rule['above_z']
            if fixed:
                selected.update(f.index for v in island for f in v.link_faces);components+=1
        selection={'part':part,'selected_faces':len(selected),'total_faces':len(bm.faces),'components':components,'rule':rule}
        (evidence/f'stationary-selection-part-{part}.json').write_text(json.dumps(selection,indent=2)+'\n')
        assert selected and len(selected)<len(bm.faces)/2,('Unexpected stationary source selection',selection)
        original_count=len(bm.faces);bm.free()
        stationary=bpy.data.objects.new(f'tripo_part_{part}_stationary',tyre.data.copy())
        bpy.context.scene.collection.objects.link(stationary)
        for target,keep_selected in [(stationary,True),(tyre,False)]:
            bm=bmesh.new();bm.from_mesh(target.data);bm.faces.ensure_lookup_table()
            remove=[f for f in bm.faces if (f.index in selected)!=keep_selected]
            bmesh.ops.delete(bm,geom=remove,context='FACES')
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
            bm.to_mesh(target.data);bm.free()
        assert len(stationary.data.polygons)+len(tyre.data.polygons)==original_count
        assert max(v.co.z for v in tyre.data.vertices)<=rule['above_z']
        selection_report={'components':components,'stationary_triangles':len(selected),
                          'source_triangles':original_count,'rule':rule,'source_face_count_conserved':True}
    if wheel.get('preserve_source'):
        bm=bmesh.new();bm.from_mesh(tyre.data);bm.faces.ensure_lookup_table()
        nxy=bm.loops.layers.uv.new('__normal_xy');nz=bm.loops.layers.uv.new('__normal_z')
        for face,poly in zip(bm.faces,tyre.data.polygons):
            for loop,index in zip(face.loops,poly.loop_indices):
                assert loop.vert.index==tyre.data.loops[index].vertex_index
                n=tyre.data.corner_normals[index].vector
                loop[nxy].uv=(n.x,n.y);loop[nz].uv=(n.z,0)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
        topology={'part':part,'boundary_edges':sum(e.is_boundary for e in bm.edges),
                  'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges)}
        if topology['nonmanifold_edges'] and wheel.get('repair_small_source_holes'):
            bad=[e for e in bm.edges if not e.is_manifold]
            assert all(e.is_boundary for e in bad),'Overlapping source surfaces need inspection'
            area=sum(f.calc_area() for f in bm.faces)
            caps=bmesh.ops.holes_fill(bm,edges=bad,sides=0)['faces']
            fraction=sum(f.calc_area() for f in caps)/area
            diameter=max(v.co.z for v in bm.verts)-min(v.co.z for v in bm.verts)
            assert caps and fraction<.01
            assert all(max(max(v.co[i] for v in f.verts)-min(v.co[i] for v in f.verts)
                           for i in range(3))<.25*diameter for f in caps)
            black_uv(bm,caps);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
            bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.normal_update()
            normals=[]
            for face in bm.faces:
                for loop in face.loops:
                    n=Vector((loop[nxy].uv.x,loop[nxy].uv.y,loop[nz].uv.x))
                    normals.append(n.normalized() if n.length>.5 else face.normal.copy())
            assert all(e.is_manifold for e in bm.edges),'Source repair did not close tyre'
            bm.to_mesh(tyre.data)
            tyre.data.uv_layers.remove(tyre.data.uv_layers['__normal_xy'])
            tyre.data.uv_layers.remove(tyre.data.uv_layers['__normal_z'])
            assert len(normals)==len(tyre.data.loops) and len(tyre.data.uv_layers)==1
            tyre.data.normals_split_custom_set(normals)
            topology.update(small_source_hole_caps=len(caps),cap_area_fraction=fraction,
                            repaired_nonmanifold_edges=0)
        bm.free()
        (evidence/f'preserved-part-{part}-topology.json').write_text(json.dumps(topology,indent=2)+'\n')
        assert topology.get('repaired_nonmanifold_edges',topology['nonmanifold_edges'])==0,('Preserved source tyre is not closed',topology)
        report['parts'].append(dict(name=wheel['name'],source_preserved=True,
                                   moving_triangles=len(tyre.data.polygons),**topology))
        continue
    original=tyre.data.copy()
    points=[v.co.copy() for v in original.vertices]
    zlo,zhi=min(p.z for p in points),max(p.z for p in points)
    centre_y=(min(p.y for p in points)+max(p.y for p in points))/2
    centre_z=(zlo+zhi)/2
    outer=max(sign*p.x for p in points)
    ratio=.280/.705 if wheel['name'].startswith('front') else .375/.710
    width=(zhi-zlo)*ratio
    mid=sign*(outer-width/2)
    kept_links=None
    if wheel['keep_inboard_to_abs'] is not None:
        plane=sign*wheel['keep_inboard_to_abs']
        links=bpy.data.objects.new(f'tripo_part_{part}_inboard',original.copy())
        bpy.context.scene.collection.objects.link(links)
        bm=bmesh.new();bm.from_mesh(links.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
        before=sum(e.is_boundary for e in bm.edges)
        result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=1e-8,plane_co=(plane,0,0),plane_no=(sign,0,0),clear_outer=True)
        cut=[e for e in result['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_valid and e.is_boundary]
        caps=bmesh.ops.holes_fill(bm,edges=cut,sides=0)['faces'] if cut else []
        black_uv(bm,caps)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        source_gap_caps=[]
        if sum(e.is_boundary for e in bm.edges)>before:
            old_area=sum(f.calc_area() for f in bm.faces)
            source_gap_caps=bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)['faces']
            gap_area=sum(f.calc_area() for f in source_gap_caps)
            print('SOURCE_LINK_GAP_CAPS',part,len(source_gap_caps),gap_area,old_area,flush=True)
            assert gap_area<.3*old_area,'Large source link opening needs manual reconstruction'
            black_uv(bm,source_gap_caps)
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
            bmesh.ops.triangulate(bm,faces=list(bm.faces))
        seen=set();duplicates=[]
        for face in bm.faces:
            key=frozenset(face.verts)
            if key in seen:duplicates.append(face)
            else:seen.add(key)
        if duplicates:bmesh.ops.delete(bm,geom=duplicates,context='FACES_ONLY')
        if not len(bm.faces) or sum(e.is_boundary for e in bm.edges)>before:
            diagnostic={'part':part,'plane':plane,'faces':len(bm.faces),'source_boundaries':before,
                'cut_edges':len(cut),'caps':len(caps),'boundary_edges':[{'points':[list(v.co) for v in e.verts],
                'faces':len(e.link_faces)} for e in bm.edges if e.is_boundary]}
            (evidence/f'fixed-link-cut-part-{part}.json').write_text(json.dumps(diagnostic,indent=2)+'\n')
            print('FIXED_LINK_CUT_DIAGNOSTIC',part,len(bm.faces),before,len(diagnostic['boundary_edges']),flush=True)
        assert len(bm.faces)>0 and sum(e.is_boundary for e in bm.edges)<=before
        interface=[v.co for v in bm.verts if abs(v.co.x-plane)<1e-7]
        fraction=max(math.hypot(p.y-centre_y,p.z-centre_z) for p in interface)/((zhi-zlo)/2)
        assert fraction<.85,('Hub cut crosses tyre shoulder',part,fraction)
        kept_links={'triangles':len(bm.faces),'raw_lateral_cut':plane,'cut_max_radial_fraction':fraction,
                    'original_source_gap_caps':len(source_gap_caps),'removed_duplicate_triangles':len(duplicates)}
        bm.to_mesh(links.data);bm.free()
        assert not links.data.validate(verbose=True,clean_customdata=False),'Fixed link mesh remains invalid'
    bm=bmesh.new();bm.from_mesh(tyre.data)
    # Segmented cover seams can differ by microunits; use only an inspected bounded tolerance.
    seam_tolerance=wheel.get('seam_weld_tolerance_raw',1e-7)
    assert 0<seam_tolerance<=1e-5
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=seam_tolerance)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-8,
        plane_co=(mid,0,0),plane_no=(sign,0,0),clear_inner=True)
    for v in bm.verts:v.co.x-=mid
    bm.to_mesh(tyre.data);bm.free()
    mirror=tyre.modifiers.new('Reconstruct source outer half','MIRROR')
    mirror.use_axis=(True,False,False);mirror.use_mirror_merge=True;mirror.merge_threshold=1e-7
    bpy.context.view_layer.objects.active=tyre
    bpy.ops.object.modifier_apply(modifier=mirror.name)
    for v in tyre.data.vertices:v.co.x+=mid
    bm=bmesh.new();bm.from_mesh(tyre.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bad=[e for e in bm.edges if not e.is_manifold]
    patched=[]
    if bad:
        diagnostic={'part':part,'boundary_edges':sum(e.is_boundary for e in bad),
            'edges':[{'points':[list(v.co) for v in e.verts],'linked_faces':len(e.link_faces),
                      'faces':[[list(v.co) for v in f.verts] for f in e.link_faces]} for e in bad]}
        (evidence/f'nonmanifold-part-{part}.json').write_text(json.dumps(diagnostic,indent=2)+'\n')
        print('SOURCE_TYRE_TOPOLOGY_DIAGNOSTIC',part,len(bad),diagnostic['boundary_edges'],flush=True)
        assert all(e.is_boundary for e in bad),('Overlapping source faces require inspection',part)
        old_area=sum(f.calc_area() for f in bm.faces)
        patched=bmesh.ops.holes_fill(bm,edges=bad,sides=0)['faces']
        assert patched and sum(f.calc_area() for f in patched)<.01*old_area
        for face in patched:
            assert max(max(v.co[i] for v in face.verts)-min(v.co[i] for v in face.verts) for i in range(3))<.25*(zhi-zlo)
            face.smooth=True
        black_uv(bm,patched)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
    assert all(e.is_manifold for e in bm.edges),('Reconstructed tyre is not closed',part)
    bm.to_mesh(tyre.data);bm.free()
    assert all(outer-width-1e-6<=sign*v.co.x<=outer+1e-6 for v in tyre.data.vertices)
    # shortcut: fixed shafts bridge to inferred hubs; replace with measured uprights/brakes before final acceptance.
    start=sign*wheel['axle_start_abs']
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.008,depth=abs(mid-start),
        location=((mid+start)/2,centre_y,centre_z),rotation=(0,math.pi/2,0))
    axle=bpy.context.object;axle.name=f'tripo_part_{part}_axle'
    axle.data.materials.append(tyre.data.materials[0])
    bm=bmesh.new();bm.from_mesh(axle.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));black_uv(bm,list(bm.faces))
    bm.to_mesh(axle.data);bm.free()
    report['parts'].append({'name':wheel['name'],'part':part,'midplane_raw_x':mid,
        'raw_width':width,'outer_raw_lateral':outer,'moving_triangles':len(tyre.data.polygons),
        'fixed_links':kept_links,'fixed_axle_radius_raw':.008,'small_source_hole_caps':len(patched),
        'fixed_source_components':selection_report,'joined_source_parts':wheel.get('moving_source_parts',[]),
        'source_seam_weld_tolerance_raw':seam_tolerance})
    bpy.data.meshes.remove(original)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
expected_meshes=len(meshes);triangles=sum(len(o.data.polygons) for o in meshes)
bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=False)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(output))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)==expected_meshes and sum(len(o.data.polygons) for o in meshes)==triangles
for o in meshes:
    assert all(math.isfinite(c) for v in o.data.vertices for c in v.co)
    if o.name in {f"tripo_part_{w['part']}" for w in plan['wheels']}:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        assert all(e.is_manifold for e in bm.edges),o.name
        bm.free()
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x,scene.render.resolution_y=1200,900;scene.render.resolution_percentage=100
scene.display.shading.color_type='TEXTURE';scene.display.shading.show_cavity=True;scene.display.shading.cavity_type='BOTH'
bpy.ops.object.camera_add();camera=bpy.context.object
camera.data.type,camera.data.ortho_scale='ORTHO',1.2;scene.camera=camera
for name,pos in {'front-oblique':(.8,-2,1),'rear-oblique':(.8,2,1),'top':(0,0,2)}.items():
    camera.location=pos;camera.rotation_euler=(Vector((0,0,.1))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(evidence/(name+'.png'));bpy.ops.render.render(write_still=True)
for o in meshes:o.hide_render=o.name not in {f"tripo_part_{w['part']}" for w in plan['wheels']}
scene.render.filepath=str(evidence/'tyres-only-top.png');bpy.ops.render.render(write_still=True)
if any(w.get('fixed_source_components') for w in plan['wheels']):
    for o in meshes:o.hide_render=not o.name.endswith('_stationary')
    camera.location=(-1,-2,1);camera.data.ortho_scale=1.2
    camera.rotation_euler=(Vector((0,0,.1))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(evidence/'stationary-source-only.png');bpy.ops.render.render(write_still=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
report.update(file=str(output.relative_to(root)),sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
    bytes=output.stat().st_size,meshes=expected_meshes,triangles=triangles,
    root_name=plan['root_name'],part_ids=[w['part'] for w in plan['wheels']])
(evidence/'inspection.json').write_text(json.dumps(report,indent=2)+'\n')
print('F1_SOURCE_TYRES_REBUILT',team,json.dumps(report))
