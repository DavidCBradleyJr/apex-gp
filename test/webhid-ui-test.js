// Run with browser_run_code_unsafe and a project-root static server on :8767. HID and gamepads are fake.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:1280,height:900}}),test=await context.newPage();test.setDefaultTimeout(10000);
  const fixture=await (await test.request.get('http://127.0.0.1:8767/test/fixtures/moza-r3-hid.json')).json();
  let stage='load';const check=(ok,message)=>{if(!ok)throw Error(message);};
  try {
    await page.goto('about:blank');
    await context.addInitScript(fixture=>{
      const calls=[];window.hidCalls=calls;window.hidDeny=true;window.hidFail=false;
      const device={...fixture,opened:false,open:async()=>{device.opened=true;},close:async()=>{device.opened=false;},
        sendReport:async(id,data)=>{if(window.hidFail)throw Error('Simulated USB failure');calls.push({kind:'out',id,data:Array.from(data)});},
        sendFeatureReport:async(id,data)=>{calls.push({kind:'feature',id,data:Array.from(data)});},
        receiveFeatureReport:async id=>new DataView(Uint8Array.from(id===18?[18,2,1,0,0]:[19,0,64,10,1]).buffer)};
      Object.defineProperty(navigator,'hid',{value:{requestDevice:async options=>{window.hidFilters=options.filters;if(window.hidDeny)throw new DOMException('Device access denied','NotAllowedError');return[device];},addEventListener:()=>{}}});
      const id=fixture.productName+' (Vendor: 346e Product: 0005)',key='browser:'+id+':0';
      Object.defineProperty(navigator,'getGamepads',{value:()=>[{index:0,id,mapping:'',axes:[0,-1,-1,-1,-1,-1,-1,-1],buttons:Array.from({length:128},()=>({value:0,pressed:false}))}]});
      localStorage.setItem('apexgp.rig.v1',JSON.stringify({steer:{device:key,axis:0,left:-1,center:0,right:1},throttle:{device:key,axis:2,rest:-1,full:1},brake:{device:key,axis:5,rest:-1,full:1}}));
    },fixture);
    await test.route('https://fonts.googleapis.com/**',r=>r.abort());
    await test.route('**/api/rig',r=>r.fulfill({status:404,json:{error:'No bridge'}}));
    await test.route('**/game.js',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+'\nconst original=ApexGP.create;ApexGP.create=(...a)=>window.testGame=original(...a);'});});
    await test.route('**/rig.js',async r=>{const response=await r.fetch();await r.fulfill({response,body:await response.text()+'\nconst Original=ApexRig.RigControls;ApexRig.RigControls=class extends Original{constructor(){super();window.testControls=this;}};'});});
    await test.goto('http://127.0.0.1:8767/docs/',{waitUntil:'domcontentloaded',timeout:30000});
    await test.evaluate(()=>{testGame.renderer.render=()=>{};});
    await test.getByText('SIM RIG · WHEELS, PEDALS & FFB',{exact:true}).click();
    stage='access denial';
    await test.getByRole('button',{name:'Connect browser FFB',exact:true}).click();
    await test.waitForFunction(()=>document.querySelector('#rigControls').textContent.includes('Device access denied'),null,{timeout:10000});
    check(await test.getByRole('button',{name:/Steering FFB: OFF/}).isDisabled(),'access denial enabled FFB');
    stage='connect without bridge';await test.evaluate(()=>{window.hidDeny=false;});
    await test.getByRole('button',{name:'Connect browser FFB',exact:true}).click();
    await test.getByRole('button',{name:'Disconnect browser FFB',exact:true}).waitFor({state:'visible'});
    check(await test.evaluate(()=>!testControls.bridge && testControls.hid.ready),'native path required a bridge');
    check(await test.evaluate(()=>!hidCalls.some(c=>c.id===10)),'connect started torque');
    check(await test.evaluate(()=>hidFilters[0].vendorId===0x346e&&hidFilters[0].productId===5),'picker was not limited to R3');
    await test.getByRole('button',{name:'Steering FFB: OFF',exact:true}).scrollIntoViewIfNeeded();
    await test.screenshot({path:'/tmp/apex-browser-ffb.png'});
    stage='explicit FFB enable and pause';
    await test.getByRole('button',{name:'Steering FFB: OFF',exact:true}).click();
    await test.evaluate(()=>{testGame.state.phase='run';testControls.feedback({aligningTorque:1000},true);});
    await test.waitForFunction(()=>hidCalls.some(c=>c.id===10&&c.data[1]===1),null,{timeout:10000});
    check(await test.evaluate(()=>hidCalls.filter(c=>c.id===10&&c.data[1]===1).every(c=>c.data[2]===1)),'infinite effect playback');
    await test.evaluate(()=>testGame.pause());
    await test.waitForFunction(()=>testControls.ffb&&!testControls.hid.playing,null,{timeout:10000}); // pause stops torque but stays armed for resume
    check(await test.evaluate(()=>hidCalls.filter(c=>c.id===10).at(-1).data[1]===3),'pause did not stop the effect');
    stage='wizard suppresses native FFB';
    await test.evaluate(()=>testGame.menu());
    await test.getByRole('button',{name:'Start input walkthrough',exact:true}).click();
    check(await test.evaluate(()=>!testControls.ffb&&testControls.force===0),'wizard left native FFB on');
    await test.getByRole('dialog').getByRole('button',{name:'Cancel setup',exact:true}).click();
    stage='disconnect cleanup';
    await test.getByRole('button',{name:'Disconnect browser FFB',exact:true}).click();
    await test.getByRole('button',{name:'Connect browser FFB',exact:true}).waitFor({state:'visible'});
    check(await test.evaluate(()=>hidCalls.some(c=>c.id===11)&&!testControls.hid.ready),'effect not freed on disconnect');
    return 'PASS: permission denial, R3 picker, direct FFB without bridge, zero-force connect, explicit finite force, pause, wizard suppression and cleanup';
  } catch(error){throw Error(stage+': '+error.message);}
  finally{await context.close();}
}
