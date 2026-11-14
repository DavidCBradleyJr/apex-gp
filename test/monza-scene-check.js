// Optional browser qualification: src/play.html?track=monza&pose=steer&check=1
(async () => {
  const output = document.createElement('pre'); output.id = 'scene-check';
  output.style.cssText = 'position:fixed;top:auto;bottom:8px;left:8px;color:white;font:12px monospace;text-shadow:0 1px 3px black;pointer-events:none';
  document.body.append(output);
  const assert = (ok,message) => { if (!ok) throw Error(message); };
  try {
    const deadline = performance.now()+30000;
    while ((!game.scene.getObjectByName('monza-tripo-hornbeams') || !latestTelemetry || !latestTelemetry.ready) && performance.now()<deadline) await new Promise(requestAnimationFrame);
    assert(latestTelemetry && latestTelemetry.ready,'car failed to load');
    const group=game.scene.getObjectByName('monza-landmarks'), trees=[];
    assert(group,'Monza landmarks missing');
    game.scene.updateMatrixWorld(true);
    game.scene.traverse(o => { if (o.name==='monza-tripo-hornbeams') trees.push(o); });
    assert(trees.length>0,'Tripo asset failed to load; fallback does not count as success');
    assert(game.scene.getObjectByName('monza-leaf-sprays'),'leaf sprays missing');
    assert(game.scene.getObjectByName('monza-woodland-impostors'),'woodland impostors missing');
    for (let n=0;n<3;n++) await new Promise(requestAnimationFrame);
    let count=0;
    const matrix=new THREE.Matrix4(), point=new THREE.Vector3();
    for (const mesh of trees) {
      assert(mesh.geometry.attributes.color,'foliage colour missing');
      for (let i=0;i<mesh.count;i++) {
        mesh.getMatrixAt(i,matrix); point.setFromMatrixPosition(matrix);
        const loc=game.track.locate(point.x,point.z,-1);
        const wall=loc.d>0?game.track.wallP[loc.i]:game.track.wallM[loc.i];
        assert(Math.abs(loc.d)>wall+8,'tree trunk inside safety corridor'); count++;
      }
    }
    const ray=new THREE.Raycaster(), t=game.track; let probes=0;
    ray.far=4.3;
    for (let i=0;i<t.N;i+=20) for (const d of [-5,0,5]) {
      ray.set(new THREE.Vector3(t.px[i]-t.tz[i]*d,0.2,t.pz[i]+t.tx[i]*d),new THREE.Vector3(0,1,0));
      const hit=ray.intersectObject(group,true)[0];
      assert(!hit,'landmark intersects driving clearance at '+Math.round(i*t.ds)+' m'); probes++;
    }
    const gravel=[]; game.scene.traverse(o=> { if (o.isMesh && o.material.name==='gravel') gravel.push(o); });
    for (const s of [2510,2850,5200]) {
      const i=Math.round(s/t.ds), d=-(t.halfW+6);
      ray.far=20; ray.set(new THREE.Vector3(t.px[i]-t.tz[i]*d,10,t.pz[i]+t.tx[i]*d),new THREE.Vector3(0,-1,0));
      // Foliage raycasts include the transparent part of each card, so probe the track surface directly.
      const hit=ray.intersectObjects(gravel,false)[0];
      assert(hit && hit.point.y>-0.03,'outside gravel has no upward-facing surface at '+s+' m');
    }
    const gl=game.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
    let forestInstances=0,visibleForestInstances=0;
    game.scene.traverse(o=> { if (o.name==='monza-woodland-impostors') { forestInstances+=o.count; if (o.visible) visibleForestInstances+=o.count; } });
    assert(visibleForestInstances>0 && visibleForestInstances<forestInstances*0.6,'distant woodland culling failed');
    const result={status:'PASS',treeInstances:count,treeBuckets:trees.length,clearanceProbes:probes,quality:game.state.quality,
      gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'not exposed',
      visibleGravelProbes:3,forestInstances,visibleForestInstances,note:'posed browser checks, not a GPU performance benchmark'};
    output.textContent=JSON.stringify(result); console.log('MONZA_SCENE_CHECK',JSON.stringify(result));
  } catch(error) { output.textContent='FAIL: '+error.message; console.error(error); }
})();
