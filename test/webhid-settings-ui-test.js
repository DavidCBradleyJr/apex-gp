// DOM-only browser test with fake HID/gamepads; project-root static server on :8767. No physical forces.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:440,height:1000}}),test=await context.newPage();test.setDefaultTimeout(10000);
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  try {
    const fixture=await(await test.request.get('http://127.0.0.1:8767/test/fixtures/moza-r3-hid.json')).json();
    const html=await(await test.request.get('http://127.0.0.1:8767/docs/index.html')).text(),css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
    await context.addInitScript(fixture=>{
      window.hidCalls=[];let nextBlock=2;
      const device={...fixture,opened:false,open:async()=>{device.opened=true;},close:async()=>{device.opened=false;},
        sendReport:async(id,data)=>{hidCalls.push({id,data:Array.from(data)});},sendFeatureReport:async()=>{},
        receiveFeatureReport:async id=>new DataView(Uint8Array.from(id===18?[18,nextBlock++,1,0,0]:[19,0,64,10,1]).buffer)};
      Object.defineProperty(navigator,'hid',{value:{requestDevice:async()=>[device],addEventListener:()=>{}}});
      Object.defineProperty(navigator,'getGamepads',{value:()=>[{index:0,id:fixture.productName,axes:[0,-1,-1,-1,-1,-1],buttons:[{value:0}]}]});
      const key='browser:'+fixture.productName+':0';
      localStorage.setItem('apexgp.rig.v1',JSON.stringify({steer:{device:key,axis:0,left:-1,center:0,right:1},throttle:{device:key,axis:2,rest:-1,full:1},brake:{device:key,axis:5,rest:-1,full:1}}));
    },fixture);
    await test.route('**/api/rig',r=>r.fulfill({status:404,json:{error:'No bridge'}}));
    await test.route('**/native-settings-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><style>'+css+'\nbody{overflow:auto}#rigControls{box-sizing:border-box;max-width:400px;margin:16px}</style></head><body><div id="rigControls" class="panel"></div><script src="/docs/webhid-ffb.js"></script><script src="/docs/rig.js"></script><script>window.controls=new ApexRig.RigControls();controls.mount(document.getElementById("rigControls"));</script></body></html>'}));
    await test.goto('http://127.0.0.1:8767/native-settings-test',{waitUntil:'domcontentloaded'});
    const damping=test.getByRole('slider',{name:'Damping',exact:true}),friction=test.getByRole('slider',{name:'Friction',exact:true});
    check(await damping.isDisabled()&&await friction.isDisabled(),'effects enabled before connection');
    await test.getByRole('button',{name:'Connect browser FFB',exact:true}).click();
    await test.waitForFunction(()=>controls.hid.ready&&controls.hid.conditions);
    check(await test.evaluate(()=>!hidCalls.some(c=>c.id===10)),'connection started an effect');
    await test.waitForFunction(()=>!document.querySelector('input[aria-describedby="rig-damping-help"]').disabled);
    await damping.fill('15');await friction.fill('5');
    await test.getByRole('button',{name:'Steering FFB: OFF',exact:true}).click();
    await test.evaluate(async()=>{controls.feedback({aligningTorque:0,roadFeedback:0,speed:0},true);await controls.hid.busy;});
    check(await test.evaluate(()=>hidCalls.filter(c=>c.id===10&&c.data[1]===1).map(c=>c.data[0]).sort().join(',')==='3,4'),'damper/friction must work at zero aligning torque');
    await damping.scrollIntoViewIfNeeded();await test.screenshot({path:'/tmp/apex-native-ffb-settings.png'});
    await test.getByRole('button',{name:'Steering FFB: ON',exact:true}).click();
    await test.waitForFunction(()=>!controls.hid.playing);
    check(await test.evaluate(()=>[2,3,4].every(block=>hidCalls.filter(c=>c.id===10&&c.data[0]===block).at(-1).data[1]===3)),'OFF did not stop every effect');
    await test.getByRole('slider',{name:/^Maximum FFB output/}).fill('40');
    await test.getByRole('button',{name:'Steering FFB: OFF',exact:true}).click();
    await test.evaluate(async()=>{controls.feedback({aligningTorque:400,roadFeedback:0,speed:40},true);await controls.hid.busy;window.dispatchEvent(new Event('blur'));await controls.hid.busy;});
    check(await test.evaluate(()=>!controls.ffb&&!controls.hid.playing),'blur left effects running');
    await test.getByRole('button',{name:'Disconnect browser FFB',exact:true}).click();
    check(await test.evaluate(()=>!controls.hid.ready&&hidCalls.filter(c=>c.id===11).length===3),'disconnect did not free all effects');
    return 'PASS: native condition capabilities, zero-force connection, damping at zero steering torque, explicit OFF, blur and cleanup; fake hardware, no WebGL';
  } finally {await context.close();}
}
