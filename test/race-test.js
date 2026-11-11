// Race check: six autopiloted cars race 2 laps; plus slipstream and contact checks. Run: node test/race-test.js
const path = require('path');
global.THREE = require(path.join(__dirname, '../vendor/three.min.js'));
const { buildTrack, Sim, Race, collide, autopilot, fmtTime, TRACKS } = require('../src/game.js');
const assert = require('assert');
const track = buildTrack(), DT = 1 / 240;
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// --- slipstream: 12 s flat out down the main straight, alone and then 12 m behind another car ---
const run = (towed) => {
  const a = new Sim(track, {}), b = new Sim(track, {});
  for (const [c, s] of [[a, 100], [b, 112]]) { c.placeAt(s, 0); c.vx = 70 * Math.cos(c.psi); c.vz = 70 * Math.sin(c.psi); c.gear = 7; c.lap = 1; }
  const race = { cars: [{ sim: a }, { sim: b }] };
  for (let t = 0; t < 6; t += DT) {
    a.tow = 0;
    if (towed) { const dx = b.x - a.x, dz = b.z - a.z, along = dx * Math.cos(a.psi) + dz * Math.sin(a.psi); a.tow = along > 3 && along < 60 ? 1 - along / 60 : 0; }
    a.step(DT, { analog: true, steer: 0, throttle: 1, brake: 0 }); b.step(DT, { analog: true, steer: 0, throttle: 1, brake: 0 });
  }
  return a.speed * 3.6;
};
const solo = run(false), towed = run(true);
console.log('slipstream: solo', solo.toFixed(1), 'km/h, in tow', towed.toFixed(1), 'km/h');
assert(towed > solo + 3 && towed < solo + 30, 'a tow is worth a few km/h, not a rocket');

// --- contact: a faster car running into the back of a slower one slows down, speeds the other up, and they separate ---
{
  const a = new Sim(track, {}), b = new Sim(track, {});
  a.placeAt(200, 0); b.placeAt(204, 0);
  a.vx = 50 * Math.cos(a.psi); a.vz = 50 * Math.sin(a.psi); b.vx = 40 * Math.cos(b.psi); b.vz = 40 * Math.sin(b.psi);
  const p0 = a.vx + b.vx; collide(a, b);
  assert(Math.hypot(a.vx, a.vz) < 50 && Math.hypot(b.vx, b.vz) > 40, 'momentum moves from the hitting car to the hit car');
  assert(Math.abs(a.vx + b.vx - p0) < 1e-6, 'momentum is conserved');
  assert(Math.hypot(b.x - a.x, b.z - a.z) > 5.19, 'cars are pushed apart');
  assert(a.impact > 5, 'impact is reported');
}

// --- full races at each skill: all six cars driven by the race AI (the player's car too, as the quickest, from the back) ---
for (const skill of ['rookie', 'pro', 'elite']) {
  const player = new Sim(track, {});
  const race = new Race(track, player, { laps: 2, skill, rnd });
  Object.assign(race.player, { pace: race.cars[0].pace * 1.03, power: 1 });
  let t = 0, contacts = 0, passes = 0, prev = race.order.map(c => c.code).join();
  while (!race.cars.every(c => c.finished) && t < 400) {
    for (const c of race.cars) c.sim.impact = 0;
    race.step(DT, race.player.finished ? null : race.drive(race.player));
    t += DT;
    for (const c of race.cars) { if (!Number.isFinite(c.sim.x)) throw new Error('NaN in ' + c.code + ' at t=' + t); if (c.sim.impact > 1) contacts++; }
    const now = race.order.map(c => c.code).join(); if (now !== prev) { passes++; prev = now; }
  }
  console.log(skill + ':', race.order.map(c => c.pos + ' ' + c.code + ' ' + (c.finished ? fmtTime(c.finishT) : 'DNF')).join(' | '));
  console.log('  best laps', race.order.map(c => fmtTime(Math.min(...c.sim.lapsDone.map(l => l.time)))).join(' '), ' order changes', passes, ' contacts', contacts, ' recoveries', race.cars.reduce((n, c) => n + (c.recovered || 0), 0));
  assert(race.cars.every(c => c.finished), 'every car finishes');
  assert(race.over, 'race ends when the player finishes');
  const ft = race.order.map(c => c.finishT);
  assert(ft.every((v, i) => i === 0 || v >= ft[i - 1]), 'classification matches finishing times');
  assert(race.order.every((c, i) => c.pos === i + 1), 'positions are 1..n');
  assert(passes > 0 && race.player.pos <= 4, 'the quickest car makes up places from the back, got P' + race.player.pos);
  assert(contacts <= 60, 'AI cars may rub (a quarter of a second of contact in total) but do not lean on each other');
  assert(race.cars.every(c => !c.recovered), 'nobody had to be recovered');
}
// --- the other circuits: one pro race each. The AI was tuned on Kestrel, so the bar here is only that the race works. ---
for (const def of TRACKS.slice(1)) {
  const tr = buildTrack(def), race = new Race(tr, new Sim(tr, {}), { laps: 2, skill: 'pro', rnd });
  let t = 0;
  while (!race.cars.every(c => c.finished) && t < 500) { race.step(DT, race.player.finished ? null : race.drive(race.player)); t += DT; }
  const rec = race.cars.reduce((n, c) => n + (c.recovered || 0), 0);
  console.log(def.id + ':', race.order.map(c => c.pos + ' ' + c.code).join(' | '), ' recoveries', rec);
  assert(race.cars.every(c => c.finished) && race.over && rec <= 1, def.id + ': every car finishes a race');
}
console.log('OK');
