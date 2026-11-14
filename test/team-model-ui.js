// Serve the project on :8780; run with browser_run_code_unsafe. Uses an isolated profile, no rig mapping.
async (page, canvasOnly = false) => {
  await page.goto('about:blank');
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await context.newPage(), errors = [], checks = [];
  p.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => {
    navigator.getGamepads = () => [];
    localStorage.setItem('apexgp.rig.asked', '1');
    localStorage.setItem('apexgp.settings.v1', JSON.stringify({ team: 'apex', gfx: '0', map: false }));
  });
  const capture = `;const originalTeamCreate = ApexGP.create; ApexGP.create = (canvas, opts) => window.uiGame = originalTeamCreate(canvas, {...opts, quality:0, onTelemetry(t) { window.uiTelemetry=t; opts.onTelemetry?.(t); }});`;
  await p.route('**/docs/game.js*', async route => {
    const response = await route.fetch(); await route.fulfill({ response, body: await response.text() + capture });
  });
  const ready = id => p.waitForFunction(id => window.uiTelemetry?.ready && uiTelemetry.modelTeam === id, id, { timeout: 45000 });
  const check = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
  try {
    if (!canvasOnly) {
    await p.goto('http://127.0.0.1:8780/docs/index.html'); await ready('apex');
    await p.getByRole('button', { name: /^Team / }).click(); await ready('mclaren');
    check(await p.locator('#go').isEnabled(), 'Built page enables start after selected model loads');
    await p.getByRole('button', { name: /^Circuit / }).click({ noWaitAfter:true, timeout:60000 }); await ready('mclaren');
    check(await p.evaluate(() => uiGame.track.id === 'virel'), 'Built circuit rebuild retains McLaren');
    await p.route('**/docs/vendor/f1-models/ferrari.glb', route => route.fulfill({status:503, body:'test unavailable'}));
    await p.getByRole('button', { name: /^Team / }).click();
    await p.waitForFunction(() => document.getElementById('status').textContent.includes('Ferrari') && document.getElementById('go').disabled);
    check(await p.evaluate(() => uiGame.scene.getObjectByName('player-car').children.length === 0), 'Built page shows failed Ferrari load and blocks start without another car');
    await p.unroute('**/docs/vendor/f1-models/ferrari.glb');
    await p.getByRole('button', { name: /^Team / }).click(); await ready('redbull');
    await p.locator('#go').click(); await p.waitForFunction(() => uiTelemetry.phase === 'lights');
    check(await p.locator('#menu').isHidden(), 'Built page starts selected Red Bull');
    await p.evaluate(() => uiGame.destroy());
    } else {
    await p.goto('http://127.0.0.1:8780/.preview/team-canvas/Main.dc.html');
    await p.getByRole('button', { name:'GO TO GRID ›', exact:true }).waitFor();
    await p.waitForFunction(() => window.teamCanvasGame?.scene.getObjectByName('player-car')?.userData.modelTeam === 'apex');
    await p.getByRole('button', { name: /^Team / }).click();
    await p.waitForFunction(() => teamCanvasGame.scene.getObjectByName('player-car')?.userData.modelTeam === 'mclaren');
    await p.getByRole('button', { name: /^Circuit / }).click({ noWaitAfter:true, timeout:60000 });
    await p.waitForFunction(() => teamCanvasGame.track.id === 'virel' && teamCanvasGame.scene.getObjectByName('player-car')?.userData.modelTeam === 'mclaren');
    check(true, 'Canvas Team selection survives circuit rebuild');
    await p.getByRole('button', { name:'GO TO GRID ›', exact:true }).click();
    await p.waitForFunction(() => teamCanvasGame.state.phase === 'lights');
    check(true, 'Canvas starts selected McLaren');
    await p.evaluate(() => teamCanvasGame.destroy());
    }
    check(errors.length === 0, 'No JavaScript exceptions in either UI');
    return { status:'PASS ' + (canvasOnly ? 'canvas' : 'built') + ' team UI', checks, errors, limits:['Canvas uses the saved local DC runtime.', 'Software renderer; appearance and hardware controls are separate checks.'] };
  } finally { await context.close(); }
}
