// HUD layout editor, DOM level: open from the menu, drag + wheel-resize + hide a widget with real CDP mouse input, DONE, check localStorage.
// Run: node test/layout-editor-test.js   (serves docs/ itself; run ./build.sh first; needs chromium, no WebGL needed)
const assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '../docs'), types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader('content-type', types[f.split('.').pop()] || 'application/octet-stream'); r.end(b); } }); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(8771, '127.0.0.1', r));
  const prof = fs.mkdtempSync(require('os').tmpdir() + '/apex-cr-');
  const cr = spawn('systemd-run', ['--user', '--scope', '--quiet', '--slice=background.slice', '-p', 'MemoryMax=3G', '-p', 'MemoryHigh=2500M', 'timeout', '150', 'chromium', '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing', '--window-size=1440,810', '--remote-debugging-port=9231', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  try {
    let tab; for (let i = 0; i < 60 && !tab; i++) { await sleep(500); try { tab = (await (await fetch('http://127.0.0.1:9231/json')).json()).find(t => t.type === 'page'); } catch (e) { /* not up yet */ } }
    assert(tab, 'chromium did not start');
    const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend[d.id]) pend[d.id](d); };
    const cdp = (method, params) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expr) => { const d = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (d.result.exceptionDetails) throw new Error(JSON.stringify(d.result.exceptionDetails)); return d.result.result.value; };
    const mouse = (type, x, y, o) => cdp('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', clickCount: 1 }, o));
    const rect = (sel) => ev(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    await cdp('Page.navigate', { url: 'http://127.0.0.1:8771/index.html' });
    for (let i = 0; i < 60 && !(await ev(`!!document.querySelector('#dispOpts button')`)); i++) await sleep(500);
    await ev(`localStorage.clear()`);
    // menu -> editor, no session started
    await ev(`[...document.querySelectorAll('#dispOpts button')].find(b => b.textContent.startsWith('Edit HUD layout')).click()`);
    assert.strictEqual(await ev(`document.getElementById('menu').hidden`), true, 'menu hidden');
    assert.strictEqual(await ev(`!document.getElementById('hud').hidden && document.getElementById('hud').classList.contains('editing')`), true, 'hud editing');
    for (const w of ['deltaBar', 'relative', 'inputs', 'dash']) assert((await rect('#' + w)).w > 0, w + ' shown while editing');
    // drag timing by 120,80 (real mouse events through the .ed box)
    const a = await rect('#timing'); await mouse('mouseMoved', a.x + 40, a.y + 40); await mouse('mousePressed', a.x + 40, a.y + 40);
    await mouse('mouseMoved', a.x + 100, a.y + 80, { buttons: 1 }); await mouse('mouseMoved', a.x + 160, a.y + 120, { buttons: 1 }); await mouse('mouseReleased', a.x + 160, a.y + 120);
    const b = await rect('#timing'); assert(Math.abs(b.x - a.x - 120) < 2 && Math.abs(b.y - a.y - 80) < 2, 'dragged: ' + JSON.stringify([a, b]));
    // wheel over it grows it
    await mouse('mouseMoved', b.x + 40, b.y + 40); await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: b.x + 40, y: b.y + 40, deltaX: 0, deltaY: -100 });
    const c = await rect('#timing'); assert(c.w > b.w * 1.05, 'wheel resized'); assert(Math.abs(c.x - b.x) < 2, 'top-left stays put');
    // corner handle drags it back down
    await mouse('mouseMoved', c.x + c.w - 4, c.y + c.h - 4); await mouse('mousePressed', c.x + c.w - 4, c.y + c.h - 4);
    await mouse('mouseMoved', c.x + c.w * 0.7, c.y + c.h * 0.7, { buttons: 1 }); await mouse('mouseReleased', c.x + c.w * 0.7, c.y + c.h * 0.7);
    const c2 = await rect('#timing'); assert(c2.w < c.w, 'corner shrinks');
    // hide tyres via its eye: stays visible (dimmed) while editing
    await ev(`[...document.querySelectorAll('#hud .ed')][2].querySelector('.eye').click()`);
    assert.strictEqual(await ev(`document.getElementById('tyres').classList.contains('wgt-off') && document.getElementById('tyres').offsetWidth > 0`), true, 'hidden but shown dimmed');
    // keys do not reach the game; DONE leaves the editor
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))`);
    const btn = await rect('#edBar button.main'); await mouse('mousePressed', btn.x + 5, btn.y + 5); await mouse('mouseReleased', btn.x + 5, btn.y + 5);
    assert.strictEqual(await ev(`document.getElementById('hud').hidden && !document.getElementById('menu').hidden && !document.getElementById('hud').classList.contains('editing')`), true, 'back at the menu');
    assert.strictEqual(await ev(`getComputedStyle(document.getElementById('tyres')).display`), 'none', 'hidden widget is display:none outside editing');
    const s = JSON.parse(await ev(`localStorage.getItem('apexgp.settings.v1')`)).layout;
    assert(Array.isArray(s.timing) && s.timing.length === 4 && s.timing[2] > 0.6 && s.timing[2] < 1.8 && s.timing[3] === false, 'timing stored: ' + JSON.stringify(s.timing));
    assert.strictEqual(s.tyres[3], true, 'tyres hidden stored: ' + JSON.stringify(s.tyres));
    // Esc exits too, and old two-number entries still load
    await ev(`localStorage.setItem('apexgp.settings.v1', JSON.stringify({ layout: { timing: [0.5, 0.5], dash: [0.1, 0.1, 99, 'x'], tyres: ['a', 1] } }))`);
    await cdp('Page.reload'); await sleep(2500);
    await ev(`[...document.querySelectorAll('#dispOpts button')].find(b => b.textContent.startsWith('Edit HUD layout')).click()`);
    const d = await rect('#timing'); assert(Math.abs(d.x - 720) < 2 && Math.abs(d.y - (await ev('innerHeight')) / 2) < 2 && (await ev(`document.getElementById('timing').style.transform`)) === 'scale(1)', 'old entry placed at scale 1: ' + JSON.stringify(d));
    assert((await rect('#dash')).w > 0 && (await ev(`document.getElementById('dash').style.transform`)) === 'scale(1.8)', 'bad scale clamped');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    assert.strictEqual(await ev(`!document.getElementById('hud').classList.contains('editing') && !document.getElementById('menu').hidden`), true, 'Esc exits');
    console.log('OK');
  } finally { spawn('pkill', ['-f', 'remote-debugging-port=9231']); cr.kill(); srv.close(); setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 1500); }
})().catch(e => { console.error(e); process.exit(1); });
