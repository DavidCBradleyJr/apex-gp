// Physics sanity check: an autopilot drives 3 laps; lap times, speeds, g-loads and tyre temps must be F1-plausible.
// Run: node test/sim-test.js
const path = require('path');
global.THREE = require(path.join(__dirname, '../vendor/three.min.js'));
const { buildTrack, speedProfile, Sim, autopilot, ghostPose, fmtTime, TRACKS } = require('../src/game.js');
const assert = require('assert');

const track = buildTrack();
const sim = new Sim(track, {});
const vLap = {}; // top speed of each lap: it varies with how much ERS charge the lap starts with
let vmax = 0, gLat = 0, gBrake = 0, impacts = 0, t = 0, Tmin = 1e9, Tmax = 0;
const DT = 1 / 240;
while (sim.lapsDone.length < 3 && t < 400) {
  sim.impact = 0;
  sim.step(DT, autopilot(sim));
  t += DT;
  if (!Number.isFinite(sim.x)) throw new Error('NaN at t=' + t);
  vmax = Math.max(vmax, sim.speed); vLap[sim.lap] = Math.max(vLap[sim.lap] || 0, sim.speed); gLat = Math.max(gLat, Math.abs(sim.ay) / 9.81); gBrake = Math.max(gBrake, -sim.ax / 9.81);
  if (sim.impact > 1) impacts++;
  if (t > 60) sim.tyreT.forEach(T => { Tmin = Math.min(Tmin, T); Tmax = Math.max(Tmax, T); });
}
const laps = sim.lapsDone.map(l => fmtTime(l.time) + (l.valid ? '' : '*') + ' [' + l.sectors.map(s => s && s.toFixed(2)).join(' ') + ']');
console.log('track', track.L.toFixed(0), 'm  drs', track.drs.map(z => z.map(Math.round).join('-')).join(', '));
console.log('laps', laps.join(' | '));
console.log('vmax', (vmax * 3.6).toFixed(0), 'km/h  gLat', gLat.toFixed(2), ' gBrake', gBrake.toFixed(2), ' impacts', impacts, ' tyreT', Tmin.toFixed(0), '-', Tmax.toFixed(0), ' wear', sim.wear.map(w => (w * 100).toFixed(1)).join('/'), '%');
assert(sim.lapsDone.length === 3, 'autopilot should finish 3 laps');
const best = Math.min(...sim.lapsDone.slice(1).map(l => l.time));
assert(best > 55 && best < 80, 'lap time plausible for 4.2 km (about 240 km/h average)');
assert(vmax * 3.6 > 290 && vmax * 3.6 < 360, 'top speed plausible');
assert(gLat > 2 && gLat < 6.5, 'cornering g plausible (autopilot is conservative)');
assert(gBrake > 2.5 && gBrake < 7, 'braking g plausible');
assert(sim.lapsDone.every(l => l.valid), 'autopilot laps stay inside track limits');

// lap recorder + ghost: the best lap replays as a complete, forward-moving trace that closes on the start line
const rec = sim.bestRec, g = {};
assert(rec && rec.lapTime === sim.bestLap, 'best lap was recorded');
assert(rec.t.every((v, i) => v >= 0 && (i === 0 || v >= rec.t[i - 1])), 'recorded times are complete and monotonic');
let prevS = -1, maxOff = 0, maxStep = 0;
for (let k = 0; k <= 400; k++) {
  ghostPose(rec, rec.lapTime * k / 400 * 0.9999, g);
  const l = track.locate(g.x, g.z, -1);
  assert(l.s > prevS, 'ghost moves forward at k=' + k); maxStep = Math.max(maxStep, l.s - prevS); prevS = l.s;
  maxOff = Math.max(maxOff, Math.abs(l.d));
}
assert(maxOff < track.halfW + 0.8, 'ghost stays on the road');
assert(maxStep < 97 * rec.lapTime / 400 * 1.05, 'ghost never jumps');
assert(prevS > track.L - 8, 'ghost finishes the lap at the line: s=' + prevS.toFixed(1));
assert(Math.abs(Math.max(...rec.v) - vLap[rec.lap]) < 3, 'speed trace peaks at that lap\'s top speed');
console.log('ghost: off-centre max', maxOff.toFixed(2), 'm, ends at s', prevS.toFixed(1));

