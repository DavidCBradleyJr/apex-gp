// Native browser harness: src/play.html?team=ferrari&pose=steer&cam=2&d=0&quality=1&check=ferrari-pov
(async()=>{
 const output=document.createElement('pre');output.id='ferrari-pov-check';output.style.cssText='position:fixed;left:8px;bottom:8px;top:auto;max-width:600px;max-height:45vh;overflow:auto;background:#111d;padding:12px;font:12px monospace;color:white';document.body.append(output);
 const check=(ok,message)=>{if(!ok)throw Error(message);},frame=()=>new Promise(requestAnimationFrame),checks=[];
 const wait=async(predicate,label)=>{const end=performance.now()+45000;while(!predicate()&&performance.now()<end)await frame();check(predicate(),label);};
 const ready=id=>wait(()=>latestTelemetry?.ready&&latestTelemetry.modelTeam===id,'Ready '+id);
 const root=()=>game.scene.getObjectByName('team-pov-ferrari');
 const sourceFetch=window.fetch,sourceRender=game.renderer.render;
 let failMode='',hold=null,renderChecks=0,mirrorFrames=0,mirrorNonblack=0;
 window.fetch=async(...args)=>{
  if(String(args[0]).includes('ferrari-pov-driver.glb')){
   if(hold)await hold.promise;
   if(failMode==='http')return new Response('Unavailable',{status:503});
   if(failMode==='hash')return new Response('Invalid model bytes',{status:200});
  }
  return sourceFetch(...args);
 };
 game.renderer.render=function(scene,camera){
  const target=this.getRenderTarget(),pov=root();
  if(!target&&pov?.visible){
   check(!game.scene.getObjectByName('shared-cockpit').visible,'Shared cockpit overlaps the team cockpit');
   check(!game.scene.getObjectByName('player-car').getObjectByName('body').visible,'Original body overlaps team cockpit');
   game.scene.getObjectByName('player-car').traverse(o=>{if(o.userData.wheel!==undefined)check(o.visible,'Road wheel hidden in qualified cockpit');});
   let duplicateWheels=0;pov.traverse(o=>{if(o.userData.povRoadWheel){duplicateWheels++;check(!o.visible,'Duplicate cockpit road wheel rendered');}});check(duplicateWheels===4,'Qualified wheel assemblies missing');renderChecks++;
  }
  const result=sourceRender.call(this,scene,camera);
  if(target&&pov&&!pov.visible&&target.texture===pov.getObjectByName('team-mirror-left').material.map){
   mirrorFrames++;
   if(!mirrorNonblack){const pixels=new Uint8Array(target.width*target.height*4);this.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);mirrorNonblack=pixels.filter((v,i)=>i%4!==3&&v>5).length;}
  }
  return result;
 };
 try{
  game.mute(true);await ready('ferrari');await frame();await frame();
  const expected=await sourceFetch('../assets/f1-2026/evidence/ferrari-driver-visibility/engine-samples.json').then(r=>r.json());
  const hub=root().getObjectByName('team-driver-hub');check(hub.position.distanceTo(new THREE.Vector3(.55,.66,0))<1e-9&&Math.abs(hub.rotation.z+.28)<1e-9,'Static qualified hub differs');
  check(root().userData.driverSha===expected.sha256,'Wrong qualified driver');
  const names={left_sleeve:'ferrari_left_sleeve_trial',right_sleeve:'ferrari_right_sleeve_trial',left_glove:'ferrari_left_glove_trial',right_glove:'ferrari_right_glove_trial',wheel:'ferrari_wheel_rigid'};
  let maximumVertexError=0,compared=0;const samples=[];
  for(const angle of [0,90,-90,180,-180]){
   game.sim.roadAngle=angle/180*ApexGP.CAR.maxLock;await frame();await frame();game.scene.updateMatrixWorld(true);
   const f=angle>=0?97+angle/180*48:193-angle/180*48,ref=expected.checks.find(c=>c.frame===f),inverse=hub.matrixWorld.clone().invert();
   check(Math.abs(root().userData.steeringFrame-f)<1e-6,'Steering frame differs');
   for(const [part,name]of Object.entries(names)){
    const mesh=root().getObjectByName(name);if(mesh.isSkinnedMesh)mesh.skeleton.update();
    for(const vertex of ref.vertices_game[part]){
     const p=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,vertex.i);if(mesh.isSkinnedMesh)mesh.boneTransform(vertex.i,p);
     p.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);maximumVertexError=Math.max(maximumVertexError,p.distanceTo(new THREE.Vector3(...vertex.xyz)));compared++;
    }
   }
   samples.push({angle,frame:f});
  }
  check(maximumVertexError<1e-5,'In-game skin differs from qualified export: '+maximumVertexError);checks.push('Five steering poses:3200 raw-index vertices match qualified export');
  const lcd=root().getObjectByName('team-driver-lcd'),leftMirror=root().getObjectByName('team-mirror-left'),rightMirror=root().getObjectByName('team-mirror-right');
  check(lcd.parent.name==='ferrari_wheel_rigid','LCD does not follow the actual wheel');check(leftMirror.material.map===rightMirror.material.map,'Mirror target not shared');
  const version=lcd.material.map.version;game.sim.gear=7;game.sim.rpm=12000;for(let i=0;i<12;i++)await frame();
  check(lcd.material.map.version>version,'Dashboard canvas did not update');check(mirrorFrames>0&&mirrorNonblack>100,'Live mirror render missing');checks.push('Live wheel display and two fitted mirror faces render');
  check(renderChecks>0,'No qualified cockpit main pass observed');checks.push('Original body hidden; one exterior road-wheel set; shared cockpit hidden');
  game.camera(0);await frame();await frame();check(!root().visible&&game.scene.getObjectByName('player-car').getObjectByName('body').visible,'Cockpit overlay leaked into chase camera');game.camera(1);await frame();await frame();check(!root().visible,'Cockpit overlay leaked into T-cam');game.camera(2);checks.push('Chase/T-cam retain original exterior');
  const ownedGeometry=new Set(),ownedMaterial=new Set(),ownedTexture=new Set(),ownedSkeleton=new Set();
  root().traverse(o=>{if(o.geometry)ownedGeometry.add(o.geometry);if(o.skeleton)ownedSkeleton.add(o.skeleton);for(const m of [].concat(o.material||[]))ownedMaterial.add(m);});
  const sharedTextures=new Set([lcd.material.map,leftMirror.material.map]);for(const m of ownedMaterial)for(const v of Object.values(m))if(v?.isTexture&&!sharedTextures.has(v))ownedTexture.add(v);
  const disposed=[];for(const resource of [...ownedGeometry,...ownedMaterial,...ownedTexture]){const value={count:0};resource.addEventListener('dispose',()=>value.count++);disposed.push(value);}
  const skeletonDisposals=[];for(const skeleton of ownedSkeleton){const original=skeleton.dispose.bind(skeleton),value={count:0};skeleton.dispose=()=>{value.count++;original();};skeletonDisposals.push(value);}
  game.team('mclaren');await ready('mclaren');await frame();check(!root()&&game.scene.getObjectByName('shared-cockpit').visible,'Fallback cockpit did not recover');
  check(disposed.every(x=>x.count===1)&&skeletonDisposals.every(x=>x.count===1),'POV resources were not disposed once');checks.push('Team swap disposes every owned geometry/material/texture/skeleton once');
  for(const mode of ['http','hash']){
   failMode=mode;game.team('ferrari');await wait(()=>latestTelemetry?.modelError.includes('cockpit'),'Visible '+mode+' cockpit failure');check(!latestTelemetry.ready&&!root(),'Failed cockpit attached or allowed start');
   game.team('mclaren');await ready('mclaren');
  }
  failMode='';game.team('ferrari');await ready('ferrari');checks.push('HTTP/hash failures are visible and recover on retry');
  game.team('mclaren');await ready('mclaren');let release;hold={promise:new Promise(r=>release=r)};game.team('ferrari');game.begin({});
  for(let i=0;i<4;i++)await frame();check(!latestTelemetry.ready&&game.state.lightsT===0,'Race lights advanced before driver loaded');
  game.team('mclaren');hold=null;release();await ready('mclaren');for(let i=0;i<6;i++)await frame();check(!root(),'Obsolete cockpit replaced current team');checks.push('Race start waits for cockpit; obsolete load stays detached');
  game.destroy();window.fetch=sourceFetch;
  const originalParse=THREE.GLTFLoader.prototype.parse;let lateScene=null,deliver;
  THREE.GLTFLoader.prototype.parse=function(bytes,path,onLoad,onError){return originalParse.call(this,bytes,path,gltf=>{if(gltf.scene.getObjectByName('ferrari_wheel_rigid')){lateScene=gltf.scene;deliver=()=>onLoad(gltf);}else onLoad(gltf);},onError);};
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;width:1px;height:1px';document.body.append(canvas);
  const lateGame=ApexGP.create(canvas,{team:'ferrari',quality:0});await wait(()=>lateScene,'Late decoded driver');
  let lateDisposals=0;lateScene.getObjectByName('ferrari_wheel_rigid').geometry.addEventListener('dispose',()=>lateDisposals++);
  lateGame.destroy();THREE.GLTFLoader.prototype.parse=originalParse;deliver();for(let i=0;i<4;i++)await frame();canvas.remove();
  check(lateDisposals===1&&!lateGame.scene.getObjectByName('team-pov-ferrari'),'Late decoded driver leaked or attached after destroy');checks.push('Destroy disposes a late decoded driver');
  output.textContent=JSON.stringify({status:'PASS native Ferrari POV integration',checks,maximumVertexError,comparedVertices:compared,samples,renderChecks,mirrorFrames,mirrorNonblack,limits:['Trial artwork, intermediate steering visibility and seating remain unaccepted.','Functional native samples only; no sustained GPU/frame-time benchmark.']},null,2);document.body.dataset.ferrariCheck='pass';
 }catch(error){output.textContent='FAIL: '+error.stack;document.body.dataset.ferrariCheck='fail';console.error(error);}
 finally{window.fetch=sourceFetch;game.renderer.render=sourceRender;}
})();
