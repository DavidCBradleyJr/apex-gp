/* Isolated fit investigation; it never changes the exterior or production cockpit. */
(async () => {
  const check=(ok,message)=>{if(!ok)throw Error(message);}, output=document.querySelector('pre');
  try {
    const load=async(file,sha)=>{
      const response=await fetch(file);check(response.ok,'Missing '+file);const bytes=await response.arrayBuffer();
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      check(digest===sha,'Hash mismatch '+file);
      return new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(bytes,'',resolve,reject));
    };
    const manifest=await fetch('fit-inputs.json').then(r=>r.json());
    const [car,driver,components]=await Promise.all([load('car.glb',manifest.carSha256),load('asset.glb',manifest.driverSha256),manifest.cockpitReconstructed?{components:[]}:fetch('body-components.json').then(r=>r.json())]);
    const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
    renderer.setSize(innerWidth,innerHeight);renderer.outputEncoding=THREE.sRGBEncoding;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#668297');scene.add(car.scene);
    scene.add(new THREE.HemisphereLight(0xffffff,0x393c40,1));const light=new THREE.DirectionalLight(0xffffff,1);light.position.set(2,4,-3);scene.add(light);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x43484a,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);
    const hub=new THREE.Group();hub.position.fromArray(manifest.wheelHub);hub.rotation.z=manifest.rakeZ;scene.add(hub);hub.add(driver.scene);
    const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.005,100);
    const body=car.scene.getObjectByName('body');check(body,'Exterior body missing');
    const component=components.components.find(c=>c.id===18)||{faces:[],triangles:0};check(manifest.cockpitReconstructed||component.triangles===513,'Source component18 missing');
    const bodyMeshes=[];body.traverse(o=>{if(o.isMesh)bodyMeshes.push(o);});
    const highlights=[];
    for(let p=0;p<bodyMeshes.length;p++){
      const mesh=bodyMeshes[p],indices=[];
      for(const [primitive,triangle] of component.faces)if(primitive===p)for(let j=0;j<3;j++)indices.push(mesh.geometry.index.getX(triangle*3+j));
      if(!indices.length)continue;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',mesh.geometry.attributes.position);geometry.setIndex(indices);
      const overlay=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xff00cc,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.8}));
      overlay.renderOrder=20;mesh.add(overlay);highlights.push(overlay);
    }
    check(manifest.cockpitReconstructed||highlights.length>0,'Component highlight empty');
    const sourceIndices=bodyMeshes.map(mesh=>Array.from(mesh.geometry.index.array));
    let sourceWheelExcluded=!!manifest.cockpitReconstructed;
    const wheel=driver.scene.getObjectByName('ferrari_wheel_rigid'),hands=['left','right'].map(s=>driver.scene.getObjectByName('ferrari_'+s+'_glove_trial'));
    check(wheel&&hands.every(Boolean),'Driver parts missing');
    const mixer=new THREE.AnimationMixer(driver.scene),action=mixer.clipAction(driver.animations[0]);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    const pose=angle=>{
      check(Number.isFinite(angle)&&Math.abs(angle)<=180,'Invalid steering angle');
      const frame=angle>=0?97+angle/180*48:193-angle/180*48;
      action.reset().play();mixer.setTime(frame/24);scene.updateMatrixWorld(true);
      driver.scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
      const relative=new THREE.Quaternion();wheel.getWorldQuaternion(relative);relative.premultiply(hub.quaternion.clone().invert());
      check(Math.abs(Math.abs(relative.x)-Math.abs(Math.sin(angle*Math.PI/360)))<1e-5,'Wheel angle mismatch');
      renderer.render(scene,camera);return frame;
    };
    const view=type=>{
      if(type==='Eye'){camera.position.fromArray(manifest.eye);camera.lookAt(5,.40,0);}
      else if(type==='Cockpit oblique'){camera.position.set(-.65,1.65,1.1);camera.lookAt(.25,.6,0);}
      else{camera.position.set(-2,1.6,3);camera.lookAt(.1,.5,0);}
      renderer.render(scene,camera);
    };
    for(const name of ['Eye','Cockpit oblique','Exterior']){const button=document.createElement('button');button.textContent=name;button.onclick=()=>view(name);document.querySelector('#views').append(button);}
    for(const angle of [-180,-90,0,90,135,172.5,180]){const button=document.createElement('button');button.textContent=angle+'°';button.onclick=()=>pose(angle);document.querySelector('#poses').append(button);}
    if(!manifest.cockpitReconstructed){
    const toggle=document.createElement('button');toggle.textContent='Toggle component18';toggle.onclick=()=>{for(const mesh of highlights)mesh.visible=!mesh.visible;renderer.render(scene,camera);};document.querySelector('#views').append(toggle);
    const replace=document.createElement('button');replace.textContent='Replace source wheel in preview';replace.onclick=()=>{
      sourceWheelExcluded=!sourceWheelExcluded;let removed=0;
      for(let p=0;p<bodyMeshes.length;p++){
        const excluded=new Set(component.faces.filter(([primitive])=>primitive===p).map(([,triangle])=>triangle));
        const indices=sourceIndices[p].filter((_,i)=>!sourceWheelExcluded||!excluded.has(Math.floor(i/3)));
        removed+=(sourceIndices[p].length-indices.length)/3;bodyMeshes[p].geometry.setIndex(indices);
      }
      check(removed===(sourceWheelExcluded?513:0),'Unexpected source geometry removal');
      for(const mesh of highlights)mesh.visible=!sourceWheelExcluded;
      const report=JSON.parse(output.textContent);report.sourceWheelExcluded=sourceWheelExcluded;
      report.status='Fit investigation only; component18 is '+(sourceWheelExcluded?'excluded from this preview':'retained');output.textContent=JSON.stringify(report,null,2);renderer.render(scene,camera);
    };document.querySelector('#views').append(replace);
    }
    view('Eye');const frames=[-180,-90,0,90,135,172.5,180].map(angle=>({angle,frame:pose(angle)}));pose(0);
    const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    output.textContent=JSON.stringify({status:manifest.cockpitReconstructed?'Reconstructed cockpit fit trial; source wheel already removed':'Fit investigation only; source component18 highlighted, no geometry removed',...manifest,sourceWheelExcluded,frames,highlightTriangles:component.triangles,renderer:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),limits:['Eye/hub placement is inferred from this generated exterior; actual seating and clearances remain unaccepted.','Clip is attached to a static raked hub; it already rotates the wheel and hands.','Artwork, cloth, dashboard/mirrors, cockpit collisions and full driver acceptance remain open.']},null,2);
    document.body.dataset.check='pass';
  } catch(error){output.textContent='FAIL: '+error.message;document.body.dataset.check='fail';}
})();
