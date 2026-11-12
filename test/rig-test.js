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

// Guided assignment keeps its draft separate and records endpoints rather than guessing polarity.
const { RigWizard } = require('../src/rig.js');
const rig = [{key:'wheel',name:'MOZA R3',axes:[0.03],buttons:[0,0]}, {key:'pedals',name:'Pedals',axes:[1,-1],buttons:[]}];
const w = new RigWizard();
const confirm = () => assert(w.confirm(rig), 'step ' + w.index + ' should be confirmable');
confirm(); // centered baseline
rig[0].axes[0] = 0.05; w.observe(rig); assert(!w.ready(rig), 'ignore center jitter');
rig[0].axes[0] = 1; w.observe(rig); assert(w.ready(rig));
rig[0].axes[0] = 0.03; w.observe(rig); assert(w.ready(rig), 'remember the endpoint after release');
confirm();
rig[0].axes[0] = 1; w.observe(rig); assert(!w.ready(rig), 'right lock must be on the other side of center');
rig[0].axes[0] = -1; confirm();
assert(!w.ready(rig), 'must return to center');
rig[0].axes[0] = 0.03; confirm();
assert.equal(normalize(w.preview().steer, 1, true), -1, 'inverted steering still previews left correctly');
confirm(); // steering test
confirm(); // throttle rest
rig[1].axes[0] = -1; confirm();
rig[1].axes[0] = 0; assert.equal(normalize(w.draft.throttle, 0), 0.5);
rig[1].axes[0] = 1; confirm(); // throttle test
confirm(); // brake rest
rig[1].axes[1] = 0.6; confirm();
assert.equal(normalize(w.draft.brake, 0.6), 1);
rig[1].axes[1] = -1; rig[0].buttons[0] = 1;
confirm(); // brake test; don't bind a button already held on entry
w.observe(rig); assert(!w.ready(rig));
rig[0].buttons[0] = 0; w.observe(rig); rig[0].buttons[0] = 1; w.observe(rig);
rig[0].buttons[0] = 0; w.observe(rig); assert(w.ready(rig), 'remember the paddle after release'); confirm();
rig[0].buttons[0] = 1; w.observe(rig); assert(!w.ready(rig), 'do not reuse shift-up for shift-down');
rig[0].buttons[0] = 0; w.observe(rig); rig[0].buttons[1] = 1; confirm();
for (let i = 0; i < 3; i++) w.skip(rig);
assert.equal(w.step[1], 'review'); assert(mappedInput(w.draft, rig));
assert(!w.ready([rig[0]]), 'cannot save disconnected pedals'); confirm();
assert.equal(w.draft.up.button, 0); assert.equal(w.draft.down.button, 1);

const ambiguous = new RigWizard(); ambiguous.draft.steer = {device:'wheel',axis:0,left:-1,center:0,right:1};
ambiguous.go(6, rig); rig[1].axes = [-1,1]; ambiguous.observe(rig);
assert(!ambiguous.ready(rig)); assert(ambiguous.problem.includes('More than one'));
ambiguous.retry(rig); assert.equal(ambiguous.step[1], 'rest', 'retry must recapture released pedals');
const combined = new RigWizard(); combined.draft = {steer:{device:'wheel',axis:0,left:-1,center:0,right:1},throttle:{device:'pedals',axis:0,rest:0,full:1}};
rig[1].axes = [0,0]; combined.go(9, rig); rig[1].axes[0] = 1; combined.observe(rig); assert(!combined.ready(rig), 'reject pressing the throttle for brake');
rig[1].axes[0] = 0; combined.go(9,rig); rig[1].axes[0] = -1; combined.observe(rig); assert(combined.ready(rig), 'allow opposite halves of a combined pedal axis');
combined.draft.brake = {...combined.candidate}; combined.go(16,rig); combined.retry(rig); assert.deepEqual(combined.draft, {}, 'restart review from a clean draft');
controls.wizard = new RigWizard(); controls.ffb = true; controls.suspended = false; controls.feedback({aligningTorque:1000},true);
assert.equal(controls.force,0); assert.equal(controls.read([]),null,'wizard suppresses driving input');
console.log('Guided setup: endpoint detection, confirmation, ambiguity, combined pedals, button release, duplicate rejection and safety: PASS');
