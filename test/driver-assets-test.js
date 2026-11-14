// Qualify the exported hand, actual grip clearance, source preservation and shipped copies.
const fs=require('fs'),assert=require('assert'),vm=require('vm'),crypto=require('crypto');
const root=require('path').join(__dirname,'..'),read=p=>fs.readFileSync(root+'/'+p);
const blob=read('assets/driver-pov/derived/driver-left-glove.glb');
assert(blob.toString('ascii',0,4)==='glTF');
const length=blob.readUInt32LE(12),doc=JSON.parse(blob.toString('utf8',20,20+length)),binary=20+length+8;
assert(doc.meshes.length===1 && !doc.skins && !doc.animations,'static grip export');
const primitive=doc.meshes[0].primitives[0],position=doc.accessors[primitive.attributes.POSITION];
assert(doc.accessors[primitive.indices].count/3===31962,'hand triangle budget');
assert(primitive.attributes.NORMAL!==undefined && primitive.attributes.TEXCOORD_0!==undefined,'normals and source atlas UVs');
assert(doc.images.length===1 && doc.materials.length===1,'one preserved atlas/material');
const fixture=JSON.parse(read('assets/driver-pov/source/grip-centreline.json'));
const view=doc.bufferViews[position.bufferView],start=binary+(view.byteOffset||0)+(position.byteOffset||0),stride=view.byteStride||12;
let minimum=Infinity,contacts=0;
for(let i=0;i<position.count;i++) {
 const k=start+i*stride,x=blob.readFloatLE(k)-.015,y=blob.readFloatLE(k+4)-.110,z=blob.readFloatLE(k+8)-.210;
 assert([x,y,z].every(Number.isFinite)); let distance=Infinity;
 for(let j=0;j<fixture.points.length-1;j++) {
  const a=fixture.points[j],b=fixture.points[j+1],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=dx*dx+dy*dy+dz*dz;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy+(z-a[2])*dz)/n));
  distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t,z-a[2]-dz*t));
 }
 minimum=Math.min(minimum,distance);if(distance<.023)contacts++;
}
assert(minimum>=fixture.radius+.0014,'glove vertices penetrate the grip');
assert(contacts>500,'hand floats away from grip');
const report=JSON.parse(read('assets/driver-pov/evidence/hand-export.json'));
assert(crypto.createHash('sha256').update(blob).digest('hex')===report.sha256,'qualified export changed');
assert(crypto.createHash('sha256').update(read('assets/driver-pov/source/glove-atlas-revision.glb')).digest('hex')===report.source_sha256,'preserved source changed');
const context={window:{}};vm.runInNewContext(read('vendor/driver-hands.js').toString(),context);
assert(Buffer.from(context.window.DRIVER_HAND_GLB,'base64').equals(blob),'embedded hand differs');
for(const directory of ['docs','design/project']) {
 assert(read(directory+'/game.js').equals(read('src/game.js')),'engine copy: '+directory);
 assert(read(directory+'/vendor/driver-hands.js').equals(read('vendor/driver-hands.js')),'hand copy: '+directory);
}
for(const page of ['src/index.html','src/play.html','docs/index.html','design/project/Main.dc.html']) {
 const html=read(page).toString(),hands=html.indexOf('vendor/driver-hands.js'),engine=html.search(/src="(?:\.\/)?game\.js/);
 assert(hands>=0 && engine>hands,'hand asset must load before engine: '+page);
}
console.log('Driver asset PASS:',31962,'triangles,',contacts,'contact vertices, minimum grip clearance',((minimum-fixture.radius)*1000).toFixed(2),'mm');
