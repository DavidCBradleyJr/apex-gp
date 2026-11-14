// Validate all packaged imports and the source/build/Design paths without a renderer.
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto'), vm = require('vm');
const root = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p));
const ledger = JSON.parse(read('assets/f1-2026/production.json'));
const context = { window: {}, URL, document: { currentScript: { src: 'http://127.0.0.1/vendor/f1-cars.js' } } };
vm.runInNewContext(read('vendor/f1-cars.js').toString(), context);
const catalog = context.window.APEX_TEAM_CARS;
assert.strictEqual(Object.keys(catalog).length, 11);
for (const team of ledger.teams) {
  const entry = catalog[team.id], source = team.runtime_prototype, data = read('vendor/f1-models/' + team.id + '.glb');
  assert.strictEqual(crypto.createHash('sha256').update(data).digest('hex'), source.sha256, team.id + ' qualified source');
  assert(data.equals(read('assets/f1-2026/' + source.file)), team.id + ' packed bytes');
  assert.strictEqual(entry.url, 'http://127.0.0.1/vendor/f1-models/' + team.id + '.glb');
  const doc = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
  const wheels = doc.nodes.filter(n => n.extras && n.extras.wheel !== undefined).sort((a, b) => a.extras.wheel - b.extras.wheel);
  assert.deepStrictEqual(wheels.map(n => n.extras.wheel), [0, 1, 2, 3]);
  assert(doc.nodes.some(n => n.name === entry.root) && doc.meshes.length === 5);
  let triangles = 0;
  for (const mesh of doc.meshes) for (const p of mesh.primitives) {
    triangles += doc.accessors[p.indices].count / 3;
    assert(p.attributes.NORMAL !== undefined && p.attributes.TEXCOORD_0 !== undefined, team.id + ' normals/UVs');
  }
  assert.strictEqual(triangles, entry.triangles);
  wheels.forEach((node, i) => {
    assert(node.translation.every((v, axis) => Math.abs(v - entry.wheels[i].position[axis]) < 1e-5));
    assert(entry.wheels[i].radius > .3 && entry.wheels[i].radius < .4);
  });
  for (const destination of ['docs', 'design/project']) assert(data.equals(read(destination + '/vendor/f1-models/' + team.id + '.glb')), destination + ' ' + team.id);
}
for (const destination of ['docs', 'design/project']) {
  assert(read(destination + '/vendor/f1-cars.js').equals(read('vendor/f1-cars.js')), destination + ' catalog');
  assert(read(destination + '/game.js').equals(read('src/game.js')), destination + ' engine');
}
for (const page of ['src/index.html', 'src/play.html', 'docs/index.html', 'design/project/Main.dc.html']) {
  const html = read(page).toString(), catalog = html.indexOf('vendor/f1-cars.js'), engine = html.search(/src="(?:\.\/)?game\.js/);
  assert(catalog > 0 && engine > catalog, page + ' catalog before engine');
}
console.log('Team model package PASS: 11 preserved GLBs, four pivoted wheels each, all source/build/Design paths.');
