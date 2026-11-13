// RaceLab-style input overlay: a 5 s throttle/brake trace, pedal bars, a steering glyph and gear/speed, drawn on a 2D canvas.
(function (root) {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Fixed-size ring: push() overwrites the oldest sample, read() returns oldest to newest. abs is stored as 0/1.
function createTrace(n) {
  const thr = new Float32Array(n), brk = new Float32Array(n), abs = new Uint8Array(n);
  let head = 0, len = 0;
  return {
    n,
    get len() { return len; },
    push(t, b, a) { thr[head] = t; brk[head] = b; abs[head] = a ? 1 : 0; head = (head + 1) % n; if (len < n) len++; },
    read() { const o = []; for (let i = 0; i < len; i++) { const k = (head - len + i + n) % n; o.push({ thr: thr[k], brk: brk[k], abs: !!abs[k] }); } return o; },
  };
}
// Calibrated wheels map steer +-1 to +-180 degrees of rotation; the glyph and number use the same scale.
const wheelDeg = (steer) => clamp(steer || 0, -1, 1) * 180;

function drawInputs(ctx, w, h, trace, s, units) {
  const dpr = (root.devicePixelRatio) || 1, F = "'Barlow Condensed', sans-serif";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(11,13,16,0.62)'; ctx.fillRect(0, 0, w, h);
  const pad = 8, gx = pad, gy = pad, gw = w * 0.42, gh = h - pad * 2; // trace area
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(gx, gy, gw, gh);
  const pts = trace.read(), step = gw / (trace.n - 1), x0 = gx + gw - (pts.length - 1) * step; // newest sits at the right edge
  const line = (key, color, absOnly) => {
    ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.beginPath(); let pen = false;
    pts.forEach((p, i) => {
      if (absOnly && !p.abs) { pen = false; return; }
      const x = x0 + i * step, y = gy + gh - clamp(p[key], 0, 1) * gh;
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    });
    ctx.stroke();
  };
  line('thr', '#2bd96b'); line('brk', '#ff3b30'); line('brk', '#f5c400', true); // amber overpaints the brake trace while ABS works
  // pedal bars
  const bw = 16, bx = gx + gw + 14;
  [['thr', s.thr, '#2bd96b', bx], ['brk', s.brk, s.absActive ? '#f5c400' : '#ff3b30', bx + bw + 12]].forEach(([, v, c, x]) => {
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x, gy, bw, gh);
    ctx.fillStyle = c; const f = clamp(v, 0, 1) * gh; ctx.fillRect(x, gy + gh - f, bw, f);
    ctx.fillStyle = '#f3f4f6'; ctx.font = '600 12px ' + F; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.round(clamp(v, 0, 1) * 100), x + bw / 2, gy + gh - 2);
  });
  // steering glyph + text, in the right-hand column
  const cx = bx + (bw + 12) * 2 + (w - (bx + (bw + 12) * 2)) / 2, r = 24, cy = gy + r + 6, deg = wheelDeg(s.steer);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180);
  ctx.strokeStyle = '#f3f4f6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, 0); ctx.lineTo(0, r); ctx.stroke(); // T-shaped spokes
  ctx.fillStyle = '#ff6a1a'; ctx.fillRect(-2, -r - 3, 4, 8); // top marker
  ctx.restore();
  ctx.fillStyle = '#f3f4f6'; ctx.textAlign = 'center'; ctx.font = '600 14px ' + F;
  ctx.fillText(Math.round(deg) + '°', cx, cy + r + 18);
  const mph = units === 'mph', v = Math.round((s.speed || 0) * (mph ? 2.23694 : 3.6));
  ctx.font = '700 26px ' + F; ctx.fillText((s.gear === -1 ? 'R' : s.gear === 0 ? 'N' : s.gear) + '  ' + v, cx, h - pad - 2);
}
const api = { createTrace, wheelDeg, drawInputs };
if (typeof module !== 'undefined') module.exports = api;
else root.ApexOverlay = api;
})(typeof window === 'undefined' ? globalThis : window);
