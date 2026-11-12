// Run: node test/rig-test.js
const assert = require('assert');
const { normalize, valid, mappedInput, RigControls } = require('../src/rig.js');
const steer = { device: 'moza', axis: 0, left: 1, center: 0.05, right: -1 };
const throttle = { device: 'pedals', axis: 0, rest: 1, full: -1 };
const brake = { device: 'pedals', axis: 1, rest: -1, full: 0.6 };
const profile = { steer, throttle, brake };
const devices = [{ key: 'moza', axes: [0.05], buttons: [0], id: 1, ffb: true }, { key: 'pedals', axes: [1, -1], buttons: [] }];
assert.equal(normalize(steer, 1, true), -1);
assert.equal(normalize(steer, -1, true), 1);
assert.equal(normalize(steer, 0.05, true), 0);
assert.equal(normalize(throttle, 1), 0);
assert.equal(normalize(throttle, -1), 1);
assert.equal(normalize(brake, 0.6), 1);
assert.equal(normalize(brake, 0), 0.625);
assert(!valid({ ...steer, center: 1 }, true));
assert(!valid({ ...throttle, full: 1 }));
assert(!valid({ ...brake, full: NaN }));
assert(!valid({ ...steer, axis: -1 }, true));
assert.equal(mappedInput(profile, devices).throttle, 0);
assert.equal(mappedInput(profile, [devices[0]]), null, 'unplugged pedal must invalidate whole rig');
assert.equal(mappedInput({ ...profile, steer: {} }, devices), null);
const controls = new RigControls();
controls.bridge = true; controls.devices = devices; controls.profile = { ...profile, up: { device: 'moza', button: 0 } };
controls.updated = performance.now();
const edges = [];
controls.read(edges); devices[0].buttons[0] = 1; controls.read(edges); controls.read(edges);
assert.deepEqual(edges, ['up'], 'held paddle should shift only once');
controls.ffb = true; controls.feedback({ aligningTorque: 1000 }, true);
assert.equal(controls.force, 0.25); assert.equal(controls.target, 1);
controls.feedback({ aligningTorque: Infinity }, true); assert.equal(controls.force, 0);
controls.feedback({ aligningTorque: 10000 }, true); assert.equal(controls.force, 0.25);
controls.invert = true; controls.feedback({ aligningTorque: 1000 }, true); assert.equal(controls.force, -0.25);
controls.feedback({ aligningTorque: 1000 }, false); assert.equal(controls.force, 0);
controls.ffb = true; controls.updated = performance.now() - 151; assert.equal(controls.read([]), null); assert(!controls.ffb);
controls.ffb = true; controls.block(); assert(!controls.ffb); assert.equal(controls.force, 0);
// Linear wheel steering must retain full lock at high speed; pad steering remains speed-sensitive.
global.THREE = require('../vendor/three.min.js');
const { Sim, buildTrack, CAR } = require('../src/game.js');
const track = buildTrack();
for (const speed of [0, 30, 80]) {
  const sim = new Sim(track); sim.psi = 0; sim.vx = speed;
  for (let i = 0; i < 20; i++) sim.step(1 / 240, { wheel: true, analog: true, steer: 0.5, throttle: 0, brake: 0 });
  assert.equal(sim.roadAngle, CAR.maxLock * 0.5);
  assert(Number.isFinite(sim.aligningTorque));
  if (speed > 0) assert(sim.aligningTorque < 0, 'aligning torque opposes positive steering');
}
console.log('Wheel calibration, paddle edges, transport expiry, FFB gating and linear steering: PASS');
