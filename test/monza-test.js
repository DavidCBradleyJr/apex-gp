// Monza corridor, source/export integrity and build propagation. node test/monza-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.THREE = require('../vendor/three.min.js');
const { buildTrack, TRACKS, surfaceAt } = require('../src/game.js');
const tr = buildTrack(TRACKS.find(t => t.id === 'monza'));
assert(tr.L > 5700 && tr.L < 5850, 'Monza length');
for (let i = 0; i < tr.N; i++) {
  assert(Number.isFinite(tr.wallP[i]) && Number.isFinite(tr.wallM[i]), 'finite corridor');
  assert(Math.min(tr.wallP[i], tr.wallM[i]) > tr.halfW + 2, 'clear driving width');
  assert(tr.gravP[i] !== 2 && tr.gravM[i] !== 2, 'no sand at Monza');
  assert(surfaceAt(tr,i,0) === 'asphalt', 'continuous road');
}
assert(tr.wallP[0] < 10 && tr.wallM[0] < 12, 'pit-straight corridor');
for (const s of [2510,2850,5200]) assert(tr.gravM[Math.round(s/tr.ds)] === 1, 'outside gravel at Lesmo/Parabolica');
const glb = fs.readFileSync(path.join(__dirname, '../assets/tracks/monza/hornbeam-runtime.glb'));
assert(glb.toString('ascii', 0, 4) === 'glTF', 'GLB header');
const doc = JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
const prim = doc.meshes[0].primitives[0];
assert(doc.accessors[prim.indices].count / 3 <= 6500, 'runtime tree face budget');
assert(prim.attributes.COLOR_0 !== undefined, 'local foliage colours survived export');
const p = doc.accessors[prim.attributes.POSITION];
assert(p.max[1]-p.min[1] > 15 && p.max[1]-p.min[1] < 17, 'upright metre scale in glTF');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../vendor/monza-tree.js'),'utf8'),context);
assert(Buffer.from(context.window.MONZA_TREE_GLB,'base64').equals(glb), 'embedded asset matches qualified GLB');
for (const target of ['docs/game.js','design/project/game.js']) assert(fs.readFileSync(path.join(__dirname,'../'+target)).equals(fs.readFileSync(path.join(__dirname,'../src/game.js'))), 'engine copy: '+target);
for (const target of ['docs/vendor/monza-tree.js','design/project/vendor/monza-tree.js']) assert(fs.readFileSync(path.join(__dirname,'../'+target)).equals(fs.readFileSync(path.join(__dirname,'../vendor/monza-tree.js'))), 'asset copy: '+target);
console.log('Monza corridor, coloured 6k tree, embedded GLB and built copies: OK');
