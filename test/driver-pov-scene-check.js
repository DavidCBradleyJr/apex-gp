// Local harness: ?pose=steer&cam=2&d=0&check=driver
(async()=> {
 const output=document.createElement('pre');output.id='driver-check';output.style.cssText='position:fixed;top:auto;bottom:8px;left:8px;color:white;font:12px monospace;pointer-events:none';document.body.append(output);
 const assert=(ok,msg)=> {if(!ok)throw Error(msg);},frame=()=>new Promise(requestAnimationFrame);
 const previous=game.sim.roadAngle;
 try {
  const deadline=performance.now()+30000;
  while((!game.scene.getObjectByName('driver-hand-left') || !latestTelemetry || !latestTelemetry.ready) && performance.now()<deadline)await frame();
  const left=game.scene.getObjectByName('driver-hand-left'),right=game.scene.getObjectByName('driver-hand-right');
  assert(left && right,'textured hands failed to load');assert(game.scene.getObjectByName('legacy-hands').visible===false,'capsule hands still visible');
  assert(left.parent===right.parent,'hands do not share steering frame');
  let meshes=0,triangles=0;
  for(const hand of [left,right]) hand.traverse(o=> {if(o.isMesh){meshes++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;assert(o.material.map&&o.geometry.attributes.uv&&o.material.bumpMap,'glove surface detail missing');}});
  assert(meshes===2 && triangles===63924,'unexpected hand geometry');
  const local=[left.position.clone(),right.position.clone()],samples=[];
  for(const angle of [0,.08,-.08,.16,-.16,.24,-.24,.32,-.32,.5,-.5,0]) {
   game.sim.roadAngle=angle;await frame();await frame();game.scene.updateMatrixWorld(true);
   const expected=Math.max(-1,Math.min(1,angle/ApexGP.CAR.maxLock))*Math.PI;
   assert(Math.abs(left.parent.rotation.x-expected)<1e-6,`steering did not reach hands: ${left.parent.rotation.x}, expected ${expected}`);
   for(const [i,hand]of [left,right].entries())assert(hand.position.distanceTo(local[i])<1e-9,'hand slipped on wheel');
   for(const hand of [left,right]) {
    const bounds=new THREE.Box3().setFromObject(hand);
    assert([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite),'invalid transformed hand');
   }
   for(const side of ['left','right']) {
    const sleeve=game.scene.getObjectByName('driver-sleeve-'+side),target=game.scene.getObjectByName('driver-cuff-target-'+side),tip=game.scene.getObjectByName('driver-wrist-'+side);
    const p=sleeve.geometry.attributes.position,n=sleeve.geometry.attributes.normal;
    assert([...p.array,...n.array].every(Number.isFinite),'invalid curved sleeve');
    const center=row=> {const v=new THREE.Vector3();for(let k=0;k<24;k++)v.add(new THREE.Vector3().fromBufferAttribute(p,row*25+k));return sleeve.localToWorld(v.multiplyScalar(1/24));};
    const end=center(24),previous=center(23),cuff=target.getWorldPosition(new THREE.Vector3()),wrist=tip.getWorldPosition(new THREE.Vector3());
    assert(end.distanceTo(cuff)<1e-5,'sleeve detached from cuff');
    assert(end.clone().sub(previous).normalize().dot(wrist.sub(cuff).normalize())>.95,'sleeve does not follow wrist direction');
   }
   samples.push({roadAngle:angle,wheelAngle:left.parent.rotation.x});
  }
  output.textContent=JSON.stringify({status:'PASS',hands:2,triangles,quality:game.state.quality,samples,
   limitations:'rigid gripping pose; sampled steering, not continuous anatomy or finger animation'});
 }catch(error){output.textContent='FAIL: '+error.message;console.error(error);}
 finally{game.sim.roadAngle=previous;await frame();await frame();}
})();
