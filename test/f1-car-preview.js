// Qualification uses the integrated per-team loader and the current renderer.
// No hardware input/feedback adapter is passed to the game.
(async function () {
  const out = document.getElementById('result'), q = new URLSearchParams(location.search);
  const { modelRoot, team, triangles } = document.body.dataset;
  const wheelPilot = document.body.dataset.wheelPilot === '1';
  const leftGrip = document.body.dataset.leftGrip === '1';
  const expectedTriangles = Number(triangles);
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  let model, wheels, pilotWheel, pilotHand, report, ready = false;
  const game = ApexGP.create(document.getElementById('c'), { team, quality: 1,
    onTelemetry(t) { if (t.ready) ready = true; } });
  let renderCamera;
  if (wheelPilot) {
    const render = game.renderer.render.bind(game.renderer);
    game.renderer.render = (scene, camera) => { renderCamera = camera; render(scene, camera); };
  }
  game.state.poseCam = { a: 0.7, r: 8, h: 2.7 };
  if (wheelPilot) { game.state.poseCam = null; game.camera(2); }
  game.state.phase = 'paused';
  game.sim.roadAngle = 0;
  async function pose(angle) {
    game.sim.roadAngle = angle; game.sim.vx = game.sim.vz = 0;
    await frame(); await frame();
    game.scene.updateMatrixWorld(true);
  }
  function vertex(mesh) {
    return new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0)
      .applyMatrix4(mesh.matrixWorld).applyMatrix4(model.matrixWorld.clone().invert());
  }
  function pilotPoint(mesh,index) {
    const point=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index);
    if(mesh.isSkinnedMesh) { mesh.skeleton.update(); mesh.boneTransform(index,point); }
    return point.applyMatrix4(mesh.matrixWorld);
  }
  function handPoints() {
    const inverse=pilotWheel.matrixWorld.clone().invert(),points=[];
    for(let i=0;i<pilotHand.geometry.attributes.position.count;i+=31) points.push(pilotPoint(pilotHand,i).applyMatrix4(inverse));
    return points;
  }
  async function check() {
    try {
      document.querySelector('aside').inert = true;
      if (wheelPilot) { game.state.poseCam = null; game.camera(2); }
      await pose(0);
      const body = model.getObjectByName('body'), fixed = body.matrixWorld.clone();
      const pivots = wheels.map(o => o.position.clone());
      const initial = wheels.map(o => vertex(o.children[0].children[0]));
      const initialHand=leftGrip ? handPoints() : null;
      let handExportBoundsError;
      if(leftGrip) {
        const bounds=new THREE.Box3(),inverse=pilotWheel.matrixWorld.clone().invert();
        for(let i=0;i<pilotHand.geometry.attributes.position.count;i++) bounds.expandByPoint(pilotPoint(pilotHand,i).applyMatrix4(inverse));
        const expected=JSON.parse(document.body.dataset.handBounds);
        handExportBoundsError=Math.max(...bounds.min.toArray().map((v,i)=>Math.abs(v-expected.min[i])),...bounds.max.toArray().map((v,i)=>Math.abs(v-expected.max[i])));
        assert(handExportBoundsError<2e-5,'held hand differs from verified Blender export');
      }
      const samples = [];
      for (const angle of [0.16, 0.32, -0.16, -0.32, 0]) {
        await pose(angle);
        wheels.forEach((w, i) => {
          assert(Math.abs(w.rotation.y - (i < 2 ? -angle : 0)) < 1e-6, 'steering angle ' + i);
          assert(w.position.distanceTo(pivots[i]) < 1e-8, 'axle moved ' + i);
          const delta = vertex(w.children[0].children[0]).distanceTo(initial[i]);
          assert(i < 2 && angle ? delta > 0.001 : delta < 1e-5, 'unexpected tyre motion ' + i);
        });
        assert(body.matrixWorld.equals(fixed), 'fixed body moved');
        let wheelNdc,handRelativeError,handAssemblyNdc,handCropped;
        if (pilotWheel) {
          assert(Math.abs(pilotWheel.parent.rotation.x - angle / ApexGP.CAR.maxLock * Math.PI) < 1e-6, 'cockpit wheel steering');
          const bounds = new THREE.Box3(),assemblyBounds=new THREE.Box3();
          pilotWheel.traverse(o => { if (o.isMesh) {
            const p = o.geometry.attributes.position;
            for (let i = 0; i < p.count; i++) {
              const projected=pilotPoint(o,i).project(renderCamera);assemblyBounds.expandByPoint(projected);
              if(o!==pilotHand) bounds.expandByPoint(projected);
            }
          } });
          assert([...bounds.min.toArray(), ...bounds.max.toArray()].every(v => Number.isFinite(v) && Math.abs(v) < 1), 'cockpit wheel clipped at ' + angle + ': ' + JSON.stringify([bounds.min.toArray(), bounds.max.toArray()]));
          const face = game.scene.getObjectByName('ferrari_wheel_live_display');
          const eye = renderCamera.getWorldPosition(new THREE.Vector3());
          for (const x of [-.035, 0, .035]) for (const y of [-.020, 0, .020]) {
            const point = face.localToWorld(new THREE.Vector3(x, y, 0));
            const ray = new THREE.Raycaster(eye, point.sub(eye).normalize());
            const hits = ray.intersectObjects([pilotWheel, face], true);
            assert(hits.length && hits[0].object === face, 'live display obscured by wheel geometry');
          }
          wheelNdc = { min: bounds.min.toArray(), max: bounds.max.toArray() };
          if(leftGrip) {
            const current=handPoints();handRelativeError=Math.max(...current.map((p,i)=>p.distanceTo(initialHand[i])));
            assert(handRelativeError<2e-5,'hand slips relative to wheel during steering');
            handAssemblyNdc={min:assemblyBounds.min.toArray(),max:assemblyBounds.max.toArray()};
            handCropped=[...handAssemblyNdc.min,...handAssemblyNdc.max].some(v=>Math.abs(v)>=1);
          }
        }
        samples.push({ roadAngle: angle, frontAngles: wheels.slice(0, 2).map(w => w.rotation.y),
          ...(pilotWheel ? { cockpitWheelAngle: pilotWheel.parent.rotation.x, wheelNdc } : {}),
          ...(leftGrip ? {handRelativeError,handAssemblyNdc,handCropped} : {}) });
      }
      // Drive poseCar's own rolling path, then compare actual wheel vertices.
      const before = wheels.map(w => w.children[0].rotation.z), distances = [];
      game.sim.vx = Math.cos(game.sim.psi); game.sim.vz = Math.sin(game.sim.psi);
      await frame(); await frame();
      game.sim.vx = game.sim.vz = 0;
      await frame(); await frame(); game.scene.updateMatrixWorld(true);
      wheels.forEach((w, i) => {
        distances.push(vertex(w.children[0].children[0]).distanceTo(initial[i]));
        assert(w.children[0].rotation.z < before[i] - 1e-6, 'rolling did not advance ' + i);
        assert(distances[i] > 1e-5, 'rolling vertex did not move ' + i);
        w.children[0].rotation.z = 0;
      });
      await pose(0);
      const bounds = new THREE.Box3(), inverse = model.matrixWorld.clone().invert();
      model.traverse(o => { if (o.isMesh && !o.userData.glow) {
        const p = o.geometry.attributes.position, matrix = inverse.clone().multiply(o.matrixWorld);
        for (let i = 0; i < p.count; i++) bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix));
      } });
      const size = bounds.getSize(new THREE.Vector3()).toArray(), gl = game.renderer.getContext();
      assert(size.every(Number.isFinite) && size[0] > 5 && size[0] < 5.7 && size[2] <= 1.901, 'model-space dimensions '+JSON.stringify(size));
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      report = { status: 'PASS — sampled game motion only; visual acceptance remains open', team, three: THREE.REVISION,
        engineSourceSha256: document.body.dataset.engineSha, exteriorAssetSha256: document.body.dataset.assetSha,
        importAdapter: 'current integrated per-team loader; preserved metre-scale hierarchy and atlas',
        meshes: [], pivots: wheels.map(w => ({ name: w.name, index: w.userData.wheel, position: w.position.toArray() })),
        samples, rollingVertexDistances: distances, modelSpaceSize: size,
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        renderer: { calls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles,
          textures: game.renderer.info.memory.textures, geometries: game.renderer.info.memory.geometries },
        limitations: ['not production accepted', 'no accurate POV', 'wing/branding corrections pending',
          'sampled motion does not prove continuous clearance', 'frame counters include the track and other passes; not a performance benchmark'] };
      model.traverse(o => { if (o.isMesh && !o.userData.glow) report.meshes.push({ name: o.name,
        triangles: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3,
        texture: [o.material.map.image.width, o.material.map.image.height] }); });
      assert(report.meshes.length === 5, 'mesh count changed');
      assert(report.meshes.reduce((n, m) => n + m.triangles, 0) === expectedTriangles, 'triangle count changed');
      if (pilotWheel) {
        let pilotTriangles = 0, pilotMeshes = 0;
        pilotWheel.traverse(o => { if (o.isMesh) { pilotMeshes++;
          pilotTriangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          assert(o.material.map.image.width === 2048, 'wheel atlas');
        } });
        const handTriangles=leftGrip ? Number(document.body.dataset.handTriangles) : 0;
        assert(pilotMeshes === (leftGrip ? 2 : 1) && pilotTriangles === Number(document.body.dataset.wheelTriangles || 46878)+handTriangles, 'cockpit wheel runtime count');
        const face = game.scene.getObjectByName('ferrari_wheel_live_display'), texture = face.material.map;
        assert(texture.image.width === 384 && texture.image.height === 256 && face.parent === pilotWheel.parent, 'live display attachment');
        const previous = texture.image.toDataURL(), version = texture.version;
        game.sim.gear = game.sim.gear === 4 ? 0 : 4;
        const deadline = performance.now() + 2000;
        while (texture.version === version && performance.now() < deadline) await frame();
        assert(texture.version > version && texture.image.toDataURL() !== previous, 'dashboard did not update');
        report.cockpitWheel = { sha256: document.body.dataset.wheelSha, meshes: pilotMeshes, triangles: pilotTriangles, atlas: [2048, 2048],
          liveDisplayUpdated: true, liveDisplayUnobscuredAtSamplePoints: true, hands: leftGrip ? 'left only' : false,
          ...(leftGrip ? {leftHand:{triangles:handTriangles,bones:pilotHand.skeleton.bones.length,handExportBoundsError}} : {}),
          limits: leftGrip ? 'generic cockpit; thumb self-intersections/local stretch, cuff/sleeve fit, right hand, arms and full POV remain unaccepted' : 'provisional scale/pivot/display fit; generic cockpit; rear/paddles and contact unaccepted' };
        if(leftGrip && samples.some(s=>s.handCropped)) {
          report.status='PARTIAL — sampled steering/display pass; whole hand/cuff framing fails in generic cockpit';
          report.limitations.push('Whole hand/cuff leaves the frame at sampled quarter turns; complete POV framing unaccepted.');
        }
      }
      out.textContent = JSON.stringify(report, null, 2); console.log('CAR_ENGINE_CHECK', JSON.stringify(report));
    } catch (error) { out.textContent = 'FAIL: ' + error.message; console.error(error); }
    finally { document.querySelector('aside').inert = false; }
  }
  document.getElementById('poses').onclick = e => {
    if (e.target.dataset.steer !== undefined) pose(+e.target.dataset.steer);
    if (e.target.id === 'roll') wheels.forEach(w => w.children[0].rotation.z -= Math.PI / 2);
  };
  document.getElementById('views').onclick = e => {
    if (e.target.dataset.view) { const [a, r, h] = e.target.dataset.view.split(',').map(Number); game.state.poseCam = { a, r, h }; }
    if (e.target.dataset.cam) { game.state.poseCam = null; game.state.phase = 'paused'; game.camera(+e.target.dataset.cam); }
  };
  document.getElementById('check').onclick = check;
  document.getElementById('save').onclick = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = team + (leftGrip ? '-left-grip' : '') + '-engine-check.json'; a.click(); URL.revokeObjectURL(url);
  };
  try {
    const deadline = performance.now() + 30000;
    while (!ready && performance.now() < deadline) await frame();
    assert(modelRoot && Number.isInteger(expectedTriangles) && expectedTriangles > 0, 'missing expected asset metadata');
    model = game.scene.getObjectByName(modelRoot);
    assert(model, team + ' prototype failed to load (fallback is not success)');
    wheels = []; model.traverse(o => { if (o.userData.wheel !== undefined) wheels.push(o); });
    wheels.sort((a, b) => a.userData.wheel - b.userData.wheel);
    assert(wheels.length === 4 && wheels.every((w, i) => w.userData.wheel === i), 'wheel hierarchy');
    assert(wheels.every(w => w.children.length === 2 && w.children[0].children[0].isMesh && w.children[1].userData.glow), 'spin/brake-glow hierarchy');
    if (wheelPilot) {
      while (!(pilotWheel = game.scene.getObjectByName('Ferrari_SF26_WHEEL_PILOT')) && performance.now() < deadline) await frame();
      assert(pilotWheel, 'Ferrari cockpit wheel failed to load');
      if(leftGrip) {
        pilotHand=pilotWheel.getObjectByName('ferrari_left_glove_trial');
        assert(pilotHand && pilotHand.isSkinnedMesh && pilotHand.skeleton.bones.length===17,'left-hand rig missing');
      }
    }
    await check();
    if (q.has('view')) { const [a, r, h] = q.get('view').split(',').map(Number); game.state.poseCam = { a, r, h }; }
  } catch (error) { out.textContent = 'FAIL: ' + error.message; console.error(error); }
})();
