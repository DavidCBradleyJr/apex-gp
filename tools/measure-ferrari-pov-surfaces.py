"""Fit live display/mirror overlays to the preserved Ferrari driver and cockpit surfaces."""
import bpy, hashlib, json, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

repo=Path(__file__).resolve().parents[1];root=repo/'assets/f1-2026'
driver=root/'models/ferrari/pov/driver/derivatives/ferrari-two-arm-visibility-trial.glb'
car=root/'models/ferrari/derivatives/ferrari-halo-correction-trial.glb'
assert hashlib.sha256(driver.read_bytes()).hexdigest()=='44cc20a10643a9effe1f2d3395294a7e0e3862bc1166c6ed947d70f4c5c89b1e'
assert hashlib.sha256(car.read_bytes()).hexdigest()=='aaa8a3dba4832a872d79315cef1b5fe2e98b8b82ad31f1b2455190bafed040ef'

def tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world@v.co for v in obj.data.vertices],[tuple(f.vertices) for f in obj.data.polygons],all_triangles=True)

def surface(lookup,origin_x,lateral_range,height_range,columns,rows,mirror_side=0):
    positions=[];uvs=[];indices=[];normals=[]
    for row in range(rows):
        v=row/(rows-1);height=height_range[0]+v*(height_range[1]-height_range[0])
        for column in range(columns):
            u=column/(columns-1);lateral=lateral_range[0]+u*(lateral_range[1]-lateral_range[0])
            hit=lookup.ray_cast(Vector((origin_x,-lateral,height)),Vector((1,0,0)),2)
            assert hit[0] is not None,('Missing overlay support',lateral,height)
            if not mirror_side:assert hit[1].x<-.3,('Overlay support is not a front face',lateral,height,list(hit[1]))
            p=hit[0];positions += [p.x-.001,p.z,-p.y];normals.append(list(hit[1]))
            uvs += [(1 if mirror_side<0 else .5)-u*.5 if mirror_side else u,v]
            if row<rows-1 and column<columns-1:
                i=row*columns+column;indices += [i,i+1,i+columns+1,i,i+columns+1,i+columns]
    offset=.001
    if mirror_side:
        # Glass stays planar; the generated housing has folds, so fit ahead of its sampled rear surface.
        points=np.array(positions).reshape(-1,3);matrix=np.column_stack((np.ones(len(points)),points[:,1],points[:,2]))
        fitted=matrix@np.linalg.lstsq(matrix,points[:,0],rcond=None)[0]
        fitted+=np.min(points[:,0]-fitted)
        offset=float(np.max(points[:,0]-fitted))+.001
        points[:,0]=fitted;positions=points.reshape(-1).tolist()
    for start in range(0,len(indices),3):
        a,b,c=[Vector(positions[i*3:i*3+3]) for i in indices[start:start+3]]
        assert (b-a).cross(c-a).x<0,'Overlay winding must face the driver'
    return {'positions':positions,'uvs':uvs,'indices':indices,'maximum_forward_offset_m':offset,'source_normals_blender':normals}

bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(driver))
bpy.context.scene.frame_set(97);bpy.context.view_layer.update()
lcd=surface(tree(bpy.data.objects['ferrari_wheel_rigid']),-1,[-.040,.040],[.005,.057],9,7)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(car))
body=tree(bpy.data.objects['body'])
mirrors=[surface(body,.35,[-.66,-.53] if side<0 else [.53,.66],[.721,.758],9,7,side) for side in [-1,1]]
report={'driver_sha256':hashlib.sha256(driver.read_bytes()).hexdigest(),'car_sha256':hashlib.sha256(car.read_bytes()).hexdigest(),
        'lcd':lcd,'mirrors':mirrors,'limits':['The display follows its measured generated surface; mirror glass is fitted ahead of sampled housing folds. Housing edges and physical dimensions remain inferred and visually unaccepted.','Mirror images use the existing shared rear-view render, not individually ray-traced optics.']}
output=root/'models/ferrari/pov/driver/game-surfaces.json';output.write_text(json.dumps(report,indent=2)+'\n')
print('FERRARI_GAME_SURFACES_MEASURED',output,flush=True)
