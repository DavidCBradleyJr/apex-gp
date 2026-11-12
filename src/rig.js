/* Wheel calibration and optional localhost SDL2 transport. No controller layouts are guessed. */
(function (root) {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const axis = (binding, devices) => {
  if (!binding) return null;
  const d = devices.find(d => d.key === binding.device), v = d && d.axes[binding.axis];
  return Number.isFinite(v) ? v : null;
};
function valid(binding, steering = false) {
  if (!binding || typeof binding.device !== 'string' || !Number.isInteger(binding.axis) || binding.axis < 0) return false;
  const points = steering ? [binding.left, binding.center, binding.right] : [binding.rest, binding.full];
  if (!points.every(v => Number.isFinite(v) && Math.abs(v) <= 1.01)) return false;
  return steering ? (binding.center - binding.left) * (binding.right - binding.center) > 0 && Math.min(Math.abs(binding.center - binding.left), Math.abs(binding.right - binding.center)) > 0.05 : Math.abs(binding.full - binding.rest) > 0.1;
}
function normalize(binding, value, steering = false) {
  if (value === null || !valid(binding, steering)) return 0;
  if (!steering) return clamp((value - binding.rest) / (binding.full - binding.rest), 0, 1);
  const right = (value - binding.center) * (binding.right - binding.center) >= 0;
  const v = (value - binding.center) / (right ? binding.right - binding.center : binding.center - binding.left);
  return Math.abs(v) < 0.005 ? 0 : clamp(v, -1, 1);
}
function mappedInput(profile, devices) {
  if (!profile || !valid(profile.steer, true) || !valid(profile.throttle) || !valid(profile.brake)) return null;
  const raw = ['steer', 'throttle', 'brake'].map(k => axis(profile[k], devices));
  if (raw.some(v => v === null)) return null;
  return { wheel: true, analog: true, steer: normalize(profile.steer, raw[0], true), throttle: normalize(profile.throttle, raw[1]), brake: normalize(profile.brake, raw[2]) };
}

class RigControls {
  constructor() {
    this.devices = []; this.profile = {}; this.enabled = true; this.ffb = false; this.strength = 0.25; this.invert = false;
    this.bridge = false; this.updated = 0; this.feedbackAt = 0; this.prev = {}; this.force = 0; this.active = false; this.error = '';
    this.suspended = false;
    try { const saved = JSON.parse(localStorage.getItem('apexgp.rig.v1')); if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.profile = saved; } catch (_) { /* first calibration */ }
    this.block = () => { this.suspended = true; this.stop(); };
    this.focus = () => { if (!document.hidden) this.suspended = false; };
    this.visibility = () => { if (document.hidden) this.block(); else this.focus(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.block); window.addEventListener('focus', this.focus);
      document.addEventListener('visibilitychange', this.visibility); window.addEventListener('pagehide', this.block);
      // Local play uses one origin for the game and hardware; hosted play uses the Gamepad API.
      if (['localhost', '127.0.0.1'].includes(location.hostname)) this.poll();
    }
  }
  browserDevices() {
    try {
      return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean).map(d => ({
        key: 'browser:' + d.id + ':' + d.index, id: d.index, name: d.id, ffb: false,
        axes: Array.from(d.axes), buttons: d.buttons.map(b => b.value),
      }));
    } catch (_) { return []; }
  }
  allDevices() { return this.bridge ? this.devices : this.browserDevices(); }
  async poll() {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 1000);
    try {
      const response = await fetch('/api/rig', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: this.target, force: this.force, active: this.active && !this.suspended && performance.now() - this.feedbackAt < 100 }), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Bridge: ' + response.status);
      if (!Array.isArray(data.devices)) throw new Error('Wheel bridge not running');
      this.devices = data.devices; this.error = data.error || ''; this.updated = performance.now(); this.bridge = true;
    } catch (e) {
      this.devices = []; this.bridge = false; this.ffb = false; this.active = false;
      this.error = e.message + '. For steering FFB, run tools/rig-bridge.py and open its local game URL.';
    } finally {
      clearTimeout(timeout);
      setTimeout(() => this.poll(), this.bridge ? 16 : 2000);
    }
  }
  read(edges) {
    if (!this.enabled || this.suspended) return null;
    if (this.bridge && performance.now() - this.updated > 150) { this.stop(); return null; }
    const devices = this.allDevices(), input = mappedInput(this.profile, devices);
    if (!input) { this.prev = {}; this.stop(); return null; }
    for (const [name, action] of [['up', 'up'], ['down', 'down'], ['drs', 'drs'], ['overtake', 'ot'], ['pause', 'pause']]) {
      const b = this.profile[name], d = b && devices.find(d => d.key === b.device);
      const pressed = !!(d && d.buttons[b.button] > 0.5);
      if (pressed && !this.prev[name]) edges.push(action);
      this.prev[name] = pressed;
    }
    return input;
  }
  feedback(sim, active) {
    this.feedbackAt = performance.now();
    const d = this.allDevices().find(d => this.profile.steer && d.key === this.profile.steer.device);
    this.active = !!(active && this.enabled && this.ffb && this.bridge && d && d.ffb && !this.suspended);
    this.target = d ? d.id : null;
    // Aligning torque comes from the front tyres; grip loss lightens the wheel. Never substitute rumble.
    const force = Number.isFinite(sim.aligningTorque) ? sim.aligningTorque / 1000 : 0;
    this.force = this.active ? clamp(force, -1, 1) * this.strength * (this.invert ? -1 : 1) : 0;
  }
  stop() { this.force = 0; this.active = false; this.ffb = false; }
  save() {
    try { localStorage.setItem('apexgp.rig.v1', JSON.stringify(this.profile)); return true; }
    catch (_) { this.error = 'Calibration works this session, but browser storage is unavailable.'; return false; }
  }
  mount(container) {
    const make = (tag, text, parent = container) => { const el = document.createElement(tag); if (text) el.textContent = text; parent.append(el); return el; };
    const status = make('div'); status.className = 'note'; status.setAttribute('role', 'status');
    const enabled = make('button', 'Wheel input: ON'); enabled.type = 'button'; enabled.className = 'opt';
    enabled.onclick = () => { this.enabled = !this.enabled; this.stop(); enabled.textContent = 'Wheel input: ' + (this.enabled ? 'ON' : 'OFF'); };
    make('p', 'Select each axis, then capture its positions. Separate USB pedals are supported. Set wheelbase rotation to 360° for this car.');
    const fields = [], rows = [];
    for (const [key, label, points] of [['steer', 'Steering', ['left', 'center', 'right']], ['throttle', 'Throttle', ['rest', 'full']], ['brake', 'Brake', ['rest', 'full']]]) {
      const row = make('div'), labelEl = make('label', label, row), select = make('select', '', labelEl);
      const live = make('output', '', row), buttons = make('div', '', row); buttons.className = 'rig-captures';
      select.onchange = () => { this.stop(); this.profile[key] = select.value ? JSON.parse(select.value) : null; this.save(); };
      for (const point of points) {
        const b = make('button', 'Set ' + point, buttons); b.type = 'button'; b.className = 'opt';
        b.onclick = () => {
          this.stop(); const binding = this.profile[key], value = axis(binding, this.allDevices());
          if (value === null) { live.textContent = 'Choose a connected axis first.'; return; }
          binding[point] = value; this.save(); refresh();
        };
      }
      fields.push({ select, key, type: 'axis' }); rows.push({ key, live, points });
    }
    for (const [key, label] of [['up', 'Shift up'], ['down', 'Shift down'], ['drs', 'DRS'], ['overtake', 'Overtake'], ['pause', 'Pause']]) {
      const labelEl = make('label', label), select = make('select', '', labelEl);
      select.onchange = () => { this.stop(); this.profile[key] = select.value ? JSON.parse(select.value) : null; this.save(); };
      fields.push({ select, key, type: 'button' });
    }
    const ffb = make('button', 'Steering FFB: OFF'); ffb.type = 'button'; ffb.className = 'opt';
    ffb.onclick = () => { this.ffb = !this.ffb; ffb.textContent = 'Steering FFB: ' + (this.ffb ? 'ON' : 'OFF'); };
    const strengthLabel = make('label', 'FFB strength (bridge caps base output at 20%)'), strength = make('input', '', strengthLabel);
    strength.type = 'range'; strength.min = '0'; strength.max = '100'; strength.value = '25';
    const strengthValue = make('output', '25%', strengthLabel);
    strength.oninput = () => { this.strength = +strength.value / 100; strengthValue.textContent = strength.value + '%'; };
    const invertLabel = make('label', 'Reverse FFB direction'), invert = make('input', '', invertLabel); invert.type = 'checkbox';
    invert.onchange = () => { this.invert = invert.checked; this.stop(); };
    make('p', 'FFB starts off each session. Begin at low strength: the wheel should resist a turn. If it pulls into the turn, disable FFB and reverse its direction. Pause or loss of focus disarms it.');
    const reset = make('button', 'Clear wheel calibration'); reset.type = 'button'; reset.className = 'opt';
    reset.onclick = () => { this.stop(); this.profile = {}; this.save(); signature = ''; refresh(); };
    let signature = '', lastStatus = '';
    const refresh = () => {
      const devices = this.allDevices(), sig = JSON.stringify(devices.map(d => [d.key, d.axes.length, d.buttons.length]));
      if (sig !== signature) {
        signature = sig;
        for (const { select, key, type } of fields) {
          select.replaceChildren(); select.append(new Option(type === 'axis' ? 'Choose axis…' : 'Unbound', ''));
          for (const d of devices) for (let i = 0; i < (type === 'axis' ? d.axes : d.buttons).length; i++) {
            const value = { device: d.key }; value[type] = i;
            select.append(new Option(d.name + ' · ' + type + ' ' + i, JSON.stringify(value)));
          }
          const b = this.profile[key];
          select.value = b ? JSON.stringify(type === 'axis' ? { device: b.device, axis: b.axis } : { device: b.device, button: b.button }) : '';
        }
      }
      const input = mappedInput(this.profile, devices), wheel = devices.find(d => this.profile.steer && d.key === this.profile.steer.device);
      const names = devices.map(d => d.name).join(', ');
      const nextStatus = (devices.length ? 'Detected: ' + names : 'No wheel detected. Connect it and move a control.') +
        (input ? ' · Calibration ready.' : ' · Calibration required.') + (this.bridge ? ' · Local bridge connected.' : ' · Browser input only; steering FFB needs the local bridge.') + (this.error ? ' ' + this.error : '');
      if (nextStatus !== lastStatus) { status.textContent = nextStatus; lastStatus = nextStatus; }
      ffb.disabled = !(this.bridge && wheel && wheel.ffb && input);
      ffb.textContent = 'Steering FFB: ' + (this.ffb ? 'ON' : 'OFF') + (wheel && !wheel.ffb ? ' (driver unavailable)' : '');
      for (const { key, live, points } of rows) {
        const b = this.profile[key], v = axis(b, devices);
        live.textContent = (v === null ? 'Disconnected / unbound' : 'Raw ' + v.toFixed(3)) + ' · ' + points.map(p => p + ': ' + (b && Number.isFinite(b[p]) ? b[p].toFixed(2) : '—')).join(' / ') +
          (valid(b, key === 'steer') ? ' · Ready' : ' · Capture all positions');
      }
    };
    refresh(); setInterval(refresh, 100);
  }
}
const api = { RigControls, normalize, valid, mappedInput };
if (typeof module !== 'undefined') module.exports = api;
else root.ApexRig = api;
})(typeof window === 'undefined' ? globalThis : window);
