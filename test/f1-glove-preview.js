/* Isolated Three.js r147 skin/clip checks; no production game changes. */
(async () => {
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#202630');
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .001, 10);
  camera.position.set(.24, .16, .63); camera.lookAt(0, .045, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x454a59, 1));
  const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(1, 2, 3); scene.add(light);
  const result = document.querySelector('pre');
  try {
    const expectedTriangles = Number(document.body.dataset.triangles);
    const gltf = await new THREE.GLTFLoader().loadAsync(document.body.dataset.assetPath);
    scene.add(gltf.scene);
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    const mesh = meshes[0], mixer = new THREE.AnimationMixer(gltf.scene);
    const check = (value, message) => { if (!value) throw Error(message); };
    check(meshes.length === 1 && mesh.isSkinnedMesh, 'Expected one skinned mesh');
    check(mesh.skeleton.bones.length === 17, 'Expected cuff/wrist and five three-joint digits');
    check(mesh.geometry.index.count / 3 === expectedTriangles, 'Triangle count changed');
    check(mesh.material.map.image.width === 2048 && mesh.material.map.image.height === 2048, 'Expected 2K atlas');
    check(gltf.animations.length === 3, 'Expected three calibration clips');

    function pose(clip, fraction) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip); action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
      mixer.setTime(clip.duration * fraction);
      scene.updateMatrixWorld(true); mesh.skeleton.update(); renderer.render(scene, camera);
    }
    const checkStrain = document.body.dataset.checkStrain === '1';
    function points(step = 7) {
      const p = mesh.geometry.attributes.position, out = [];
      for (let i = 0; i < p.count; i += step) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        mesh.boneTransform(i, v); v.applyMatrix4(mesh.matrixWorld);
        check(v.toArray().every(Number.isFinite), 'Non-finite skinned position'); out.push(v);
      }
      return out;
    }
    const context = renderer.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
    const report = {
      status: 'PASS sampled isolated skin/clip checks; no accepted wheel grip or driver',
      engine: THREE.REVISION, assetSha256: document.body.dataset.assetSha,
      meshes: 1, triangles: expectedTriangles, bones: 17, atlas: [2048, 2048], clips: {},
      renderer: context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER)
    };
    const edges = new Map();
    if (checkStrain) {
      const indices = mesh.geometry.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        for (const [a,b] of [[indices[i],indices[i+1]],[indices[i+1],indices[i+2]],[indices[i+2],indices[i]]]) {
          edges.set(Math.min(a,b) + ':' + Math.max(a,b), [a,b]);
        }
      }
    }
    for (const clip of gltf.animations) {
      pose(clip, 0); const rest = points(checkStrain ? 1 : 7);
      pose(clip, .5); const bent = points(checkStrain ? 1 : 7);
      const moved = Math.max(...rest.map((v, i) => v.distanceTo(bent[i])));
      check(moved > .005, `${clip.name} did not move the mesh`);
      pose(clip, .25); points(); pose(clip, 1); const returned = points(checkStrain ? 1 : 7);
      const error = Math.max(...rest.map((v, i) => v.distanceTo(returned[i])));
      check(error < 1e-5, `${clip.name} failed to return to rest`);
      report.clips[clip.name] = { moved, returnError: error, finiteIntermediateSample: true };
      if (checkStrain) {
        let maxEdgeStretch = 0, edgesOver3x = 0, checkedEdges = 0;
        for (const [a,b] of edges.values()) {
          const length = rest[a].distanceTo(rest[b]);
          if (length <= 1e-6) continue;
          const ratio = bent[a].distanceTo(bent[b]) / length;
          maxEdgeStretch = Math.max(maxEdgeStretch, ratio); checkedEdges++;
          if (ratio > 3) edgesOver3x++;
        }
        check(checkedEdges > 10000 && maxEdgeStretch < 3, `${clip.name} exceeds repaired strain gate`);
        Object.assign(report.clips[clip.name], { maxEdgeStretch, edgesOver3x, checkedEdges, strainSampleFraction: .5 });
      }
      const button = document.createElement('button'); button.textContent = clip.name;
      button.onclick = () => pose(clip, .5); document.querySelector('#clips').append(button);
    }
    pose(gltf.animations[0], 0);
    report.render = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    result.textContent = JSON.stringify(report, null, 2); document.body.dataset.check = 'pass';
    const save = document.createElement('button'); save.textContent = 'Save evidence JSON';
    save.onclick = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type:'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = checkStrain ? 'ferrari-glove-repaired-engine-check.json' : 'ferrari-glove-engine-check.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.querySelector('#clips').append(save);
    document.querySelector('#rest').onclick = () => pose(gltf.animations[0], 0);
    for (const side of [-1, 1]) {
      const button = document.createElement('button'); button.textContent = side < 0 ? 'Palm view' : 'Back view';
      button.onclick = () => { camera.position.set(.24 * side, .16, .63 * side); camera.lookAt(0, .045, 0); renderer.render(scene, camera); };
      document.querySelector('#clips').append(button);
    }
  } catch (error) {
    result.textContent = 'FAIL: ' + error.message; document.body.dataset.check = 'fail'; console.error(error);
  }
})();
