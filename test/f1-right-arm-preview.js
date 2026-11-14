/* Isolated r147 import check for the Ferrari right-arm cuff/forearm revision. */
(async () => {
  const result = document.querySelector('pre'), check = (ok, message) => { if (!ok) throw Error(message); };
  try {
    const [buffer, expected] = await Promise.all([
      fetch('asset.glb').then(r => { check(r.ok, 'Asset load failed'); return r.arrayBuffer(); }),
      fetch('engine-samples.json').then(r => { check(r.ok, 'Evidence load failed'); return r.json(); })
    ]);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
    check(digest === expected.sha256, 'Evidence and asset differ');
    const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(buffer, '', resolve, reject));
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
    renderer.setSize(innerWidth, innerHeight); renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#202630'); scene.add(gltf.scene);
    const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, .001, 10);
    camera.position.set(-1.6, .65, -.95); camera.lookAt(-.35, -.02, -.10);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x454a59, 1));
    const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(-1, 2, -3); scene.add(light);
    const meshes = {};
    gltf.scene.traverse(o => { if (o.isMesh) meshes[o.name] = o; });
    const sleeve = meshes.ferrari_right_driving_sleeve_trial, hand = meshes.ferrari_right_driving_glove_trial, wheel = meshes.ferrari_wheel_rigid;
    check(Object.keys(meshes).length === 3 && sleeve.isSkinnedMesh && hand.isSkinnedMesh, 'Unexpected mesh hierarchy');
    check(sleeve.skeleton.bones.length + hand.skeleton.bones.length === expected.bones, 'Bone count changed');
    check(gltf.animations.length === 1, 'Expected one synchronized steering clip');
    const mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(gltf.animations[0]);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    function pose(frame) {
      action.reset().play();
      // The scene export retains frame 1 at 1/24 s, rather than shifting it to zero.
      mixer.setTime(frame / 24); scene.updateMatrixWorld(true);
      for (const mesh of [sleeve, hand]) mesh.skeleton.update();
      renderer.render(scene, camera);
    }
    function bounds(mesh) {
      const box = new THREE.Box3(), position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, i);
        if (mesh.isSkinnedMesh) mesh.boneTransform(i, point);
        point.applyMatrix4(mesh.matrixWorld); check(point.toArray().every(Number.isFinite), 'Non-finite skin position'); box.expandByPoint(point);
      }
      return { min: box.min.toArray(), max: box.max.toArray() };
    }
    const frames = [1, 1.5, 13, 25, 49, 64, 67.5, 73, 79.5, 97, 121, 145, 169, 193, 217, 241, 265, 289];
    const samples = [];
    for (const frame of frames) {
      const reference = expected.checks.find(c => c.frame === frame); check(reference, 'Missing authoring sample ' + frame);
      pose(frame); let maximumBoundsError = 0, maximumVertexError = 0, checkedVertices = 0;
      for (const [name, mesh] of Object.entries({ sleeve, hand, wheel })) {
        const actual = bounds(mesh);
        check(reference.vertices_game[name].length === 128, 'Missing raw GLB vertex probes');
        for (const sample of reference.vertices_game[name]) {
          const point = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, sample.i);
          if (mesh.isSkinnedMesh) mesh.boneTransform(sample.i, point);
          point.applyMatrix4(mesh.matrixWorld);
          maximumVertexError = Math.max(maximumVertexError, point.distanceTo(new THREE.Vector3(...sample.xyz)));
          checkedVertices++;
        }
        for (const side of ['min', 'max']) for (let axis = 0; axis < 3; axis++) {
          maximumBoundsError = Math.max(maximumBoundsError, Math.abs(actual[side][axis] - reference.bounds_game[name][side][axis]));
        }
      }
      check(maximumBoundsError < 1e-5, 'Imported skin bounds differ at frame ' + frame + ' by ' + maximumBoundsError + ' m');
      check(maximumVertexError < 1e-5, 'Raw GLB skin positions differ at ' + frame + ': ' + maximumVertexError);
      samples.push({ frame, maximumBoundsError, maximumVertexError, checkedVertices });
    }
    const context = renderer.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
    const report = {
      status: expected.status.startsWith('PASS') ? 'PASS sampled import and skin synchronization; full POV incomplete' : 'PARTIAL: renderer checks pass; sleeve surface qualification still fails',
      assetSha256: digest, engine: THREE.REVISION,
      renderer: context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER),
      bones: expected.bones, triangles: Object.values(meshes).reduce((n, m) => n + m.geometry.index.count / 3, 0),
      clips: gltf.animations.map(a => a.name), samples,
      exportedSurfaceStatus: expected.status,
      limits: ['One right arm with neutral gray glove and diagnostic sleeve artwork. No accepted bilateral/cockpit/appearance, continuous clearance, performance or production integration.']
    };
    for (const [label, frame] of [['Centre', 1], ['Left 90°', 73], ['Right 90°', 25], ['Left 180°', 145], ['Right 180°', 241]]) {
      const button = document.createElement('button'); button.textContent = label; button.onclick = () => pose(frame); document.querySelector('#poses').append(button);
    }
    const save = document.createElement('button'); save.textContent = 'Save evidence JSON';
    save.onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'ferrari-right-arm-engine.json'; link.click(); URL.revokeObjectURL(url); };
    document.querySelector('#poses').append(save); window.sleeveCheck = report; window.sleevePose = pose; pose(1); result.textContent = JSON.stringify(report, null, 2); document.body.dataset.check = expected.status.startsWith('PASS') ? 'pass' : 'partial';
  } catch (error) { result.textContent = 'FAIL: ' + error.message; document.body.dataset.check = 'fail'; }
})();
