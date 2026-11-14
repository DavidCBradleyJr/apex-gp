// Validate the optional cockpit package without changing the eleven exterior imports.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name));
const ledger=JSON.parse(read('assets/f1-2026/production.json')),team=ledger.teams.find(t=>t.id==='ferrari');
const context={window:{},URL,document:{currentScript:{src:'http://127.0.0.1/vendor/f1-cars.js'}}};
vm.runInNewContext(read('vendor/f1-cars.js').toString(),context);
const cars=context.window.APEX_TEAM_CARS,pov=cars.ferrari.pov;
assert.strictEqual(Object.values(cars).filter(c=>c.pov).length,1);
assert.deepStrictEqual(Array.from(pov.eye),[.04,.94,0]);assert.deepStrictEqual(Array.from(pov.wheelHub),[.55,.66,0]);
assert.strictEqual(pov.rakeZ,-.28);assert.strictEqual(pov.fov,60);
for(const kind of ['car','driver']){
 const entry=pov[kind],source=team.pov_runtime_trial[kind],data=read('vendor/f1-models/'+entry.file);
 assert(data.equals(read('assets/f1-2026/'+source.file)));
 assert.strictEqual(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);
 assert.strictEqual(entry.url,'http://127.0.0.1/vendor/f1-models/'+entry.file);
 const doc=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
 assert.strictEqual(doc.meshes.length,kind==='car'?7:5);
 if(kind==='driver'){
  assert.strictEqual(doc.skins.length,4);assert.strictEqual(doc.skins.reduce((n,s)=>n+s.joints.length,0),238);
  assert.strictEqual(doc.animations.length,1);
 }
 for(const destination of ['docs','design/project'])assert(data.equals(read(destination+'/vendor/f1-models/'+entry.file)));
}
assert.strictEqual(pov.surfaces.mirrors.length,2);
for(const surface of [pov.surfaces.lcd,...pov.surfaces.mirrors]){
 assert(surface.positions.length/3===surface.uvs.length/2 && surface.positions.every(Number.isFinite));
 assert(surface.indices.every(i=>Number.isInteger(i)&&i>=0&&i<surface.positions.length/3));
 for(let i=0;i<surface.indices.length;i+=3){
  const [a,b,c]=surface.indices.slice(i,i+3).map(j=>surface.positions.slice(j*3,j*3+3));
  assert((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1])<0,'front-facing overlay winding');
 }
}
assert(Math.max(...pov.surfaces.mirrors[0].uvs.filter((_,i)=>i%2===0))<=1);
assert(Math.max(...pov.surfaces.mirrors[1].uvs.filter((_,i)=>i%2===0))<=.5);
console.log('Ferrari POV package PASS: original exteriors retained; exact qualified assets, four skins, static hub profile and three live surfaces copied to both frontends.');
