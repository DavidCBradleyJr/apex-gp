// Run through browser_run_code_unsafe with the project served on loopback :8779. No hardware adapter is passed.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 720 } }); page = await context.newPage();
  const assert = (value, message) => { if (!value) throw Error(message); };
  const errors = [], requests = {}; let failCadillac = false, delayedTeam = '';
  const onError = error => errors.push(error.message); page.on('pageerror', onError);
  await page.unroute('**/vendor/f1-models/*.glb');
  try {
  await page.route('**/vendor/f1-models/*.glb', async route => {
    const id = /\/([^/]+)\.glb$/.exec(new URL(route.request().url()).pathname)[1]; requests[id] = (requests[id] || 0) + 1;
    if (id === 'cadillac' && failCadillac) return route.fulfill({ status: 503, body: 'Model unavailable' });
    if (id === delayedTeam) await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue().catch(() => {}); // An obsolete team request is intentionally aborted.
  });
  await page.goto('http://127.0.0.1:8779/src/play.html?team=mclaren&pose=steer&cam=0&quality=0&line=off');
  const ready = async id => page.waitForFunction(id => latestTelemetry && latestTelemetry.ready && latestTelemetry.modelTeam === id && game.scene.getObjectByName('player-car').userData.modelTeam === id && (!game.race || game.race.cars.filter(c => c.ai).every(c => game.scene.getObjectByName('opponent-' + c.code)?.children[0]?.userData.modelTeam === c.team)), id, { timeout: 45000 });
  await ready('mclaren');
  await page.evaluate(() => { window.disposedMcLaren = 0; game.scene.getObjectByName('body').geometry.addEventListener('dispose', () => window.disposedMcLaren++); });
  const teams = await page.evaluate(() => ApexGP.TEAMS.map(t => t[0]));
  const models = [];
  for (const id of teams.filter(id => id !== 'apex')) {
    await page.evaluate(id => { game.team(id); game.state.phase = 'paused'; game.state.poseCam = { a: .7, r: 8, h: 2.7 }; game.sim.roadAngle = .21; }, id);
    await ready(id);
    await page.waitForFunction(() => {
      const wheels = []; game.scene.getObjectByName('player-car').traverse(o => { if (o.userData.wheel !== undefined) wheels.push(o); });
      return wheels.length === 4 && wheels.every(o => Math.abs(o.rotation.y - (o.userData.wheel < 2 ? -.21 : 0)) < 1e-6);
    });
    models.push(await page.evaluate(id => {
      const player = game.scene.getObjectByName('player-car'), entry = APEX_TEAM_CARS[id], model = player.children[0], wheels = [];
      player.traverse(o => { if (o.userData.wheel !== undefined) wheels.push(o); }); wheels.sort((a, b) => a.userData.wheel - b.userData.wheel);
      if (!model.getObjectByName(entry.root)) throw Error('Wrong model for ' + id);
      wheels.forEach((node, i) => { if (node.position.distanceTo(new THREE.Vector3(...entry.wheels[i].position)) > 1e-5) throw Error('Pivot changed: ' + id); });
      window.wheelSpinBefore = wheels.map(o => o.children[0].rotation.z);
      game.sim.vx = 12 * Math.cos(game.sim.psi); game.sim.vz = 12 * Math.sin(game.sim.psi);
      return { team: id, root: entry.root, sha256: model.userData.modelSha, wheelPivots: wheels.map(o => o.position.toArray()), memory: { ...game.renderer.info.memory } };
    }, id));
    await page.waitForFunction(() => {
      const wheels = []; game.scene.getObjectByName('player-car').traverse(o => { if (o.userData.wheel !== undefined) wheels.push(o); }); wheels.sort((a, b) => a.userData.wheel - b.userData.wheel);
      return wheels.every((o, i) => Math.abs(o.children[0].rotation.z - window.wheelSpinBefore[i]) > .01);
    });
    await page.evaluate(() => { game.sim.vx = game.sim.vz = 0; });
  }
  assert(await page.evaluate(() => window.disposedMcLaren === 1), 'Replaced McLaren geometry was not released exactly once');
  await page.evaluate(() => game.team('apex')); await ready('apex');
  assert(await page.evaluate(() => { let n = 0; game.scene.getObjectByName('player-car').traverse(o => { if (o.userData.wheel !== undefined) n++; }); return n === 4; }), 'Original Apex wheel hierarchy failed');
  delayedTeam = 'mercedes';
  await page.evaluate(() => { game.team('mercedes'); game.team('williams'); game.team('audi'); }); await ready('audi');
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => game.scene.getObjectByName('player-car').children.length === 1 && game.scene.getObjectByName('player-car').children[0].userData.modelTeam === 'audi'), 'Obsolete load replaced the latest team');
  delayedTeam = '';
  await page.evaluate(() => { game.team('ferrari'); }); await ready('ferrari');
  await page.evaluate(() => { game.begin({ mode: 'race', laps: 1 }); game.state.phase = 'paused'; }); await ready('ferrari');
  const field = await page.evaluate(() => game.race.cars.filter(c => c.ai).map(c => {
    const actor = game.scene.getObjectByName('opponent-' + c.code), model = actor.children[0];
    if (!model || model.userData.modelTeam !== c.team || !model.getObjectByName(APEX_TEAM_CARS[c.team].root)) throw Error('Opponent uses the wrong team: ' + c.code);
    return { code: c.code, team: c.team, root: model.getObjectByName(APEX_TEAM_CARS[c.team].root).name };
  }));
  assert(new Set(field.map(c => c.root)).size === 5, 'Race field did not load five distinct opponent models');
  const mclarenRequests = requests.mclaren;
  await page.evaluate(() => {
    const actor = game.scene.children.find(o => o.name.startsWith('opponent-') && o.userData.modelTeam === 'mclaren');
    window.sharedGeometry = actor.getObjectByName('body').geometry; window.sharedDisposals = 0;
    sharedGeometry.addEventListener('dispose', () => window.sharedDisposals++); game.team('mclaren');
  }); await ready('mclaren');
  assert(requests.mclaren === mclarenRequests, 'A teammate fetched the model again');
  assert(await page.evaluate(() => game.scene.getObjectByName('player-car').getObjectByName('body').geometry === window.sharedGeometry), 'Player and opponent did not share geometry');
  assert(await page.evaluate(() => {
    const player = game.scene.getObjectByName('player-car'), opponent = game.scene.children.find(o => o.name.startsWith('opponent-') && o.userData.modelTeam === 'mclaren');
    const glows = []; for (const actor of [player, opponent]) { const found = []; actor.traverse(o => { if (o.userData.glow) found.push(o); }); glows.push(found); }
    return glows.every(g => g.length === 4) && glows[0].every((g, i) => g.material !== glows[1][i].material);
  }), 'Brake-glow materials are shared between cars');

  await page.evaluate(() => game.team('audi')); await ready('audi');
  assert(await page.evaluate(() => window.sharedDisposals === 0), 'Player swap disposed geometry still used by an opponent');
  await page.evaluate(() => game.menu());
  assert(await page.evaluate(() => window.sharedDisposals === 1 && !game.scene.children.some(o => o.name.startsWith('opponent-'))), 'Race cleanup did not release the last opponent lease');
  failCadillac = true;
  await page.evaluate(() => game.team('cadillac'));
  await page.waitForFunction(() => latestTelemetry && latestTelemetry.modelError.includes('Cadillac') && !latestTelemetry.ready);
  assert(await page.evaluate(() => game.scene.getObjectByName('player-car').children.length === 0), 'Failed team silently used another car');
  await page.evaluate(() => game.begin({ mode: 'race' })); await page.waitForTimeout(300);
  assert(await page.evaluate(() => game.state.lightsT === 0), 'Start lights advanced before the requested model loaded');
  await page.evaluate(() => game.menu()); failCadillac = false;
  await page.evaluate(() => game.team('cadillac')); await ready('cadillac');
  await page.evaluate(() => {
    game.state.phase = 'paused'; game.state.ghost = true; const sim = game.sim;
    sim.bestRec = { n: 3, lapTime: 3, t: new Float32Array([0, 1, 2]), x: new Float32Array([sim.x + 12, sim.x + 22, sim.x + 32]), z: new Float32Array([sim.z, sim.z, sim.z]), psi: new Float32Array([sim.psi, sim.psi, sim.psi]), v: new Float32Array([20, 20, 20]), thr: new Float32Array([1, 1, 1]), brk: new Float32Array(3) };
    sim.lap = 1; sim.t = .5; sim.lapStart = 0;
  });
  await page.waitForFunction(() => game.scene.getObjectByName('ghost-car')?.visible === true);
  const ghost = await page.evaluate(() => {
    const ghost = game.scene.getObjectByName('ghost-car'), player = game.scene.getObjectByName('player-car'), glows = [], wheels = [];
    ghost.traverse(o => { if (o.userData.glow) glows.push(o); if (o.userData.wheel !== undefined) wheels.push(o); });
    if (ghost.userData.modelTeam !== 'cadillac' || ghost.getObjectByName('body').geometry !== player.getObjectByName('body').geometry || glows.some(o => o.visible)) throw Error('Ghost lost its selected model or hidden brake glows');
    window.ghostSpin = wheels[0].children[0].rotation.z;
    return { team: ghost.userData.modelTeam, positionErrorM: Math.hypot(ghost.position.x - (game.sim.x + 17), ghost.position.z - game.sim.z), transparent: ghost.getObjectByName('body').material.transparent };
  });
  assert(ghost.positionErrorM < 1e-4 && ghost.transparent, 'Ghost playback changed');
  await page.waitForFunction(() => { const nodes = []; game.scene.getObjectByName('ghost-car').traverse(o => { if (o.userData.wheel !== undefined) nodes.push(o); }); return Math.abs(nodes[0].children[0].rotation.z - window.ghostSpin) > .01; });
  await page.evaluate(() => {
    const body = game.scene.getObjectByName('player-car').getObjectByName('body'); window.finalDisposals = { geometry: 0, texture: 0 };
    body.geometry.addEventListener('dispose', () => finalDisposals.geometry++); body.material.map.addEventListener('dispose', () => finalDisposals.texture++); game.destroy();
  });
  assert(await page.evaluate(() => finalDisposals.geometry === 1 && finalDisposals.texture === 1), 'Destroy did not release the selected model exactly once');
  // Delay the real GLTF callback so destroy occurs after decoding, rather than only aborting fetch.
  await page.evaluate(() => {
    window.oldParse = THREE.GLTFLoader.prototype.parse;
    THREE.GLTFLoader.prototype.parse = function (buffer, path, onLoad, onError) {
      return oldParse.call(this, buffer, path, gltf => {
        if (gltf.scene.getObjectByName('Ferrari_SF26_PROTOTYPE')) { window.lateParsed = gltf.scene; setTimeout(() => onLoad(gltf), 500); }
        else onLoad(gltf);
      }, onError);
    };
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    window.lateGame = ApexGP.create(canvas, { team: 'ferrari', quality: 0 }); window.lateDisposals = 0;
  });
  await page.waitForFunction(() => window.lateParsed);
  await page.evaluate(() => { lateParsed.getObjectByName('body').geometry.addEventListener('dispose', () => window.lateDisposals++); lateGame.destroy(); THREE.GLTFLoader.prototype.parse = oldParse; });
  await page.waitForTimeout(700);
  assert(await page.evaluate(() => lateDisposals === 1 && lateGame.scene.getObjectByName('player-car').children.length === 0), 'Decoded model leaked or attached after destroy');
  assert(errors.length === 0, 'Runtime errors: ' + errors.join('; '));
  await page.unroute('**/vendor/f1-models/*.glb');
  const report = { status: 'PASS local per-team integration', models, field, ghost, requests, checks: ['11 team imports and wheel steering/rolling', 'original Apex import', 'latest team wins', 'own-team opponents', 'shared geometry survives player swap', 'independent brake glows', 'matching ghost playback and rolling', 'last lease and destroy disposal', 'visible failure and retry', 'start waits for models', 'late decoded result disposed'], limits: ['Software renderer only; full reference appearance, active aero, accurate team POV and real-GPU performance remain unqualified.'] };
  return report;
  } finally { await page.unroute('**/vendor/f1-models/*.glb'); page.off('pageerror', onError); await context.close(); }
}
