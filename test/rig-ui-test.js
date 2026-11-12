// Run through the Playwright browser_run_code_unsafe tool with the local bridge on :8766.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const test = await context.newPage();
  test.setDefaultTimeout(10000);
  let devices = [
    { key: 'sdl:moza', id: 1, name: 'MOZA R9', axes: [0], buttons: [0, 0], ffb: true },
    { key: 'sdl:pedals', id: 2, name: 'USB Pedals', axes: [1, 1], buttons: [], ffb: false },
  ];
  let command = {}, stage = 'navigation';
  const check = (value, message) => { if (!value) throw new Error(message); };
  try {
    await page.goto('about:blank');
    await test.route('https://fonts.googleapis.com/**', route => route.abort());
    await test.route('**/api/rig', async route => {
      command = route.request().postDataJSON() || {};
      await route.fulfill({ json: { devices, error: '', maxForce: 0.2 } });
    });
    await test.route('**/game.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nconst originalCreate = ApexGP.create; ApexGP.create = (...args) => window.testGame = originalCreate(...args);' });
    });
    await test.goto('http://127.0.0.1:8766', {waitUntil:'domcontentloaded', timeout:30000});
    stage = 'open calibration';
    await test.getByText('SIM RIG · WHEELS, PEDALS & FFB', { exact: true }).click();
    await test.waitForFunction(() => document.querySelector('#rigControls [role=status]').textContent.includes('MOZA R9'), null, {timeout:10000});
    await test.getByText('Advanced manual bindings', {exact:true}).click();
    const selects = test.locator('#rigControls select');
    stage = 'axis calibration';
    const binding = (device, axis) => JSON.stringify({ device, axis });
    await selects.nth(0).selectOption(binding('sdl:moza', 0));
    const position = async (device, axis, value) => {
      devices[device].axes[axis] = value;
      const label = device === 0 ? 'Steering' : axis === 0 ? 'Throttle' : 'Brake';
      await test.waitForFunction(({label, value}) => [...document.querySelectorAll('#rigControls .rig-manual > div')].some(e => e.querySelector('label')?.textContent.startsWith(label) && e.querySelector('output')?.textContent.startsWith('Raw ' + value.toFixed(3))), { label, value }, {timeout:10000});
    };
    // Find each axis row by its label.
    const row = key => test.locator('#rigControls .rig-manual > div').filter({ has: test.locator('label').filter({ hasText: key }) });
    await position(0, 0, -1); await row('Steering').getByRole('button', {name: 'Set left', exact:true}).click();
    await position(0, 0, 1); await row('Steering').getByRole('button', {name: 'Set right', exact:true}).click();
    await position(0, 0, 0); await row('Steering').getByRole('button', {name: 'Set center', exact:true}).click();
    for (const [index, label] of [[0, 'Throttle'], [1, 'Brake']]) {
      await selects.nth(index + 1).selectOption(binding('sdl:pedals', index));
      await row(label).getByRole('button', {name: 'Set rest', exact:true}).click();
      await position(1, index, -1); await row(label).getByRole('button', {name: 'Set full', exact:true}).click();
      await position(1, index, 1);
    }
    await selects.nth(3).selectOption(JSON.stringify({device: 'sdl:moza', button: 0}));
    await test.waitForFunction(() => document.querySelector('#rigControls [role=status]').textContent.includes('Calibration ready'), null, {timeout:10000});
    const ffb = test.getByRole('button', {name: 'Steering FFB: OFF', exact:true});
    check(!await ffb.isDisabled(), 'calibrated FFB device must allow enabling FFB');
    await test.screenshot({path:'/tmp/apex-rig-calibration.png'});
    // Software WebGL can render below 10 fps; test input lifecycle without GPU stalls.
    await test.evaluate(() => { testGame.renderer.render = () => {}; });
    stage = 'pause and FFB resume';
    await ffb.click();
    await test.evaluate(() => { testGame.state.phase = 'run'; testGame.sim.aligningTorque = -1000; });
    await test.waitForFunction(() => testGame.state.phase === 'run', null, {timeout:10000});
    await test.evaluate(() => testGame.pause());
    await test.waitForFunction(() => document.querySelector('#ovRigResume').hidden === false, null, {timeout:10000});
    check(command.active === false || command.force === 0, 'pause must stop torque');
    await test.getByRole('button', {name:'RESUME WITH WHEEL FFB', exact:true}).click();
    await test.waitForFunction(() => testGame.state.phase === 'run', null, {timeout:10000});
    stage = 'unplug';
    devices = [devices[0]];
    await test.waitForFunction(() => testGame.state.phase === 'paused', null, {timeout:10000});
    await test.waitForFunction(() => document.querySelector('#rigControls [role=status]').textContent.includes('Calibration required'), null, {timeout:10000});
    // Reconnection and reload retain calibration but leave forces disabled.
    devices.push({ key:'sdl:pedals', id:3, name:'USB Pedals', axes:[1,1], buttons:[], ffb:false });
    stage = 'saved calibration after reload';
    await test.reload({waitUntil:'domcontentloaded',timeout:30000});
    await test.getByText('SIM RIG · WHEELS, PEDALS & FFB', {exact:true}).click();
    await test.waitForFunction(() => document.querySelector('#rigControls [role=status]').textContent.includes('Calibration ready'), null, {timeout:10000});
    check(await test.getByRole('button', {name:'Steering FFB: OFF', exact:true}).isEnabled(), 'FFB must start off after reload');
    stage = 'narrow viewport';
    await test.setViewportSize({width:390,height:844});
    await test.getByRole('button', {name:'Steering FFB: OFF', exact:true}).scrollIntoViewIfNeeded();
    await test.screenshot({path:'/tmp/apex-rig-mobile.png'});
    check(await test.evaluate(() => document.querySelector('#menu').scrollWidth <= innerWidth), 'wheel settings must fit a mobile viewport');
    return 'PASS: detection, separate-pedal calibration, saved profile, FFB enable/resume, unplug pause and narrow layout';
  } catch (error) { throw new Error(stage + ': ' + error.message); } finally { await context.close(); }
}
