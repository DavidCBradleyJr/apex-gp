"""Build a wheel prototype from a visually inspected, atlased Tripo source.

Blender --factory-startup -b --python this_file.py -- TEAM (with an inspected ledger recipe).
These derivatives still require visual correction, clearance and game acceptance.
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

team = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "mclaren"
asset_root=Path(__file__).resolve().parents[1]/'assets/f1-2026'
prepared=None
cars = {
    "mclaren": ("McLaren_MCL40_PROTOTYPE", 59, 46198, [4, 8, 6, 9], 3.25,
                "Approximate 3.25 m wheelbase from Piola's technical report; width fitted within 1.9 m. Not CAD measurements."),
    # shortcut: Ferrari dimensions use a regulation limit, replace with measured team data before acceptance.
    "ferrari": ("Ferrari_SF26_PROTOTYPE", 73, 47888, [8, 9, 7, 15], 3.4,
                "Provisional 3.4 m wheelbase (regulation maximum, not measured Ferrari data); overhang proportions fitted to the FIA side silhouette. Width fitted within 1.9 m."),
    # shortcut: Red Bull dimensions use a regulation limit, replace with measured team data before acceptance.
    "redbull": ("RedBull_RB22_PROTOTYPE", 20, 48652, [4, 2, 5, 11], 3.4,
                "Provisional 3.4 m wheelbase (regulation maximum, not measured Red Bull data); overhang proportions fitted to the FIA side silhouette. Width fitted within 1.9 m."),
    # shortcut: Mercedes wheelbase is provisional until team-specific measurements are available.
    "mercedes": ("Mercedes_W17_PROTOTYPE", 21, 49478, [3, 4, 5, 6], 3.4,
                 "Provisional 3.4 m wheelbase (regulation maximum, not measured W17 data); measured source tyre centres, nominal tyre dimensions and width within 1.9 m."),
}
if team not in cars:
    entry=next(t for t in json.loads((asset_root/'production.json').read_text())['teams'] if t['id']==team)
    prepared=entry['wheel_reconstruction'];plan=entry['wheel_reconstruction_plan']
    assert prepared['canonical_forward']=='-Y'
    cars[team]=(prepared['root_name'],prepared['meshes'],prepared['triangles'],prepared['part_ids'],
                plan['provisional_wheelbase_m'],plan['scale_note'])
root_name, expected_parts, expected_triangles, part_ids, wheelbase, scale_basis = cars[team]
directory = Path(__file__).resolve().parents[1] / "assets/f1-2026/models" / team
source = directory / "derivatives/atlas-2k.glb"
if team == "mercedes":
    source = directory / "derivatives/atlas-rebuilt-wheels.glb"
    assert hashlib.sha256(source.read_bytes()).hexdigest() == 'f510cd05419e1740d9c64056f424d20f7fe26d82384aae5fcdd051de34f21bfc'
if prepared:
    source=asset_root/prepared['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==prepared['sha256']
output = directory / f"derivatives/{team}-wheel-prototype.glb"
evidence = directory.parents[1] / f"evidence/{team}-wheel-prototype"
evidence.mkdir(parents=True, exist_ok=True)
(evidence / "inspection.json").write_text('{"status":"building; not verified"}\n')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
assert len(meshes) == expected_parts
assert sum(len(o.data.polygons) for o in meshes) == expected_triangles
if team == "redbull":
    # Visually confirmed raw +X nose; normalize to the other sources' -Y nose.
    for o in meshes:
        o.data.transform(Matrix.Rotation(-math.pi / 2, 4, "Z") @ o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
if team == "mercedes":
    # Visually confirmed raw -X nose; normalize to canonical -Y.
    for o in meshes:
        o.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z") @ o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
wheel_parts = [(name, part, diameter, width) for part, (name, diameter, width) in zip(part_ids,
               [("front_right", .705, .280), ("front_left", .705, .280),
                ("rear_right", .710, .375), ("rear_left", .710, .375)])]
by_name = {o.name: o for o in meshes}


def bounds(o):
    points = [o.matrix_world @ v.co for v in o.data.vertices]
    return (Vector([min(p[i] for p in points) for i in range(3)]),
            Vector([max(p[i] for p in points) for i in range(3)]))


def circularize_tyre(obj, centre, radius, refinement_pass=0):
    """Correct the generated radial silhouette, preserving UVs and rim proportions."""
    data = obj.data
    original_triangles=len(data.polygons)
    edges = np.array([tuple(e.vertices) for e in data.edges],dtype=np.int32)
    def profile(points,with_edges=False,angles=None):
        a=points[edges[:,0]][:,[0,2]]
        delta=points[edges[:,1]][:,[0,2]]-a
        cross=a[:,0]*delta[:,1]-a[:,1]*delta[:,0]
        result=[];active=set()
        for angle in (np.arange(512)*math.tau/512 if angles is None else angles):
            x,z=math.cos(angle),math.sin(angle)
            den=x*delta[:,1]-z*delta[:,0]
            valid=np.abs(den)>1e-12
            t=np.divide(cross,den,out=np.zeros_like(den),where=valid)
            u=np.divide(a[:,0]*z-a[:,1]*x,den,out=np.zeros_like(den),where=valid)
            mask=valid & (t>0) & (u>=-1e-8) & (u<=1+1e-8)
            hits=t[mask]
            assert len(hits), 'Missing tyre silhouette ray'
            result.append(float(hits.max()))
            if with_edges:active.add(int(np.flatnonzero(mask)[np.argmax(hits)]))
        return (np.array(result),active) if with_edges else np.array(result)
    silhouette_keys=None
    if prepared:
        _,active=profile(np.array([list(v.co-centre) for v in data.vertices]),with_edges=True)
        # UV seams and mirrored halves need the same refinement along coincident projected edges.
        silhouette_keys={frozenset((round(data.vertices[v].co.x-centre.x,6),round(data.vertices[v].co.z-centre.z,6))
                                  for v in edges[i]) for i in active}
    bm=bmesh.new();bm.from_mesh(data);bm.faces.ensure_lookup_table()
    nxy=bm.loops.layers.uv.new('__normal_xy');nz=bm.loops.layers.uv.new('__normal_z')
    for face,poly in zip(bm.faces,data.polygons):
        for loop,index in zip(face.loops,poly.loop_indices):
            assert loop.vert.index==data.loops[index].vertex_index
            n=data.corner_normals[index].vector
            loop[nxy].uv=(n.x,n.y);loop[nz].uv=(n.z,0)
    long_edges=[];cut_groups={}
    for edge in bm.edges:
        a,b=[v.co-centre for v in edge.verts]
        selected=(frozenset((round(v.x,6),round(v.z,6)) for v in [a,b]) in silhouette_keys if silhouette_keys is not None
                  else min(math.hypot(a.x,a.z),math.hypot(b.x,b.z))>.85*radius)
        if selected:
            angle=abs(math.atan2(math.sin(math.atan2(a.z,a.x)-math.atan2(b.z,b.x)),
                                 math.cos(math.atan2(a.z,a.x)-math.atan2(b.z,b.x))))
            if angle>math.radians(8):
                long_edges.append(edge)
                # Keep the qualified Mercedes recipe stable; newer sources refine long arcs to8 degrees.
                cuts=max(1,math.ceil(angle/math.radians(8))-1) if prepared else 1
                cut_groups.setdefault(cuts,[]).append(edge)
    for cuts,edges_to_split in sorted(cut_groups.items(),reverse=True):
        bmesh.ops.subdivide_edges(bm,edges=[e for e in edges_to_split if e.is_valid],cuts=cuts,use_grid_fill=True)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    interpolated_normals=[Vector((loop[nxy].uv.x,loop[nxy].uv.y,loop[nz].uv.x)).normalized()
                          for face in bm.faces for loop in face.loops]
    bm.to_mesh(data);bm.free()
    data.uv_layers.remove(data.uv_layers['__normal_xy']);data.uv_layers.remove(data.uv_layers['__normal_z'])
    assert len(interpolated_normals)==len(data.loops) and len(data.uv_layers)==1
    data.normals_split_custom_set(interpolated_normals)
    points = np.array([list(v.co-centre) for v in data.vertices],dtype=np.float64)
    original = points.copy()
    corner_normals = [n.vector.copy() for n in data.corner_normals]
    edges = np.array([tuple(e.vertices) for e in data.edges],dtype=np.int32)
    before=profile(points)
    assert np.min(before)>.8*radius and np.max(before)<1.2*radius
    angle=np.mod(np.arctan2(points[:,2],points[:,0]),math.tau)*512/math.tau
    index=np.floor(angle).astype(np.int32)%512
    fraction=angle-np.floor(angle)
    envelope=before[index]*(1-fraction)+before[(index+1)%512]*fraction
    slope=(before[(index+1)%512]-before[index])*512/math.tau
    if prepared:
        # Narrow source features can fall between uniform rays; fit every vertex at its exact angle.
        exact_angles,inverse=np.unique(np.mod(np.arctan2(points[:,2],points[:,0]),math.tau),return_inverse=True)
        envelope=profile(points,angles=exact_angles)[inverse]
        slope=((profile(points,angles=exact_angles+1e-4)-profile(points,angles=exact_angles-1e-4))/2e-4)[inverse]
    scale=radius/envelope
    scale_slope=-radius*slope/(envelope*envelope)
    r2=points[:,0]**2+points[:,2]**2
    gx=np.divide(-scale_slope*points[:,2],r2,out=np.zeros_like(r2),where=r2>1e-16)
    gz=np.divide(scale_slope*points[:,0],r2,out=np.zeros_like(r2),where=r2>1e-16)
    points[:,0]*=scale;points[:,2]*=scale
    axis_scale={}
    for axis in [0,2]:
        low,high=points[:,axis].min(),points[:,axis].max()
        axis_scale[axis]=2*radius/(high-low)
        points[:,axis]=(points[:,axis]-(low+high)/2)*axis_scale[axis]
    for vertex,p in zip(data.vertices,points):
        vertex.co=Vector(p.tolist())+centre
    # Inverse-transpose of the angular radial warp, then the final axis calibration.
    normals=[]
    for loop,n in zip(data.loops,corner_normals):
        i=loop.vertex_index;s=scale[i]
        dot=original[i,0]*n.x+original[i,2]*n.z
        normals.append(Vector(((n.x/s-gx[i]*dot/(s*s))/axis_scale[0],n.y,
                               (n.z/s-gz[i]*dot/(s*s))/axis_scale[2])).normalized())
    data.update();data.normals_split_custom_set(normals)
    after=profile(points)
    if after.max()-after.min()>=.003:
        diagnostic={'mesh':obj.name,'target_radius':radius,'axis_scale':axis_scale,
            'subdivision_groups':{str(c):len(es) for c,es in cut_groups.items()},
            'before_profile':before.tolist(),'after_profile':after.tolist(),
            'source_points':original.tolist(),'warped_points':points.tolist(),
            'edge_indices':edges.tolist()}
        (evidence/f'failed-roundness-{obj.name}-pass-{refinement_pass}.json').write_text(json.dumps(diagnostic)+'\n')
        print('TYRE_ROUNDNESS_DIAGNOSTIC',obj.name,axis_scale,diagnostic['subdivision_groups'],float(before.min()),float(before.max()),flush=True)
        if prepared and refinement_pass<7:
            # Warping changes which lateral surface defines the silhouette; refit the resulting envelope.
            refined=circularize_tyre(obj,centre,radius,refinement_pass+1)
            refined['before_min_radius_m']=float(before.min());refined['before_max_radius_m']=float(before.max())
            refined['added_triangles']=len(data.polygons)-original_triangles
            refined['subdivided_tread_edges']+=len(long_edges)
            for cuts,es in cut_groups.items():
                key=str(cuts);refined['subdivision_groups'][key]=refined['subdivision_groups'].get(key,0)+len(es)
            return refined
    assert after.max()-after.min()<.003, ('Tyre radial variation remains excessive',after.min(),after.max())
    return {'method':'512-angle projected edge envelope; radial warp with transformed normals and nominal axis calibration',
            'before_min_radius_m':float(before.min()),'before_max_radius_m':float(before.max()),
            'after_min_radius_m':float(after.min()),'after_max_radius_m':float(after.max()),
            'target_radius_m':radius,'max_allowed_sampled_radial_range_m':.003,
            'exact_vertex_angle_fit':bool(prepared),
            'refinement_passes':refinement_pass+1,
            'subdivided_tread_edges':len(long_edges),'added_triangles':len(data.polygons)-original_triangles,
            'subdivision_groups':{str(cuts):len(edges) for cuts,edges in cut_groups.items()}}


def axle_centres():
    return [(bounds(by_name[f"tripo_part_{i}"])[0]+bounds(by_name[f"tripo_part_{i}"])[1])/2
            for _,i,_,_ in wheel_parts]

centres = axle_centres()
source_level = None
if prepared and plan.get('level_source_axles'):
    front,rear=(centres[0]+centres[1])/2,(centres[2]+centres[3])/2
    angle=math.atan2(front.z-rear.z,rear.y-front.y)
    assert abs(angle)<math.radians(10),'Large source pitch needs manual inspection'
    for o in meshes:o.data.transform(Matrix.Rotation(angle,4,'X'))
    centres=axle_centres()
    assert abs((centres[0].z+centres[1].z-centres[2].z-centres[3].z)/2)<.001
    source_level={'rotation_x_rad':angle,'method':'rigid pitch from mean source tyre centres; whole body/links/axles move together'}
front_y = (centres[0].y + centres[1].y) / 2
rear_y = (centres[2].y + centres[3].y) / 2
points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
width = max(p.x for p in points) - min(p.x for p in points)
front_diameter = sum((bounds(by_name[f"tripo_part_{i}"])[1].z - bounds(by_name[f"tripo_part_{i}"])[0].z)
                     for i in part_ids[:2]) / 2
sx, sy, sz = wheelbase / (rear_y - front_y), 1.9 / width, .705 / front_diameter
vertical_offset=.3525-sz*(centres[0].z+centres[1].z)/2 if source_level else 0
# Blender X forward, Y left, Z up exports as game X forward, Y up, Z right.
transform = Matrix(((0, -sx, 0, sx * (front_y + rear_y) / 2),
                    (sy, 0, 0, 0), (0, 0, sz, vertical_offset), (0, 0, 0, 1)))
for o in meshes:
    o.data.transform(transform @ o.matrix_world)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)

if team in {"ferrari", "redbull"} or prepared and plan.get('overhang_fit'):
    # Correct generated overhang proportions against the inspected side silhouette.
    half = wheelbase / 2
    fixed = [o for o in meshes if o.name not in {f"tripo_part_{i}" for i in part_ids}]
    lo = min(v.co.x for o in fixed for v in o.data.vertices)
    hi = max(v.co.x for o in fixed for v in o.data.vertices)
    if prepared:
        fit=plan['overhang_fit']
        front_overhang,rear_overhang,axle_span=(fit[k] for k in ('front_overhang_px','rear_overhang_px','axle_span_px'))
    else:
        front_overhang, rear_overhang, axle_span = {"ferrari": (149, 96, 420),
                                                   "redbull": (131, 90, 444)}[team]
    front_ratio = (front_overhang / axle_span * wheelbase) / (hi - half)
    rear_ratio = (rear_overhang / axle_span * wheelbase) / (-half - lo)
    if prepared:
        assert .5<front_ratio<1.5 and .5<rear_ratio<1.5,'Large silhouette correction needs manual reconstruction'
    else:
        assert 0 < front_ratio < 1 and 0 < rear_ratio < 1
    for o in fixed:
        normals = [n.vector.copy() for n in o.data.corner_normals]
        slopes = []
        for v in o.data.vertices:
            slope = front_ratio if v.co.x > half else rear_ratio if v.co.x < -half else 1
            pivot = half if v.co.x > half else -half if v.co.x < -half else 0
            v.co.x = pivot + (v.co.x - pivot) * slope
            slopes.append(slope)
        o.data.update()
        o.data.normals_split_custom_set([(Vector((n.x / slopes[loop.vertex_index], n.y, n.z))).normalized()
                                         for n, loop in zip(normals, o.data.loops)])

root = bpy.data.objects.new(root_name, None)
bpy.context.scene.collection.objects.link(root)
report = {"source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
          "status": "wheel prototype; not accepted or installed in the game",
          "team": team, "root_name": root_name, "wheelbase": wheelbase,
          "scale_basis": scale_basis,
          "tyres": "2026 nominal front 280/705 R18, rear 375/710 R18; generated tyre meshes resized to these dimensions",
          "remaining": ["wing and diffuser correction", "branding correction", "PBR maps", "active wing pivots", "POV cockpit and articulated driver", "game integration and engine qualification"],
          "wheels": []}
if team == "mercedes":
    report['source_wheel_reconstruction'] = 'Clean outer-half-derived tyres; inboard links and provisional axle connectors stay on the body. Earlier pure plane-cut trials are preserved and unaccepted.'
    report['remaining'].append('Measured upright/brake/steering linkage and inner-rim detail')
if prepared:
    report['source_wheel_reconstruction']=prepared['limits']
    report['remaining'].append('Measured upright/brake/steering linkage and inner-rim detail')
if source_level:
    report['source_levelling']=dict(source_level,vertical_offset_m=vertical_offset)
if prepared and plan.get('overhang_fit'):
    report['source_overhang_fit']=dict(plan['overhang_fit'],front_scale=front_ratio,rear_scale=rear_ratio)
wheel_objects = []
for index, (name, part, diameter, tyre_width) in enumerate(wheel_parts):
    mesh = by_name[f"tripo_part_{part}"]
    lo, hi = bounds(mesh)
    centre = (lo + hi) / 2
    size = hi - lo
    desired = centre.copy()
    desired.z = diameter / 2
    # Nominal tyre widths can exceed the raw source's fitted 1.9 m envelope.
    desired.y = math.copysign(min(abs(desired.y), .95 - tyre_width / 2), desired.y)
    mesh.data.transform(Matrix.Translation(desired)
                        @ Matrix.Diagonal((diameter / size.x, tyre_width / size.y, diameter / size.z, 1))
                        @ Matrix.Translation(-centre))
    roundness = circularize_tyre(mesh,desired,diameter/2) if team=='mercedes' or prepared else None
    if roundness:
        expected_triangles+=roundness['added_triangles']
    mesh.data.transform(Matrix.Translation(-desired))
    steer = bpy.data.objects.new("wheel_" + name + "_steer", None)
    spin = bpy.data.objects.new("wheel_" + name + "_spin", None)
    for o in [steer, spin]:
        bpy.context.scene.collection.objects.link(o)
    steer.parent, spin.parent, mesh.parent = root, steer, spin
    steer.location = desired
    steer["wheel"] = index
    mesh.name = "tyre_" + name
    wheel_objects.append(mesh)
    report["wheels"].append({"name": name, "index": index,
                              "pivot_game": [desired.x, desired.z, -desired.y],
                              "lateral_shift": desired.y - centre.y,
                              "diameter": diameter, "width": tyre_width})
    if roundness:
        report['wheels'][-1]['roundness']=roundness

bpy.ops.object.select_all(action="DESELECT")
fixed = [o for o in meshes if o not in wheel_objects]
for o in fixed:
    o.select_set(True)
bpy.context.view_layer.objects.active = fixed[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = "body"
body.parent = root
assert sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == "MESH") == expected_triangles
bpy.ops.wm.save_as_mainfile(filepath=str(directory / f"derivatives/{team}-wheel-prototype.blend"))
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_extras=True, export_animations=False)

# Reimport the exported hierarchy, then exercise steering and rolling independently.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(output))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
all_bounds = [bounds(o) for o in meshes]
assert max(hi.y for lo, hi in all_bounds) - min(lo.y for lo, hi in all_bounds) <= 1.9001
pivots = sorted([o for o in bpy.context.scene.objects if "wheel" in o], key=lambda o: o["wheel"])
assert len(meshes) == 5 and [o["wheel"] for o in pivots] == [0, 1, 2, 3]
assert sum(len(o.data.polygons) for o in meshes) == expected_triangles
for pivot in pivots:
    pivot.rotation_mode = "XYZ"
    pivot.children[0].rotation_mode = "XYZ"
for pivot, (_, _, diameter, tyre_width) in zip(pivots, wheel_parts):
    assert len(pivot.children) == 1 and len(pivot.children[0].children) == 1
    tyre = pivot.children[0].children[0]
    lo, hi = bounds(tyre)
    assert abs((hi - lo).z - diameter) < 1e-4
    assert abs((hi - lo).y - tyre_width) < 1e-4
    assert abs(lo.z) < 1e-4
    assert all(math.isfinite(x) for v in tyre.data.vertices for x in v.co)

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x, scene.render.resolution_y = 1200, 800
scene.render.resolution_percentage = 100
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.light = "STUDIO"
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "BOTH"
bpy.ops.object.camera_add(location=(6, -7, 4))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, .55)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type, camera.data.ortho_scale = "ORTHO", 7.2
scene.camera = camera
fixed_body = bpy.data.objects["body"]
fixed_matrix = fixed_body.matrix_world.copy()
bpy.context.view_layer.update()
rest_matrices = {o.name: o.matrix_world.copy() for o in meshes}
for pose, angle, roll in [("centre", 0, 0), ("left", .32, 0), ("right", -.32, 0), ("rolling", 0, math.pi / 2)]:
    for pivot in pivots:
        pivot.rotation_euler.z = angle if pivot["wheel"] < 2 else 0
        pivot.children[0].rotation_euler.y = roll
    bpy.context.view_layer.update()
    assert fixed_body.matrix_world == fixed_matrix
    for pivot in pivots:
        tyre = pivot.children[0].children[0]
        # Asymmetric spokes move the bounding-box centre; the axle origin must stay fixed.
        assert (tyre.matrix_world.translation - pivot.matrix_world.translation).length < 1e-5
        assert abs(pivot.matrix_basis.to_quaternion().angle - (abs(angle) if pivot["wheel"] < 2 else 0)) < 1e-4
        assert abs(pivot.children[0].matrix_basis.to_quaternion().angle - abs(roll)) < 1e-4
        if roll or (angle and pivot["wheel"] < 2):
            assert max((tyre.matrix_world @ v.co - rest_matrices[tyre.name] @ v.co).length
                       for v in list(tyre.data.vertices)[::20]) > .01
    scene.render.filepath = str(evidence / (pose + ".png"))
    bpy.ops.render.render(write_still=True)
report.update(mesh_count=5, triangle_count=expected_triangles, material_count=1, texture_count=1,
              exported_sha256=hashlib.sha256(output.read_bytes()).hexdigest(), exported_bytes=output.stat().st_size,
              checks="Export reimported: four steer/spin hierarchies, nominal tyre sizes, ground contact, finite tyre coordinates and fixed body through sampled poses. Continuous clearance and engine behavior not established.")
(evidence / "inspection.json").write_text(json.dumps(report, indent=2) + "\n")
print("WHEEL_PROTOTYPE_COMPLETE", str(output))