// --- brakes, fuel, track evolution, compounds: a short stint per case ---
const stint = (setup, laps, race) => {
  const tr = buildTrack(), c = new Sim(tr, setup); c.inRace = !!race; speedProfile(tr, c.setup);
  let tt = 0, hit = 0, bMin = 1e9, bMax = 0;
  while (c.lapsDone.length < laps && tt < 120 * laps) {
    c.impact = 0; c.step(DT, autopilot(c)); tt += DT; if (c.impact > 1) hit++;
    if (c.lap >= 2) c.brakeT.forEach(T => { bMin = Math.min(bMin, T); bMax = Math.max(bMax, T); });
  }
  return { c, tr, hit, bMin, bMax, laps: c.lapsDone, best: Math.min(...c.lapsDone.map(l => l.time)) };
};
const light = stint({}, 3), heavy = stint({ fuel: 40 }, 2), hard = stint({ compound: 'hard' }, 3), raceFuel = stint({ fuel: 12 }, 3, true);
console.log('brake discs', light.bMin.toFixed(0), '-', light.bMax.toFixed(0), '°C  | +30 kg fuel costs', (heavy.best - light.best).toFixed(2), 's | hard', fmtTime(hard.best),
  '| race burn', ((12 - raceFuel.c.fuel) / 3).toFixed(2), 'kg/lap | rubber', (light.tr.rubber.reduce((a, b) => a + b) / light.tr.N).toFixed(3));
assert(light.bMin > 250 && light.bMax > 600 && light.bMax < 1100, 'disc temperatures cycle in the carbon working range without fading');
assert(heavy.best - light.best > 0.3 && heavy.best - light.best < 4, 'fuel load costs lap time');
assert(light.c.fuel === 10, 'time trial fuel load is fixed');
assert(raceFuel.c.fuel < 12 - 3 && raceFuel.c.fuel > 12 - 7.5, 'race fuel burns at 1 to 2.5 kg a lap');
assert(hard.hit === 0 && hard.laps.length === 3 && hard.laps.every(l => l.valid) && hard.best > light.best, 'hard tyres: clean valid laps, slower than softs');
const rub = light.tr.rubber; assert(rub.some(v => v > 0.42) && rub.every(v => v >= 0.4 && v <= 1), 'the racing line rubbers in');

