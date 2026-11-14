"""Verify exported prototype tyre topology and finite mesh data against the ledger."""
import bpy,bmesh,hashlib,json,math,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'assets/f1-2026'
team=sys.argv[sys.argv.index('--')+1]
entry=next(t for t in json.loads((root/'production.json').read_text())['teams'] if t['id']==team)['runtime_prototype']
source=root/entry['file']
assert hashlib.sha256(source.read_bytes()).hexdigest()==entry['sha256']
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)==5 and sum(len(o.data.polygons) for o in meshes)==entry['triangle_count']
report={'status':'PASS exported topology and finite data; appearance, fit and continuous clearance remain separate gates',
        'team':team,'sha256':entry['sha256'],'tyres':[]}
points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
report['bounds_blender']={'min':[min(p[i] for p in points) for i in range(3)],
                          'max':[max(p[i] for p in points) for i in range(3)]}
def silhouette_radii(segments):
    radii=[]
    for k in range(128):
        x,z=math.cos(k*math.tau/128),math.sin(k*math.tau/128);hits=[]
        for ax,az,dx,dz in segments:
            den=x*dz-z*dx
            if abs(den)<1e-12:continue
            t=(ax*dz-az*dx)/den;u=(ax*z-az*x)/den
            if t>0 and -1e-8<=u<=1+1e-8:hits.append(t)
        assert hits,'Projected tyre silhouette is open at a sampled angle'
        radii.append(max(hits))
    return radii

square=silhouette_radii([(-1,-1,2,0),(1,-1,0,2),(1,1,-2,0),(-1,1,0,-2)])
assert abs(min(square)-1)<1e-9 and abs(max(square)-math.sqrt(2))<1e-9
for o in meshes:
    assert all(math.isfinite(c) for v in o.data.vertices for c in v.co)
    assert all(math.isfinite(c) for n in o.data.corner_normals for c in n.vector)
    assert o.data.uv_layers.active and all(math.isfinite(c) for uv in o.data.uv_layers.active.data for c in uv.uv)
    if o.name.startswith('tyre_'):
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges)
        assert boundary==nonmanifold==0,(o.name,boundary,nonmanifold)
        report['tyres'].append({'name':o.name,'boundary_edges':boundary,'nonmanifold_edges':nonmanifold,'seam_weld_tolerance_m':1e-6})
        bm.free()
        wheel=next(w for w in entry['pivots'] if o.name=='tyre_'+w['name'])
        if 'roundness' in wheel:
            segments=[]
            for edge in o.data.edges:
                a,b=(o.data.vertices[i].co for i in edge.vertices)
                segments.append((a.x,a.z,b.x-a.x,b.z-a.z))
            radii=silhouette_radii(segments)
            variation=max(radii)-min(radii)
            assert variation<.003,(o.name,'Exported radial variation',variation)
            report['tyres'][-1]['exported_silhouette']={'angle_samples':128,
                'min_radius_m':min(radii),'max_radius_m':max(radii),'range_m':variation,
                'method':'independent projected-edge positive ray intersections in exported mesh'}
assert len(report['tyres'])==4
(root/f'evidence/{team}-wheel-prototype/roundtrip-topology.json').write_text(json.dumps(report,indent=2)+'\n')
print('F1_EXPORTED_TOPOLOGY_VERIFIED',json.dumps(report))
