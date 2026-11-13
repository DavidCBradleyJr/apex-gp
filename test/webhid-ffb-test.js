// Run: node test/webhid-ffb-test.js. All HID calls below are fake; no physical wheel is used.
const assert=require('assert');
const {MozaHidFfb,supported,conditionsSupported,setEffect,constantForce,conditionForce,forceLevels,loadedBlock,DURATION,MAX_FORCE}=require('../src/webhid-ffb.js');
const fixture=require('./fixtures/moza-r3-hid.json');
const clone=x=>JSON.parse(JSON.stringify(x));
class FakeDevice {
  constructor(){Object.assign(this,clone(fixture));this.opened=false;this.calls=[];this.fail=false;this.hold=null;this.nextBlock=2;}
  async open(){this.opened=true;}
  async close(){this.opened=false;}
  async sendReport(id,data){this.calls.push({kind:'out',id,data:Array.from(data)});if(this.hold){const hold=this.hold;this.hold=null;await hold;} if(this.fail)throw Error('USB write failed');}
  async sendFeatureReport(id,data){this.calls.push({kind:'feature',id,data:Array.from(data)});this.allocating=data[0];}
  async receiveFeatureReport(id){this.calls.push({kind:'read',id});return new DataView(Uint8Array.from(id===18?(this.denyType===this.allocating?[18,0,2,0,0]:[18,this.nextBlock++,1,0,0]):[19,0,64,10,1]).buffer);}
}
(async()=>{
  assert(supported(fixture));
  assert(conditionsSupported(fixture));
  const changedCondition=clone(fixture);changedCondition.collections[0].outputReports.find(r=>r.reportId===3).items[2].reportSize=8;
  assert(supported(changedCondition)&&!conditionsSupported(changedCondition),'unknown condition layout retains constant force only');
  const windows=clone(fixture);
  for(const kind of ['outputReports','featureReports'])for(const r of windows.collections[0][kind])for(const i of r.items)if(i.isArray)i.usages.reverse();
  assert(supported(windows),'Windows array usage order must not change report selectors');
  assert(conditionsSupported(windows));
  const incompatible=clone(fixture);incompatible.collections[0].outputReports.find(r=>r.reportId===5).items[1].reportSize=8;
  assert(!supported(incompatible),'reject changed firmware layout before output');
  assert(!supported({...fixture,productId:2}),'do not assume R9 has the R3 layout');
  const effect=setEffect(2);
  assert.equal(new DataView(effect.buffer).getUint16(2,true),DURATION);
  assert.equal(effect[11],0);assert.equal(effect[12],4);assert.equal(effect[10],255);
  assert.equal(new DataView(effect.buffer).getUint16(13,true),9000);
  assert.equal(DURATION,120);
  for(const [force,expected] of [[10,Math.trunc(32767*MAX_FORCE)],[-10,-Math.trunc(32767*MAX_FORCE)],[NaN,0],[Infinity,0],[0,0]])assert.equal(new DataView(constantForce(2,force).buffer).getInt16(1,true),expected);
  assert.equal(new DataView(constantForce(2,1,1).buffer).getInt16(1,true),32767,'explicit full-range limit');
  assert.equal(new DataView(constantForce(2,1,NaN).buffer).getInt16(1,true),0);
  const condition=new DataView(conditionForce(3,0.25).buffer);
  for(const offset of [4,6,8,10])assert.equal(condition.getUint16(offset,true),Math.trunc(.25*32767));
  for(const offset of [2,12])assert.equal(condition.getUint16(offset,true),0);
  for(const type of [9,11]){const e=setEffect(3,type);assert.equal(e[1],type);assert.equal(e[12],1);assert.equal(new DataView(e.buffer).getUint16(2,true),120);}
  for(const limit of [0,.2,.8,1,10])for(const force of [-10,-.6,0,.6,10])for(const damping of [0,.2,1])for(const friction of [0,.1,1]){
    const levels=forceLevels(force,{outputLimit:limit,damping,friction});
    assert(Math.abs(levels.constant)+levels.damper+levels.friction<=Math.min(1,limit)+1e-12,'effects share one output budget');
  }
  assert.equal(loadedBlock(new DataView(Uint8Array.from([18,3,1,0,0,0,0]).buffer)),3);
  assert.equal(loadedBlock(new DataView(Uint8Array.from([3,1,0,0]).buffer)),3);
  for(const bytes of [[18,0,1,0,0],[18,2,2,0,0],[18,2,3,0,0],[18,2]])assert.throws(()=>loadedBlock(new DataView(Uint8Array.from(bytes).buffer)));
  const device=new FakeDevice();let selected=[device],error='',filters=null;const disconnects=[];
  Object.defineProperty(global,'navigator',{configurable:true,value:{hid:{requestDevice:async options=>{filters=options.filters;return selected;},addEventListener:(type,fn)=>{disconnects.push(fn);}}}});
  global.window={isSecureContext:true};
  const hid=new MozaHidFfb(message=>{error=message;});await hid.connect();
  assert(hid.ready);assert.deepEqual(filters,[{vendorId:0x346e,productId:5}]);
  assert(hid.conditions);assert.deepEqual(hid.effects.map(e=>e.type),[1,9,11]);
  assert(!device.calls.some(c=>c.id===10),'connecting must not start a force effect');
  const pads=[{key:'r3',name:'Gudsen R3 Racing Wheel and Pedals (Vendor: 346e Product: 0005)'}];
  assert(hid.matches(pads[0],pads));assert(!hid.matches({key:'other',name:'Xbox'},pads));
  assert(!hid.matches(pads[0],[...pads,{...pads[0],key:'second-r3'}]),'ambiguous identical wheels cannot receive torque');
  await hid.write(0.25);
  const force=device.calls.filter(c=>c.kind==='out'&&c.id===5).at(-1);
  assert.equal(new DataView(Uint8Array.from(force.data).buffer).getInt16(1,true),Math.round(32767*0.2*0.25));
  assert.deepEqual(device.calls.filter(c=>c.id===10&&c.data[0]===2).at(-1).data,[2,1,1],'one finite play only');
  await hid.write(0,{outputLimit:.8,damping:.2,friction:.1});
  assert(hid.playing,'conditions work at zero steering torque');
  for(const block of [3,4])assert.deepEqual(device.calls.filter(c=>c.id===10&&c.data[0]===block).at(-1).data,[block,1,1]);
  const beforeChange=device.calls.length;
  await hid.write(.6,{outputLimit:.8,damping:.1,friction:0});
  const transition=device.calls.slice(beforeChange),firstStart=transition.findIndex(c=>c.id===10&&c.data[1]===1);
  for(const block of [2,3,4])assert(transition.slice(0,firstStart).some(c=>c.id===10&&c.data[0]===block&&c.data[1]===3),'stop old budget before starting a new one');
  const {RigControls,RigWizard}=require('../src/rig.js');
  const originalWindow=global.window;delete global.window;
  const controls=new RigControls();global.window=originalWindow;
  const browserPad={...pads[0],axes:[0,-1,-1,-1,-1,-1],buttons:[0]};
  controls.browserDevices=()=>[browserPad];controls.hid=hid;
  controls.profile={steer:{device:'r3',axis:0,left:-1,center:0,right:1},throttle:{device:'r3',axis:2,rest:-1,full:1},brake:{device:'r3',axis:5,rest:-1,full:1}};
  controls.strength=0.25;controls.ffb=true;controls.feedback({aligningTorque:-100000},true);await hid.busy;
  assert.equal(controls.force,-0.25);
  assert.equal(new DataView(Uint8Array.from(device.calls.filter(c=>c.id===5).at(-1).data).buffer).getInt16(1,true),-Math.round(32767*0.2*0.25));
  controls.wizard=new RigWizard();controls.feedback({aligningTorque:1000},true);await hid.busy;
  assert.equal(controls.force,0);controls.wizard=null;
  await hid.stop();assert.equal(hid.playing,false);
  for(const block of [2,3,4])assert.deepEqual(device.calls.filter(c=>c.id===10&&c.data[0]===block).at(-1).data,[block,3,0]);
  let release;device.hold=new Promise(resolve=>{release=resolve;});
  const count=device.calls.filter(c=>c.id===10&&c.data[1]===1).length;
  const pending=hid.write(0,{outputLimit:.8,damping:.2,friction:.1});await Promise.resolve();hid.stop();release();await pending;
  assert.equal(device.calls.filter(c=>c.id===10&&c.data[1]===1).length,count,'stop during an in-flight USB write must prevent a stale start');
  assert.equal(hid.desired,0);assert(!hid.playing);
  await hid.write(0.3);device.fail=true;await hid.write(0.2);
  assert(!hid.ready);assert(error.includes('USB write failed'));
  device.fail=false;await hid.disconnect();assert(!device.opened);assert(device.calls.some(c=>c.id===11),'free the allocated block');
  assert.deepEqual(device.calls.filter(c=>c.id===11).map(c=>c.data[0]),[2,3,4],'free all three effects');
  selected=[new FakeDevice()];selected[0].collections=changedCondition.collections;await hid.connect();
  assert(hid.ready&&!hid.conditions);await hid.write(.5,{damping:1});assert(!selected[0].calls.some(c=>c.id===3),'never send guessed condition reports');await hid.disconnect();
  selected=[new FakeDevice()];selected[0].denyType=11;await hid.connect();
  assert(hid.ready&&!hid.conditions&&hid.conditionError.includes('unavailable'),'allocation failure retains constant FFB');
  assert(selected[0].calls.some(c=>c.id===11&&c.data[0]===3),'partial condition allocation is freed');
  assert(!selected[0].calls.some(c=>c.id===10),'optional allocation failure never starts torque');
  await hid.disconnect();
  selected=[new FakeDevice()];await hid.connect();disconnects.forEach(fn=>fn({device:selected[0]}));assert(!hid.ready);assert(error.includes('disconnected'));
  selected=[{...fixture,productId:2}];await assert.rejects(hid.connect(),/No supported/);
  selected=[];await assert.rejects(hid.connect(),/No supported/);
  delete global.window;delete global.navigator;
  console.log('WebHID R3: real descriptor, Windows selector order, finite effects, caps, explicit start, allocation, device matching, in-flight stop, errors and disconnect: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
