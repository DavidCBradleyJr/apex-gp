// Run with browser_run_code_unsafe and a static docs/ server on :8766. All hardware is simulated.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900}});
  const test = await context.newPage(); test.setDefaultTimeout(10000);
  const devices = [{key:'r3',id:1,name:'Gudsen R3 Racing Wheel and Pedals',axes:[0,-1,-1,-1,-1,-1,-1,-1],buttons:Array(128).fill(0),ffb:true}];
  const old = {steer:{device:'r3',axis:0,left:-1,center:0,right:1},throttle:{device:'r3',axis:2,rest:-1,full:1},brake:{device:'r3',axis:5,rest:-1,full:1}};
  let stage = 'load', forceSent = false;
  const check = (value, message) => { if (!value) throw new Error(message); };
  try {
    await page.goto('about:blank');
    await context.addInitScript(profile => { if (!localStorage.getItem('apexgp.rig.v1')) localStorage.setItem('apexgp.rig.v1',JSON.stringify(profile)); }, old);
    await test.route('https://fonts.googleapis.com/**', r => r.abort());
    await test.route('**/api/rig', async r => { const msg=r.request().postDataJSON(); if (msg?.active || msg?.force) forceSent=true; await r.fulfill({json:{devices,error:'',maxForce:0.2}}); });
    await test.route('**/game.js', async r => { const response=await r.fetch(); await r.fulfill({response,body:await response.text()+'\nconst createOriginal=ApexGP.create; ApexGP.create=(...a)=>window.testGame=createOriginal(...a);'}); });
    await test.route('**/rig.js', async r => { const response=await r.fetch(); await r.fulfill({response,body:await response.text()+'\nconst ControlsOriginal=ApexRig.RigControls; ApexRig.RigControls=class extends ControlsOriginal {constructor(){super();window.testControls=this;}};'}); });
    await test.goto('http://127.0.0.1:8766',{waitUntil:'domcontentloaded',timeout:30000});
    await test.evaluate(()=>{ testGame.renderer.render=()=>{}; });
    await test.getByText('SIM RIG · WHEELS, PEDALS & FFB',{exact:true}).click();
    await test.waitForFunction(()=>testControls.bridge,null,{timeout:10000});
    const dialog=test.getByRole('dialog');
    const click=async name=>dialog.getByRole('button',{name,exact:true}).click();
    const heading=async name=>dialog.getByRole('heading',{name,exact:true}).waitFor({state:'visible'});
    const move=async(index,value)=>{devices[0].axes[index]=value; await test.waitForFunction(({index,value})=>testControls.allDevices()[0].axes[index]===value,{index,value},{timeout:10000});};
    const button=async(index,value)=>{devices[0].buttons[index]=value; await test.waitForFunction(({index,value})=>testControls.allDevices()[0].buttons[index]===value,{index,value},{timeout:10000});};
    stage='cancel preserves calibration';
    await test.getByRole('button',{name:'Start input walkthrough',exact:true}).click();
    await click('Start listening'); await heading('Turn fully left');
    check(!await dialog.getByRole('button',{name:'Confirm this input',exact:true}).isEnabled(),'must wait for movement');
    await move(0,-1); await click('Confirm this input'); await click('Cancel setup');
    check(JSON.stringify(await test.evaluate(()=>JSON.parse(localStorage.getItem('apexgp.rig.v1'))))===JSON.stringify(old),'cancel changed saved bindings');
    stage='steering'; await move(0,0);
    await test.getByRole('button',{name:'Start input walkthrough',exact:true}).click();
    await click('Start listening'); await move(0,-1); await click('Confirm this input');
    await heading('Turn fully right'); await move(0,1); await click('Confirm this input');
    await heading('Return to center'); check(!await dialog.getByRole('button',{name:'Confirm center',exact:true}).isEnabled(),'right lock accepted as center');
    await move(0,0); await click('Confirm center'); await heading('Check steering direction');
    await move(0,-0.5); await test.waitForFunction(()=>document.querySelector('.rig-wizard .rig-wheel-box output').textContent==='90° left',null,{timeout:10000});
    await test.screenshot({path:'/tmp/apex-wizard-steering.png'});
    await click('Reverse steering direction');
    check((await dialog.getByLabel('Steering position',{exact:true}).innerText()).includes('right'),'reverse direction preview failed');
    await click('Reverse steering direction'); await move(0,0); await click('Yes, this works correctly');
    stage='pedals'; await heading('Release the throttle'); await click('Pedal released — continue');
    await move(2,1); await click('Confirm this input'); await heading('Check the throttle');
    await move(2,0); await test.waitForFunction(()=>document.querySelector('.rig-wizard progress[aria-label="Throttle input"]').value===50,null,{timeout:10000});
    await move(2,-1); await click('Yes, this works correctly');
    await heading('Release the brake'); await click('Pedal released — continue');
    await move(5,1); await click('Confirm this input'); await heading('Check the brake');
    await move(5,0); await test.waitForFunction(()=>document.querySelector('.rig-wizard progress[aria-label="Brake input"]').value===50,null,{timeout:10000});
    await click('Yes, this works correctly');
    stage='button assignments';
    for (const [title,index] of [['Assign shift up',13],['Assign shift down',12],['Assign DRS',10],['Assign overtake',8],['Assign pause',6]]) {
      await heading(title); await button(index,1); await click('Confirm this input'); await button(index,0);
    }
    stage='review and save'; await heading('Test your rig');
    await move(0,0.5); await move(2,0); await move(5,0.5); await button(13,1);
    await test.waitForFunction(()=>document.querySelector('.rig-wizard progress[aria-label="Brake input"]').value===75,null,{timeout:10000});
    check((await dialog.getByLabel('Throttle percentage',{exact:true}).innerText())==='50%','throttle preview value');
    await test.waitForFunction(()=>document.querySelectorAll('.rig-wizard .rig-button-preview .pressed').length===1,null,{timeout:10000});
    await test.screenshot({path:'/tmp/apex-wizard-review.png'});
    check(JSON.stringify(await test.evaluate(()=>JSON.parse(localStorage.getItem('apexgp.rig.v1'))))===JSON.stringify(old),'draft saved before confirmation');
    await test.setViewportSize({width:390,height:844});
    await test.screenshot({path:'/tmp/apex-wizard-mobile.png'});
    check(await test.evaluate(()=>document.querySelector('.rig-wizard').scrollWidth<=document.querySelector('.rig-wizard').clientWidth),'wizard overflows on mobile');
    await click('Save rig setup');
    const saved=await test.evaluate(()=>JSON.parse(localStorage.getItem('apexgp.rig.v1')));
    check(saved.up.button===13 && saved.down.button===12 && saved.drs.button===10 && saved.overtake.button===8 && saved.pause.button===6,'button mappings not saved');
    check(saved.throttle.axis===2 && saved.brake.axis===5,'pedal mappings not saved');
    check(!await dialog.isVisible(),'save did not close wizard');
    check(!forceSent,'wizard sent force feedback');
    stage='reload and escape';
    await test.reload({waitUntil:'domcontentloaded',timeout:30000});
    await test.evaluate(()=>{testGame.renderer.render=()=>{};});
    await test.getByText('SIM RIG · WHEELS, PEDALS & FFB',{exact:true}).click();
    await test.getByRole('button',{name:'Start input walkthrough',exact:true}).click();
    await dialog.press('Escape'); check(!await dialog.isVisible(),'Escape should cancel');
    check((await test.evaluate(()=>JSON.parse(localStorage.getItem('apexgp.rig.v1')))).up.button===13,'reload lost setup');
    return 'PASS: guided assignment, explicit confirmation, correct wheel direction, live pedal percentages, all buttons, cancel/Escape preservation, save/reload, mobile layout and FFB suppression';
  } catch(e) { throw new Error(stage+': '+e.message); }
  finally { await context.close(); }
}
