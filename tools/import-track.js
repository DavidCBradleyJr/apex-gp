// Turn a real circuit centreline into TRACKS control points for src/game.js.
// Input: a CSV from the TUM racetrack database (github.com/TUMFTM/racetrack-database, LGPL-3.0, centre lines from
// OpenStreetMap): x_m,y_m,... every ~5 m, in driving order. Usage: node tools/import-track.js Monza.csv [startShiftMetres]
// Output: the layout mirrored into the engine's axes (z = -north), turned and moved so the start line is at [-500,0] heading +x
// like every other circuit, smoothed, and thinned to the points a Catmull-Rom needs (dense in corners, sparse on straights).
const fs = require('fs');
const raw = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(l => l && l[0] !== '#').map(l => l.split(',').map(Number)).map(([x, y]) => [x, -y]);
const shift = +(process.argv[3] || 0), n = raw.length;
let i0 = 0;
if (shift) { let acc = 0; const dir = Math.sign(shift); while (acc < Math.abs(shift)) { const j = (i0 + dir + n) % n; acc += Math.hypot(raw[j][0] - raw[i0][0], raw[j][1] - raw[i0][1]); i0 = j; } }
const p = raw.map((_, i) => raw[(i + i0) % n].slice()), p0 = p.map(v => v.slice());
// map-traced centre lines wobble by a few decimetres, which the physics reads as corners: SMOOTH passes of a 1-2-1 filter
// (8 passes at 5 m spacing blur over about 10 m and move the tightest apexes by up to 3.5 m, inside the road; more passes
// lap a little faster but start to reshape the chicanes)
for (let it = +(process.env.SMOOTH || 8); it > 0; it--) { const o = p.map(v => v.slice()); for (let i = 0; i < n; i++) for (const k of [0, 1]) p[i][k] = (o[(i + n - 1) % n][k] + 2 * o[i][k] + o[(i + 1) % n][k]) / 4; }
const a = Math.atan2(p[4][1] - p[n - 4][1], p[4][0] - p[n - 4][0]), c = Math.cos(-a), s = Math.sin(-a), [ox, oz] = p[0];
const q = p.map(([x, z]) => [(x - ox) * c - (z - oz) * s - 500, (x - ox) * s + (z - oz) * c]);
// thin to points spaced by the local radius (SPACE x radius, between 10 and 110 m): they stay on the smoothed curve and their
// spacing changes gradually, so the Catmull-Rom through them does not ripple the way a tolerance-based thinning does
const SPACE = +(process.env.SPACE || 0.3), rad = q.map((_, i) => { const a = q[(i + n - 3) % n], b = q[i], c2 = q[(i + 3) % n], ux = b[0] - a[0], uz = b[1] - a[1], vx = c2[0] - b[0], vz = c2[1] - b[1]; return Math.hypot(ux, uz) / Math.max(Math.abs(Math.asin(Math.max(-1, Math.min(1, (ux * vz - uz * vx) / (Math.hypot(ux, uz) * Math.hypot(vx, vz)))))), 1e-4); });
const keep = new Uint8Array(n); keep[0] = 1;
for (let i = 1, run = 0, last = 0; i < n; i++) {
  run += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
  let r = 1e9; for (let j = last; j <= Math.min(n - 1, i + 6); j++) r = Math.min(r, rad[j]);
  if (run >= Math.max(10, Math.min(110, SPACE * r))) { keep[i] = 1; run = 0; last = i; }
}
const pts = q.filter((_, i) => keep[i]).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
let area = 0; for (let i = 0; i < n; i++) { const b = q[(i + 1) % n]; area += q[i][0] * b[1] - b[0] * q[i][1]; }
console.error(pts.length, 'points; smoothing moved the line by up to', Math.max(...p.map((v, i) => Math.hypot(v[0] - p0[i][0], v[1] - p0[i][1]))).toFixed(1), 'm;', area > 0 ? 'clockwise' : 'ANTICLOCKWISE (the engine assumes the pits on the right)');
console.log(JSON.stringify(pts));
