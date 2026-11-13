// Input overlay helpers: ring buffer order, wheel angle clamp, and a draw pass against a no-op 2D context.
// Run: node test/overlay-test.js
const assert = require('assert');
const { createTrace, wheelDeg, drawInputs } = require('../src/overlay.js');

const tr = createTrace(5);
for (let i = 1; i <= 3; i++) tr.push(i / 10, 0, false);
assert.deepStrictEqual(tr.read().map(p => p.thr), [0.1, 0.2, 0.3].map(Math.fround));
for (let i = 4; i <= 12; i++) tr.push(i / 10, 0, i === 12);
const r = tr.read();
assert.strictEqual(r.length, 5);
assert.deepStrictEqual(r.map(p => p.thr), [0.8, 0.9, 1, 1.1, 1.2].map(Math.fround)); // oldest to newest after wrapping
assert.strictEqual(r[4].abs, true); assert.strictEqual(r[3].abs, false);

assert.strictEqual(wheelDeg(1), 180); assert.strictEqual(wheelDeg(-1), -180);
assert.strictEqual(wheelDeg(5), 180); assert.strictEqual(wheelDeg(-9), -180); assert.strictEqual(wheelDeg(0.5), 90);

const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => (o[k] = v, true) });
const big = createTrace(300); for (let i = 0; i < 400; i++) big.push(Math.random(), Math.random(), i % 7 === 0);
drawInputs(ctx, 360, 120, big, { thr: 0.5, brk: 0.2, steer: -0.4, absActive: true, speed: 80, gear: 4 }, 'kmh');
drawInputs(ctx, 360, 120, createTrace(300), { thr: 0, brk: 0, steer: 0, speed: 0, gear: -1 }, 'mph');
console.log('OK');
