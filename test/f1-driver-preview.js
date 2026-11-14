/* Isolated r147 import check for the preserved Ferrari bilateral driver trial. */
(async () => {
  const result = document.querySelector('pre'), check = (ok, message) => { if (!ok) throw Error(message); };
  try {
    const [buffer, expected] = await Promise.all([
      fetch('asset.glb').then(r => { check(r.ok, 'Asset load failed'); return r.arrayBuffer(); }),
      fetch('export-check.json').then(r => { check(r.ok, 'Evidence load failed'); return r.json(); })
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
    const parts = { left_sleeve: meshes.ferrari_left_sleeve_trial, right_sleeve: meshes.ferrari_right_sleeve_trial, left_glove: meshes.ferrari_left_glove_trial, right_glove: meshes.ferrari_right_glove_trial, wheel: meshes.ferrari_wheel_rigid };
    const skinned = Object.values(parts).filter(o => o.isSkinnedMesh);
    check(Object.keys(meshes).length === 5 && skinned.length === 4, 'Unexpected mesh hierarchy');
    check(skinned.reduce((n, mesh) => n + mesh.skeleton.bones.length, 0) === expected.bones, 'Bone count changed');
    check(gltf.animations.length === 1, 'Expected one synchronized steering clip');
    const mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(gltf.animations[0]);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    function pose(frame) {
      action.reset().play();
      // The scene export retains frame 1 at 1/24 s, rather than shifting it to zero.
      mixer.setTime(frame / 24); scene.updateMatrixWorld(true);
      for (const mesh of skinned) mesh.skeleton.update();
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
    const frames = expected.renderer_frames || [1, 1.5, 13, 25, 49, 73, 97, 121, 145, 169, 193, 217, 241, 265, 289];
    const samples = [];
    for (const frame of frames) {
      const reference = expected.checks.find(c => c.frame === frame); check(reference, 'Missing authoring sample ' + frame);
      pose(frame); let maximumBoundsError = 0, maximumVertexError = 0, checkedVertices = 0;
      for (const [name, mesh] of Object.entries(parts)) {
        const actual = bounds(mesh);
        if (reference.vertices_game) {
          check(reference.vertices_game[name].length === 128, 'Missing raw GLB vertex probes');
          for (const sample of reference.vertices_game[name]) {
            const point = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, sample.i);
            if (mesh.isSkinnedMesh) mesh.boneTransform(sample.i, point);
            point.applyMatrix4(mesh.matrixWorld);
            maximumVertexError = Math.max(maximumVertexError, point.distanceTo(new THREE.Vector3(...sample.xyz)));
            checkedVertices++;
          }
        }
        for (const side of ['min', 'max']) for (let axis = 0; axis < 3; axis++) {
          maximumBoundsError = Math.max(maximumBoundsError, Math.abs(actual[side][axis] - reference.bounds_game[name][side][axis]));
        }
      }
      check(maximumBoundsError < 1e-5, 'Imported skin bounds differ at frame ' + frame + ' by ' + maximumBoundsError + ' m');
      check(maximumVertexError < 1e-5, 'Imported raw-index skin positions differ at frame ' + frame + ' by ' + maximumVertexError + ' m');
      samples.push({ frame, maximumBoundsError, maximumVertexError, checkedVertices });
    }
    const context = renderer.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
    const report = {
      status: expected.status.startsWith('PASS') ? 'PASS sampled import and skin synchronization; full POV incomplete' : 'PARTIAL: renderer checks pass; exported mechanics fail',
      assetSha256: digest, engine: THREE.REVISION,
      renderer: context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER),
      bones: expected.bones, triangles: Object.values(meshes).reduce((n, m) => n + m.geometry.index.count / 3, 0),
      clips: gltf.animations.map(a => a.name), samples,
      exportedSurfaceStatus: expected.status,
      renderCounts: { ...renderer.info.render }, textureCount: renderer.info.memory.textures,
      limits: expected.renderer_limits || ['Both arms/hands are diagnostic. Right-side markings are mirrored. No cockpit fit, appearance, continuous clearance, performance or production acceptance.']
    };
    for (const [label, frame] of [['Centre', 1], ['Left 90°', 73], ['Right 90°', 25], ['Left 180°', 145], ['Right 180°', 241]]) {
      const button = document.createElement('button'); button.textContent = label; button.onclick = () => pose(frame); document.querySelector('#poses').append(button);
    }
    const save = document.createElement('button'); save.textContent = 'Save evidence JSON';
    save.onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'ferrari-two-arm-driver-engine.json'; link.click(); URL.revokeObjectURL(url); };
    document.querySelector('#poses').append(save); window.driverCheck = report; window.driverPose = pose; pose(1); result.textContent = JSON.stringify(report, null, 2); document.body.dataset.check = expected.status.startsWith('PASS') ? 'pass' : 'partial';
  } catch (error) { result.textContent = 'FAIL: ' + error.message; document.body.dataset.check = 'fail'; }
})();
