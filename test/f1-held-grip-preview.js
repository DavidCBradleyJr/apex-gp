/* Isolated r147 verification of the qualified held-glove skin; no game installation. */
(async () => {
  const result = document.querySelector('pre');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  try {
    const root = '/assets/f1-2026/';
    const expected = await fetch(root + (document.body.dataset.evidence || 'evidence/ferrari-right-held-grip-rig/inspection.json')).then(r => { check(r.ok, 'Evidence load failed'); return r.json(); });
    const buffer = await fetch(root + expected.file).then(r => { check(r.ok, 'GLB load failed'); return r.arrayBuffer(); });
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
    check(sha === expected.sha256, 'Asset and evidence differ');
    const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(buffer, '', resolve, reject));
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#202630'); scene.add(gltf.scene);
    const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    const hand = meshes.find(o => o.name === (document.body.dataset.hand || 'ferrari_right_held_glove_trial'));
    check(meshes.length === 2 && hand && hand.isSkinnedMesh, 'Expected one glove skin and one rigid wheel');
    check(hand.skeleton.bones.length === 17 && hand.geometry.index.count / 3 === 62512, 'Skin structure changed');
    check(meshes.reduce((n, o) => n + o.geometry.index.count / 3, 0) === 109895, 'Triangle count changed');
    check(gltf.animations.length === 1 && gltf.animations[0].name === expected.animations[0], 'Clip changed');
    const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true });
    renderer.setSize(innerWidth, innerHeight); renderer.outputEncoding = THREE.sRGBEncoding;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x454a59, 1));
    const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(-1, 2, 3); scene.add(light);
    const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, .001, 10);
    camera.position.set(-.72, .24, .38); camera.lookAt(-.07, -.01, .025);
    const mixer = new THREE.AnimationMixer(gltf.scene), action = mixer.clipAction(gltf.animations[0]);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    function pose(frame) {
      action.reset().play(); mixer.setTime(frame / 24); scene.updateMatrixWorld(true); hand.skeleton.update(); renderer.render(scene, camera);
    }
    function bounds() {
      const box = new THREE.Box3(), position = hand.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(position, i);
        hand.boneTransform(i, p); p.applyMatrix4(hand.matrixWorld);
        check(p.toArray().every(Number.isFinite), 'Non-finite skin position'); box.expandByPoint(p);
      }
      return { min: box.min.toArray(), max: box.max.toArray() };
    }
    const samples = [];
    for (const reference of expected.checks) {
      pose(reference.frame); const actual = bounds(); let error = 0;
      for (const side of ['min', 'max']) for (let axis = 0; axis < 3; axis++) error = Math.max(error, Math.abs(actual[side][axis] - reference.bounds_game[side][axis]));
      let vertexError = 0;
      for (const sample of reference.vertices_game) {
        const p = new THREE.Vector3().fromBufferAttribute(hand.geometry.attributes.position, sample.i);
        hand.boneTransform(sample.i, p); p.applyMatrix4(hand.matrixWorld);
        vertexError = Math.max(vertexError, p.distanceTo(new THREE.Vector3(...sample.xyz)));
      }
      check(reference.vertices_game.length > 100 && vertexError < 1e-5, 'Author/engine vertex positions differ at frame ' + reference.frame + ': ' + vertexError);
      check(error < 1e-5, 'Author/engine skin bounds differ at frame ' + reference.frame + ': ' + error);
      samples.push({ frame: reference.frame, maximumBoundsErrorM: error, maximumVertexErrorM: vertexError, checkedVertices: reference.vertices_game.length });
    }
    const context = renderer.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
    const report = { status: 'PASS sampled r147 held-skin import and clip correspondence; driver unaccepted', assetSha256: sha,
      engine: THREE.REVISION, renderer: context.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : context.RENDERER),
      meshes: 2, handTriangles: 62512, wheelTriangles: 47383, bones: 17, clips: gltf.animations.map(a => a.name), samples,
      renderCounts: { ...renderer.info.render }, limits: expected.limits };
    for (const [label, frame] of [['Held', 1], ['Index release', 9], ['Middle release', 25], ['Ring release', 41], ['Pinky release', 57], ['Thumb release', 73]]) {
      const button = document.createElement('button'); button.textContent = label; button.onclick = () => pose(frame); document.querySelector('#poses').append(button);
    }
    window.gripCheck = report; window.gripPose = pose;
    pose(1); result.textContent = JSON.stringify(report, null, 2); document.body.dataset.check = 'pass';
  } catch (error) { result.textContent = 'FAIL: ' + error.message; document.body.dataset.check = 'fail'; }
})();
