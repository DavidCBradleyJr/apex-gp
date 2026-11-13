// Sim rig setup UX, DOM level: first-visit prompt, NO persists, YES opens the config dialog, menu button reopens, Done closes.
// Run: node test/rig-setup-ui-test.js   (serves docs/ itself; run ./build.sh first; needs chromium, no WebGL needed)
const assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '../docs'), types = { html: 'text/html', js: 'text/javascript', css: 'text/css' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader('content-type', types[f.split('.').pop()] || 'application/octet-stream'); r.end(b); } }); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(8772, '127.0.0.1', r));
  const prof = fs.mkdtempSync(require('os').tmpdir() + '/apex-rs-');
  const cr = spawn('systemd-run', ['--user', '--scope', '--quiet', '--slice=background.slice', '-p', 'MemoryMax=3G', '-p', 'MemoryHigh=2500M', 'timeout', '150', 'chromium', '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing', '--window-size=1440,810', '--remote-debugging-port=9232', '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  try {
    let tab; for (let i = 0; i < 60 && !tab; i++) { await sleep(500); try { tab = (await (await fetch('http://127.0.0.1:9232/json')).json()).find(t => t.type === 'page'); } catch (e) { /* not up yet */ } }
    assert(tab, 'chromium did not start');
    const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
    let id = 0; const pend = {}; ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend[d.id]) pend[d.id](d); };
    const cdp = (method, params) => new Promise(r => { pend[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
    const shot = async (name, w, h) => { const dir = process.env.SHOT_DIR; if (!dir) return; await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(600); fs.writeFileSync(path.join(dir, name), Buffer.from((await cdp('Page.captureScreenshot', {})).result.data, 'base64')); await cdp('Emulation.clearDeviceMetricsOverride'); };
    const ev = async (expr) => { const d = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (d.result.exceptionDetails) throw new Error(JSON.stringify(d.result.exceptionDetails)); return d.result.result.value; };
    const mouse = (type, x, y, o) => cdp('Input.dispatchMouseEvent', Object.assign({ type, x, y, button: 'left', clickCount: 1 }, o));
    const rect = (sel) => ev(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    const load = async () => { await cdp('Page.navigate', { url: 'http://127.0.0.1:8772/index.html' }); await sleep(500); for (let i = 0; i < 60 && !(await ev(`!!document.querySelector('#dispOpts button') && document.readyState === 'complete'`)); i++) await sleep(500); await sleep(300); };
    const open = (id) => ev(`document.getElementById('${id}').open`);
    await load(); await ev(`localStorage.clear()`); await cdp('Page.reload'); await load();
    assert.strictEqual(await open('rigAsk'), true, 'prompt shown on a fresh profile');
    assert((await ev(`document.getElementById('rigAsk').textContent`)).includes('Moza R3'), 'disclaimer in prompt');
    await ev(`document.getElementById('rigAskNo').click()`);
    assert.strictEqual(await open('rigAsk'), false, 'NO closes it');
    await load(); assert.strictEqual(await open('rigAsk'), false, 'stays hidden after reload');
    // fresh profile again: Esc == NO, then YES path
    await ev(`localStorage.clear()`); await load();
    assert.strictEqual(await open('rigAsk'), true, 'prompt again after clearing storage');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    assert.strictEqual(await open('rigAsk'), false, 'Esc closes the prompt');
    await ev(`localStorage.clear()`); await load();
    await shot('rig-prompt.png', 1440, 810);
    await ev(`document.getElementById('rigAskYes').click()`);
    assert.strictEqual(await open('rigAsk'), false, 'prompt closed after YES');
    assert.strictEqual(await open('rigDlg'), true, 'YES opens the config dialog');
    const vis = (sel) => ev(`(() => { const e = document.querySelector('${sel}'); return !!e && e.getBoundingClientRect().height > 0; })()`);
    const heads = await ev(`[...document.querySelectorAll('#rigDlg .rig-card h3')].map(h => h.textContent)`);
    assert.deepStrictEqual(heads, ['WHEEL & PEDALS', 'FORCE FEEDBACK'], 'both sections: ' + heads);
    assert(await vis('#rigDlg .rig-warn'), 'disclaimer visible in dialog');
    assert((await ev(`document.querySelector('#rigDlg .rig-warn').textContent`)).includes('Moza R3'), 'disclaimer text');
    assert.strictEqual(await ev(`[...document.querySelectorAll('#rigDlg button')].some(b => b.textContent === 'Start input walkthrough')`), true, 'walkthrough button');
    await shot('rig-config.png', 1440, 810); await shot('rig-config-390.png', 390, 780);
    await ev(`[...document.querySelectorAll('#rigDlg button')].find(b => b.textContent === 'Done').click()`);
    assert.strictEqual(await open('rigDlg'), false, 'Done closes');
    await ev(`document.getElementById('rigMenuBtn').click()`);
    assert.strictEqual(await open('rigDlg'), true, 'menu button reopens');
    assert.strictEqual(await ev(`document.getElementById('rigState').textContent`), 'NOT SET UP', 'status');
    await ev(`document.getElementById('rigClose').click()`);
    assert.strictEqual(await open('rigDlg'), false, 'X closes');
    console.log('OK');
  } finally { spawn('pkill', ['-f', 'remote-debugging-port=9232']); cr.kill(); srv.close(); setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 1500); }
})().catch(e => { console.error(e); process.exit(1); });
