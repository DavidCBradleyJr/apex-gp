// Injected into the local canvas preview (see test/preview.sh). Headless Chromium only renders a few frames, so
// instead of driving we fast-forward the sim with the autopilot and then freeze on the state we want to look at.
//   ?pose=tel             two laps (second one slower), telemetry screen open
//   ?pose=ghost&t=16      best lap set, then t seconds of a slower lap so the ghost is just ahead
//   ?pose=race&t=20       t seconds into a race with the player on the autopilot (&pace=0.99 &skill=pro)
//   ?pose=lights          on the grid with all five lights on
//   ?pose=result          a finished 3-lap race, results screen
//   ?pose=at&s=780&v=80   parked in time at lap distance s doing v m/s (&d= lateral offset, &bt=950 disc temperature,
//                         &skid=1 arrives there with the brakes locked so skid marks are laid)
//   &view=2.4,7,2.5 fixed camera around the car (angle from the nose in rad, radius, height)
//   &time=7 sun elevation in degrees (7 = golden hour)
//   &cam=0|1|2 camera, &pause=1 show the pause menu instead of the frozen HUD
(function () {
  const make = ApexGP.create, q = new URLSearchParams(location.search), num = (k, d) => +(q.get(k) || d);
  ApexGP.create = function (canvas, opts) {
    if (q.has('track')) opts = Object.assign({}, opts, { track: q.get('track') }); // &track=virel|callow
    const game = window.__game = make(canvas, opts), sim = game.sim, DT = 1 / 240;
    const drive = (until, pace) => { let n = 0; while (!until() && n++ < 240 * 900) { const inp = ApexGP.autopilot(sim, 8, pace); if (game.race) game.race.step(DT, inp); else sim.step(DT, inp); } };
    const pose = q.get('pose');
    if (q.get('menu') === 'race') setTimeout(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'RACE'); if (b) b.click(); }, 400); // ?menu=race: menu with race mode picked
    if (q.get('menu') === 'track' && !window.__switched) { window.__switched = 1; setTimeout(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim().startsWith('Circuit')); if (b) { b.click(); b.click(); } }, 400); } // ?menu=track: change circuit twice in the menu
    if (pose) setTimeout(() => {
      const racing = pose === 'race' || pose === 'result';
      game.begin(Object.assign(racing ? { mode: 'race', laps: 3, skill: q.get('skill') || 'pro' } : {}, q.has('time') ? { time: num('time', 38) } : {})); game.state.phase = 'run'; game.state.armed = false;
      if (pose === 'tel') { drive(() => sim.lapsDone.length >= 1, 1); drive(() => sim.lapsDone.length >= 2, 0.97); game.showTelemetry(true); }
      if (pose === 'ghost') { drive(() => sim.lapsDone.length >= 1, 0.9); drive(() => sim.lapsDone.length >= 2, 1); const t0 = sim.t; drive(() => sim.t - t0 > num('t', 16), num('pace', 0.97)); }
      if (pose === 'race') drive(() => sim.t > num('t', 20), num('pace', 0.99));
      if (pose === 'at') {
        const v = num('v', 80), put = (at) => { sim.placeAt(at, num('d', 0)); sim.vx = v * Math.cos(sim.psi); sim.vz = v * Math.sin(sim.psi); sim.gear = 7; sim.lap = 1; };
        if (q.has('skid')) { put(num('s', 780) - 90); sim.setup.abs = false; for (let n = 0; n < 240 * 1.6; n++) { sim.step(DT, { analog: true, steer: n > 150 ? 0.5 : 0, throttle: 0, brake: 1 }); if (n % 3 === 0) game.fx.skid(); } }
        else put(num('s', 780));
        if (q.has('bt')) sim.brakeT.fill(num('bt', 950));
      }
      if (pose === 'lights') { Object.assign(game.state, { phase: 'lights', lightsT: 5.1, holdT: 1e9 }); }
      if (pose === 'result') { drive(() => game.race.over, num('pace', 0.95)); game.state.phase = 'finished'; }
      if (q.has('steer')) { sim.steer = num('steer', 0); sim.roadAngle = sim.steer * 0.32; } // &steer=0.6 turns the cockpit wheel and the front tyres
      game.camera(num('cam', 0));
      if (q.has('view')) { const [va, vr, vh] = q.get('view').split(',').map(Number); game.state.poseCam = { a: va, r: vr, h: vh }; } // &view=angle(rad from nose),radius,height
      // freeze: the page keeps rendering but nothing moves
      sim.step = () => {}; if (game.race) game.race.step = () => {};
      if (q.has('pause')) game.state.phase = 'paused';
      // &perf=1: log what one frame costs (draw calls and triangles across every pass) and the biggest meshes
      if (q.has('perf')) setTimeout(() => {
        const r = game.renderer; r.info.autoReset = false; r.info.reset();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const top = []; game.scene.traverse(o => { if (o.isMesh && o.geometry) { const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); top.push([Math.round(n), o.isInstancedMesh ? 'inst' : '', o.visible, o.castShadow ? 'shadow' : ''].join(' ')); } });
          top.sort((a, b) => parseInt(b) - parseInt(a));
          console.log('PERF frames', r.info.render.frame, 'calls', r.info.render.calls, 'tris', r.info.render.triangles, 'geoms', r.info.memory.geometries, 'tex', r.info.memory.textures, 'pr', r.getPixelRatio(), '| top:', top.slice(0, 14).join(', '));
        }));
      }, 3000);
    }, 50);
    return game;
  };
})();