// --- rain: wet tyres on a wet track lap cleanly but well off the dry pace; slicks in the rain have half the grip ---
const wet = stint({ wet: true, compound: 'wet' }, 3);
console.log('wet', fmtTime(wet.best), 'vs dry', fmtTime(light.best), ' wet tyre temps', wet.c.tyreT.map(T => T.toFixed(0)).join('/'));
assert(wet.hit === 0 && wet.laps.length === 3 && wet.laps.every(l => l.valid), 'wet laps are clean and valid');
assert(wet.best - light.best > 4 && wet.best - light.best < 25, 'rain costs several seconds a lap');
{
  const grip = (setup) => { const c = new Sim(track, setup); c.placeAt(300, 0); c.vx = 50 * Math.cos(c.psi); c.vz = 50 * Math.sin(c.psi); c.gear = 5; let g = 0; for (let n = 0; n < 240; n++) { c.step(DT, { analog: true, steer: 0, throttle: 0, brake: 1 }); g = Math.max(g, -c.ax); } return g; };
  const gWet = grip({ wet: true, compound: 'wet' }), gSlick = grip({ wet: true, compound: 'soft' });
  assert(gSlick < gWet * 0.75, 'slicks on a wet track stop far worse than wets: ' + gSlick.toFixed(1) + ' vs ' + gWet.toFixed(1));
}
// --- stability: with assists on, holding a steer key on an open skidpad (lifting, braking, flicking) must never spin the car ---
{
  const pad = buildTrack(); pad.halfW = 1e6; pad.wallP.fill(1e7); pad.wallM.fill(1e7);
  const key = { analog: false, steer: 0, throttle: 0, brake: 0 };
  const cases = { power: () => ({ steer: 1, throttle: 1 }), lift: t => ({ steer: 1, throttle: t < 1 ? 1 : 0 }), brake: t => ({ steer: 1, throttle: t < 1 ? 1 : 0, brake: t < 1 ? 0 : 1 }), flick: t => ({ steer: t < 0.7 ? 1 : t < 1.6 ? -1 : 0, throttle: 1 }), pickup: t => ({ steer: 1, throttle: t < 1 ? 0 : 1 }) };
  let worst = 0;
  for (const [v0, gear] of [[25, 2], [40, 3], [60, 5], [80, 7]]) for (const name in cases) {
    const c = new Sim(pad, {}); c.placeAt(300, 0); c.tyreT.fill(95); c.vx = v0 * Math.cos(c.psi); c.vz = v0 * Math.sin(c.psi); c.gear = gear;
    for (let n = 0; n < 240 * 4; n++) {
      c.step(DT, Object.assign({}, key, cases[name](n * DT)));
      const slip = Math.abs(Math.atan2(-c.vx * Math.sin(c.psi) + c.vz * Math.cos(c.psi), Math.abs(c.vx * Math.cos(c.psi) + c.vz * Math.sin(c.psi))));
      if (c.speed > 5) { worst = Math.max(worst, slip); assert(slip < 0.3, name + ' at ' + v0 * 3.6 + ' km/h spins the car'); }
    }
  }
  console.log('stability: worst sideslip', (worst * 57.3).toFixed(1), 'deg');
}
// --- runoff: a trap stops a car that arrives at speed, and the car can drive out of it again ---
{
  let i0 = 0; while (!(track.gravP[i0] === 1 && track.wallP[i0] > 50)) i0++;
  const inTrap = (v0, thr) => { const c = new Sim(track, {}); c.placeAt(i0 * track.ds, 30); c.vx = v0 * Math.cos(c.psi); c.vz = v0 * Math.sin(c.psi); c.gear = v0 ? 5 : 1; let d = 0; for (let n = 0; n < 240 * 5; n++) { c.step(DT, { analog: false, steer: 0, throttle: thr, brake: 0 }); d += c.speed * DT; if (v0 && c.speed < 5) break; } return [c.speed, d, c.surf[0]]; };
  const [, stop] = inTrap(55, 0), [vOut, , surf] = inTrap(0, 1);
  console.log('gravel: coasting in at 198 km/h is down to walking pace in', stop.toFixed(0), 'm; from rest, 5 s of throttle reaches', (vOut * 3.6).toFixed(0), 'km/h on', surf);
  assert(stop < 110, 'gravel stops a car'); assert(vOut > 8, 'a car is not stuck in the gravel');
}
// --- every circuit: the autopilot laps it cleanly, sections keep their distance (scenery and runoff need the room), DRS zones are sane ---
for (const def of TRACKS) {
  const tr = buildTrack(def), c = new Sim(tr, {}); let tt = 0, hit = 0, near = 1e9;
  while (c.lapsDone.length < 2 && tt < 300) { c.impact = 0; c.step(DT, autopilot(c)); tt += DT; if (c.impact > 1) hit++; }
  // near: the gap left between the barriers of two unrelated sections that face each other
  for (let i = 0; i < tr.N; i += 2) for (let j = i + 100; j < tr.N; j += 2) if (tr.N - j + i >= 100) {
    const dx = tr.px[j] - tr.px[i], dz = tr.pz[j] - tr.pz[i], d = Math.hypot(dx, dz); if (d > 120) continue;
    near = Math.min(near, d - (dz * tr.tx[i] - dx * tr.tz[i] > 0 ? tr.wallP[i] : tr.wallM[i]) - (dx * tr.tz[j] - dz * tr.tx[j] > 0 ? tr.wallP[j] : tr.wallM[j]));
  }
  console.log(def.id, (tr.L / 1000).toFixed(3), 'km', tr.turns, 'turns', c.lapsDone.map(l => fmtTime(l.time)).join(' '), ' barrier gap', near > 1e8 ? 'none close' : near.toFixed(0) + ' m');
  assert(c.lapsDone.length === 2 && hit === 0 && c.lapsDone.every(l => l.valid), def.id + ': two clean valid laps');
  assert(near > 8, def.id + ': barriers of unrelated sections stay 8 m apart');
  let straight = true; for (let i = 30; i < 125; i++) if (tr.corner[i]) straight = false;
  assert(straight && Math.abs(tr.pz[100]) < 5, def.id + ': s = 60 to 250 m is straight along z = 0 (the pit building and first grandstands stand there)');
  assert(tr.drs.length >= 1 && tr.drs.every(([a, b]) => ((b - a + tr.L) % tr.L) > 150 && ((b - a + tr.L) % tr.L) < 1300), def.id + ': DRS zones are real straights');
}
console.log('OK');
