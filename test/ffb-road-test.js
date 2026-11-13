// Run: node test/ffb-road-test.js. Physics-only; no physical wheel is used.
const assert=require('assert');
global.THREE=require('../vendor/three.min.js');
const {Sim,buildTrack,surfaceRipple}=require('../src/game.js');
const {feedbackForce,RigControls}=require('../src/rig.js');
const DT=1/240;
function sample(kind,speed=40){
  const track=buildTrack();
  if(kind==='kerb')track.corner.fill(1);
  if(kind==='gravel'||kind==='sand')track.gravP.fill(kind==='sand'?2:1);
  const sim=new Sim(track),values=[];
  const offset=kind==='asphalt'?0:kind==='kerb'?6.6:12;
  for(let i=0;i<1200;i++){
    sim.x=-300+speed*i*DT;sim.z=offset;sim.psi=0;sim.vx=speed;sim.vz=0;sim.r=0;
    sim.step(DT,{analog:true,steer:0,throttle:0.2,brake:0});
    assert(Number.isFinite(sim.roadFeedback));
    if(i>240)values.push(sim.roadFeedback);
  }
  const rms=Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length);
  return {sim,values,rms};
}
const kinds=['asphalt','kerb','grass','gravel','sand'],runs=Object.fromEntries(kinds.map(k=>[k,sample(k)]));
assert(runs.asphalt.rms>0,'asphalt has a subtle texture');
for(const kind of kinds.slice(1))assert(runs[kind].rms>runs.asphalt.rms*2,kind+' should be clearly rougher than asphalt');
assert(runs.gravel.rms>runs.sand.rms,'gravel should be rougher than sand');
assert.equal(sample('kerb',0).rms,0,'no road vibration at standstill');
assert(sample('grass',1).rms<runs.grass.rms,'roughness fades at walking speed');
assert.deepEqual(sample('asphalt').values,runs.asphalt.values,'surface texture repeats at the same world positions');
const s={surf:['asphalt','asphalt','kerb','kerb'],x:10,z:20,psi:0,s:100};
const front=surfaceRipple(s,0);s.surf[2]=s.surf[3]='gravel';assert.equal(surfaceRipple(s,0),front,'rear surface cannot become a front-wheel texture');
assert.equal(feedbackForce({aligningTorque:0,roadFeedback:1,speed:0}),0);
assert.equal(feedbackForce({aligningTorque:0,roadFeedback:1,speed:40},0),0,'road slider can remove added texture');
assert(feedbackForce({aligningTorque:406,roadFeedback:0,speed:40})>0.5,'steering load should be more perceptible than the previous 0.406 signal');
assert(feedbackForce({aligningTorque:744,roadFeedback:0,speed:40})<1,'normal corners retain unclipped headroom');
assert.equal(feedbackForce({aligningTorque:Infinity,roadFeedback:NaN,speed:40}),0,'bad telemetry cannot become force');
for(const kind of kinds)for(const road of [0,0.6,1])for(const direction of [-1,1]){
  const force=feedbackForce({...runs[kind].sim,aligningTorque:direction*100000},road);
  assert(force>=-1&&force<=1,'combined force is bounded');
}
const controls=new RigControls();assert(!controls.ffb);assert(controls.strength>0.25&&controls.strength<=1);
Object.defineProperty(global,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({feedback:{strength:4,roadFeel:-1,invert:true}})}});
const restored=new RigControls();assert.equal(restored.strength,1);assert.equal(restored.roadFeel,0);assert(restored.invert);assert(!restored.ffb,'saved tuning never arms FFB');
delete global.localStorage;
console.log('Road RMS by surface:',Object.fromEntries(kinds.map(k=>[k,+runs[k].rms.toFixed(4)])));
console.log('Surface-coupled FFB, repeatability, stationary/low-speed behavior, steering headroom, caps and tuning restore: PASS');
