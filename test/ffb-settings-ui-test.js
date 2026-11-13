// Run with browser_run_code_unsafe and a project-root static server on :8767. DOM-only, fake bridge, no WebGL/HID.
async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:440,height:1000}}),test=await context.newPage();test.setDefaultTimeout(10000);
  const device={key:'r3',id:1,name:'Gudsen R3 Racing Wheel and Pedals',axes:[0,-1,-1,-1,-1,-1],buttons:[0],ffb:true};
  const profile={steer:{device:'r3',axis:0,left:-1,center:0,right:1},throttle:{device:'r3',axis:2,rest:-1,full:1},brake:{device:'r3',axis:5,rest:-1,full:1}};
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  try{
    const html=await(await test.request.get('http://127.0.0.1:8767/docs/index.html')).text(),css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
    await context.addInitScript(profile=>{if(!localStorage.getItem('apexgp.rig.v1'))localStorage.setItem('apexgp.rig.v1',JSON.stringify(profile));},profile);
    await test.route('**/api/rig',r=>r.fulfill({json:{devices:[device],error:'',maxForce:0.2}}));
    await test.route('**/ffb-settings-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><style>'+css+'\nbody {overflow:auto} #rigControls {box-sizing:border-box;width:calc(100% - 32px);max-width:380px;margin:16px auto} #rigControls > label progress {width:100%}</style></head><body><div id="rigControls" class="panel"></div><script src="/docs/webhid-ffb.js"></script><script src="/docs/rig.js"></script><script>window.controls=new ApexRig.RigControls();controls.mount(document.getElementById("rigControls"));</script></body></html>'}));
    await test.goto('http://127.0.0.1:8767/ffb-settings-test',{waitUntil:'domcontentloaded'});
    await test.waitForFunction(()=>controls.bridge,null,{timeout:10000});
    const strength=test.getByRole('slider',{name:/^FFB strength/}),road=test.getByRole('slider',{name:/^Road texture/});
    check(await strength.getAttribute('max')==='100','strength range');
    check(await strength.evaluate(el=>el.value)==='60','stronger default strength');
    check(await road.evaluate(el=>el.value)==='60','default road texture');
    await strength.fill('70');await road.fill('90');
    const stored=await test.evaluate(()=>JSON.parse(localStorage.getItem('apexgp.rig.v1')));
    check(stored.feedback.strength===0.7&&stored.feedback.roadFeel===0.9,'tuning was not saved');
    await test.getByRole('button',{name:'Steering FFB: OFF',exact:true}).click();
    await test.evaluate(()=>controls.feedback({aligningTorque:406,roadFeedback:0.4,speed:40,surf:['kerb','asphalt']},true));
    await test.waitForFunction(()=>document.querySelector('progress[aria-label="FFB output request"]').value>10,null,{timeout:10000});
    check(await test.locator('#rigControls').innerText().then(text=>text.includes('kerb / asphalt')),'surface context missing');
    await test.getByRole('slider',{name:/^Road texture/}).scrollIntoViewIfNeeded();
    await test.screenshot({path:'/tmp/apex-road-feedback-settings.png'});
    await road.fill('0');await test.evaluate(()=>controls.feedback({aligningTorque:406,roadFeedback:0.4,speed:40,surf:['kerb','asphalt']},true));
    await test.waitForFunction(()=>document.querySelector('progress[aria-label="FFB output request"]').value<8,null,{timeout:10000});
    await road.fill('90');await test.getByRole('checkbox',{name:'Reverse FFB direction',exact:true}).check();
    check(await test.evaluate(()=>!controls.ffb&&controls.force===0),'changing direction must disarm FFB');
    await test.getByRole('button',{name:'Start input walkthrough',exact:true}).click();
    await test.evaluate(()=>{const {steer,throttle,brake}=controls.profile;controls.wizard.draft={steer,throttle,brake};controls.wizard.go(16,controls.allDevices());});
    await test.getByRole('dialog').getByRole('button',{name:'Save rig setup',exact:true}).click();
    check(await test.evaluate(()=>controls.profile.feedback.strength===0.7&&controls.profile.feedback.roadFeel===0.9),'wizard lost tuning');
    await test.reload({waitUntil:'domcontentloaded'});
    check(await strength.evaluate(el=>el.value)==='70'&&await road.evaluate(el=>el.value)==='90','reload lost tuning');
    check(await test.getByRole('checkbox',{name:'Reverse FFB direction',exact:true}).isChecked(),'reload lost direction');
    check(await test.evaluate(()=>!controls.ffb),'reload armed force without user input');
    check(await test.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings overflow narrow screen');
    return 'PASS: stronger defaults, road texture slider, requested-force meter, surface display, disarm, wizard preservation, save/reload and narrow layout; no WebGL or physical HID';
  }finally{await context.close();}
}
