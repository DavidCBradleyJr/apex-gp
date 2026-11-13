// Run: node test/ffb-road-test.js. Physics-only; no physical wheel is used.
const assert=require('assert');
global.THREE=require('../vendor/three.min.js');
const {Sim,buildTrack,surfaceRipple}=require('../src/game.js');
const {feedbackForce,RigControls}=require('../src/rig.js');
const DT=1/240;
function sample(kind,speed=40,smoothing){
  const track=buildTrack();
  if(kind==='kerb')track.corner.fill(1);
  if(kind==='gravel'||kind==='sand')track.gravP.fill(kind==='sand'?2:1);
  const sim=new Sim(track),values=[];
  if(smoothing!==undefined)sim.roadSmoothing=smoothing;
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
assert.deepEqual(sample('asphalt',40,1000/(2*Math.PI*12)).values,runs.asphalt.values,'default smoothing preserves the previous 12 Hz filter');
assert(sample('kerb',40,0).rms>sample('kerb',40,50).rms*2,'smoothing changes the road signal rather than only the UI');
assert.equal(sample('kerb',0,0).rms,0,'unfiltered road feedback is still stationary at rest');
assert(feedbackForce({aligningTorque:406,roadFeedback:0,speed:40},0,2)>feedbackForce({aligningTorque:406,roadFeedback:0,speed:40},0,1),'steering gain raises steering load');
const s={surf:['asphalt','asphalt','kerb','kerb'],x:10,z:20,psi:0,s:100};
const front=surfaceRipple(s,0);s.surf[2]=s.surf[3]='gravel';assert.equal(surfaceRipple(s,0),front,'rear surface cannot become a front-wheel texture');
assert.equal(feedbackForce({aligningTorque:0,roadFeedback:1,speed:0}),0);
assert.equal(feedbackForce({aligningTorque:0,roadFeedback:1,speed:40},0),0,'road slider can remove added texture');
assert(feedbackForce({aligningTorque:406,roadFeedback:0,speed:40})>0.5,'steering load should be more perceptible than the previous 0.406 signal');
assert(feedbackForce({aligningTorque:744,roadFeedback:0,speed:40})<1,'normal corners retain unclipped headroom');
{ // engine vibration: off by default, buzzes at idle, harder at high revs on throttle, and stays a light effect
  const shake=(thr,rpm)=>{const sim=new Sim(buildTrack());let peak=0,signs=0,last=0;sim.rpm=rpm;sim.engPhase=0;
    for(let i=0;i<240;i++){sim.step(DT,{analog:true,steer:0,throttle:thr,brake:0});const e=sim.engineFeedback;peak=Math.max(peak,Math.abs(e));if(Math.sign(e)!==Math.sign(last))signs++;last=e;}
    return {peak,signs};};
  const idle=shake(0,4000),rev=shake(1,12000);
  assert(idle.peak>0.1&&idle.signs>4,'the engine shakes at idle');
  assert(rev.peak>idle.peak*1.5,'more revs and throttle shake harder');
  assert.equal(feedbackForce({aligningTorque:0,roadFeedback:0,speed:0,engineFeedback:1}),0,'engine vibration is opt-in per call');
  const f=feedbackForce({aligningTorque:0,roadFeedback:0,speed:0,engineFeedback:1},0,1,1);assert(f>0&&f<=0.25,'full engine vibration stays a light buzz');
}
assert.equal(feedbackForce({aligningTorque:Infinity,roadFeedback:NaN,speed:40}),0,'bad telemetry cannot become force');
for(const kind of kinds)for(const road of [0,0.6,1])for(const direction of [-1,1]){
  const force=feedbackForce({...runs[kind].sim,aligningTorque:direction*100000},road);
  assert(force>=-1&&force<=1,'combined force is bounded');
}
const controls=new RigControls();assert(!controls.ffb);assert(controls.strength>0.25&&controls.strength<=1);
Object.defineProperty(global,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({feedback:{strength:4,roadFeel:-1,invert:true}})}});
const restored=new RigControls();assert.equal(restored.strength,1);assert.equal(restored.roadFeel,0);assert(restored.invert);assert(!restored.ffb,'saved tuning never arms FFB');
assert.equal(restored.outputLimit,.2);assert.equal(restored.gain,1);assert.equal(restored.damping,0);assert.equal(restored.friction,0);
Object.defineProperty(global,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({feedback:{outputLimit:20,gain:Infinity,damping:-1,friction:10,smoothing:200}})}});
const bounded=new RigControls();assert.equal(bounded.outputLimit,1);assert.equal(bounded.gain,1);assert.equal(bounded.damping,0);assert.equal(bounded.friction,1);assert.equal(bounded.smoothing,50);assert(!bounded.ffb);
delete global.localStorage;
console.log('Road RMS by surface:',Object.fromEntries(kinds.map(k=>[k,+runs[k].rms.toFixed(4)])));
console.log('Surface-coupled FFB, repeatability, stationary/low-speed behavior, steering headroom, caps and tuning restore: PASS');
