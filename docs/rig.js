/* Wheel calibration and optional localhost SDL2 transport. No controller layouts are guessed. */
(function (root) {
'use strict';
const { MozaHidFfb, MAX_FORCE, forceLevels } = typeof module !== 'undefined' ? require('./webhid-ffb.js') : root.ApexHID;
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
function feedbackSignal(sim, roadFeel = 0.6, gain = 1) {
  const aligning = Number.isFinite(sim.aligningTorque) ? Math.tanh(sim.aligningTorque / 700) : 0;
  const texture = Number.isFinite(sim.roadFeedback) ? sim.roadFeedback * clamp(Math.abs(sim.speed || 0) / 3, 0, 1) : 0;
  return aligning * gain + texture * roadFeel;
}
function feedbackForce(sim, roadFeel = 0.6, gain = 1) { return clamp(feedbackSignal(sim, roadFeel, gain), -1, 1); }
function mappedInput(profile, devices) {
  if (!profile || !valid(profile.steer, true) || !valid(profile.throttle) || !valid(profile.brake)) return null;
  const raw = ['steer', 'throttle', 'brake'].map(k => axis(profile[k], devices));
  if (raw.some(v => v === null)) return null;
  return { wheel: true, analog: true, steer: normalize(profile.steer, raw[0], true), throttle: normalize(profile.throttle, raw[1]), brake: normalize(profile.brake, raw[2]) };
}

const WIZARD_STEPS = [
  ['steer', 'prepare', 'Center your wheel', 'Center the wheel and release both pedals. Keep other controls still, then start listening.'],
  ['steer', 'left', 'Turn fully left', 'Turn the wheel fully left and hold it. We will find its axis automatically.'],
  ['steer', 'right', 'Turn fully right', 'Turn the same wheel fully right and hold it to capture the other end of its range.'],
  ['steer', 'center', 'Return to center', 'Center the physical wheel, then confirm its neutral position.'],
  ['steer', 'test', 'Check steering direction', 'Turn left and right. The model should follow your wheel. Confirm only when both directions look right.'],
  ['throttle', 'rest', 'Release the throttle', 'Take your foot off the throttle and keep the wheel and other pedals still.'],
  ['throttle', 'press', 'Press the throttle', 'Press the throttle all the way and hold it. We will identify its axis and range.'],
  ['throttle', 'test', 'Check the throttle', 'Release and press the throttle again. Its bar should run from 0% to 100%. Check the brake separately in the next steps.'],
  ['brake', 'rest', 'Release the brake', 'Take your foot off the brake and release the other pedals.'],
  ['brake', 'press', 'Press the brake', 'Press to the maximum braking pressure or travel you want to use, and hold it.'],
  ['brake', 'test', 'Check the brake', 'Release and press the brake again. Its bar should run from 0% to 100%, while the throttle stays released.'],
  ['up', 'button', 'Assign shift up', 'Pull and hold the right paddle, or press the button you want for shifting up.'],
  ['down', 'button', 'Assign shift down', 'Pull and hold the left paddle, or press the button you want for shifting down.'],
  ['drs', 'button', 'Assign DRS', 'Press and hold the button you want to toggle DRS.'],
  ['overtake', 'button', 'Assign overtake', 'Press and hold the button you want to toggle ERS overtake.'],
  ['pause', 'button', 'Assign pause', 'Press and hold the button you want to pause the game.'],
  ['review', 'review', 'Test your rig', 'Try every control. Check the wheel direction, both pedal bars and the button indicators, then save.'],
];

class RigWizard {
  constructor() { this.draft = {}; this.index = 0; this.candidate = null; this.baseline = []; this.peaks = new Map(); this.problem = ''; }
  get step() { return WIZARD_STEPS[this.index]; }
  go(index, devices) {
    this.index = index; this.candidate = null; this.problem = ''; this.peaks.clear();
    this.baseline = devices.map(d => ({ ...d, axes: d.axes.slice(), buttons: d.buttons.slice() }));
  }
  observe(devices) {
    const [key, phase] = this.step;
    if (phase === 'left' || phase === 'press') {
      for (const d of devices) {
        const before = this.baseline.find(b => b.key === d.key); if (!before) continue;
        d.axes.forEach((value, i) => {
          if (!Number.isFinite(value) || !Number.isFinite(before.axes[i])) return;
          if (phase === 'press' && this.draft.steer?.device === d.key && this.draft.steer.axis === i) return;
          const id = JSON.stringify([d.key, i]), delta = Math.abs(value - before.axes[i]);
          if (delta > (this.peaks.get(id)?.delta || 0)) this.peaks.set(id, { device: d.key, axis: i, value, rest: before.axes[i], delta });
        });
      }
      const moved = [...this.peaks.values()].filter(p => p.delta > 0.15).sort((a, b) => b.delta - a.delta);
      this.problem = moved[1] && moved[0].delta < moved[1].delta * 1.35 ? 'More than one axis moved. Release the controls and choose Try again.' : '';
      const p = this.problem ? null : moved[0];
      this.candidate = !p ? null : phase === 'left' ? { device: p.device, axis: p.axis, left: p.value, center: p.rest } : { device: p.device, axis: p.axis, rest: p.rest, full: p.value };
      if (key === 'brake' && this.candidate && this.draft.throttle.device === p.device && this.draft.throttle.axis === p.axis && (p.value - p.rest) * (this.draft.throttle.full - this.draft.throttle.rest) > 0) {
        this.problem = 'That axis is already your throttle. Release it and choose Try again.'; this.candidate = null;
      }
    } else if (phase === 'right') {
      const b = this.draft.steer, v = axis(b, devices);
      if (v !== null && (v - b.center) * (b.left - b.center) < 0 && Math.abs(v - b.center) > Math.abs((this.candidate?.right ?? b.center) - b.center)) this.candidate = { ...b, right: v };
    } else if (phase === 'button') {
      const moved = [];
      for (const d of devices) {
        const before = this.baseline.find(b => b.key === d.key); if (!before) continue;
        d.buttons.forEach((value, i) => { if (value > 0.5 && before.buttons[i] <= 0.5) moved.push({ device: d.key, button: i }); before.buttons[i] = value; });
      }
      if (moved.length > 1) { this.candidate = null; this.problem = 'Several buttons were pressed. Release them and choose Try again.'; }
      else if (moved.length === 1) {
        const b = moved[0];
        const duplicate = ['up', 'down', 'drs', 'overtake', 'pause'].some(k => k !== key && this.draft[k]?.device === b.device && this.draft[k].button === b.button);
        this.problem = duplicate ? 'That button already has an assignment. Choose another button.' : '';
        this.candidate = duplicate ? null : b;
      }
    }
  }
  ready(devices) {
    const [key, phase] = this.step, b = this.draft[key];
    if (phase === 'prepare' || phase === 'rest') return devices.some(d => d.axes.some(Number.isFinite));
    if (phase === 'left') return this.candidate && axis(this.candidate, devices) !== null && Math.abs(this.candidate.left - this.candidate.center) > 0.15;
    if (phase === 'press' || phase === 'right') return valid(this.candidate, key === 'steer') && axis(this.candidate, devices) !== null;
    if (phase === 'center') { const v = axis(b, devices); return v !== null && Math.abs(v - b.center) < Math.abs(b.right - b.left) * 0.1 && valid({ ...b, center: v }, true); }
    if (phase === 'test') return valid(b, key === 'steer') && axis(b, devices) !== null;
    if (phase === 'button') return this.candidate && devices.some(d => d.key === this.candidate.device && Number.isFinite(d.buttons[this.candidate.button]));
    return !!mappedInput(this.draft, devices);
  }
  confirm(devices) {
    this.observe(devices);
    if (!this.ready(devices)) return false;
    const [key, phase] = this.step;
    if (['left', 'right', 'press', 'button'].includes(phase)) this.draft[key] = { ...this.candidate };
    if (phase === 'center') this.draft.steer.center = axis(this.draft.steer, devices);
    if (phase === 'review') return true;
    this.go(this.index + 1, devices); return true;
  }
  retry(devices) {
    const [key] = this.step;
    const index = key === 'review' ? 0 : WIZARD_STEPS.findIndex(s => s[0] === key);
    if (key === 'review') this.draft = {};
    this.go(index, devices);
  }
  skip(devices) { if (this.step[1] === 'button') { delete this.draft[this.step[0]]; this.go(this.index + 1, devices); } }
  preview() {
    const profile = { ...this.draft }, [key, phase] = this.step;
    if (this.candidate) profile[key] = { ...this.candidate };
    if (phase === 'left' && profile.steer) profile.steer.right = clamp(2 * profile.steer.center - profile.steer.left, -1, 1);
    return profile;
  }
}

class RigControls {
  constructor() {
    this.devices = []; this.profile = {}; this.enabled = true; this.ffb = false; this.strength = 0.6; this.roadFeel = 0.6; this.invert = false;
    this.outputLimit=MAX_FORCE; this.gain=1; this.damping=0; this.friction=0; this.smoothing=1000/(2*Math.PI*12); this.clipped=false; this.bridgeAdvanced=false;
    this.bridge = false; this.updated = 0; this.feedbackAt = 0; this.prev = {}; this.force = 0; this.active = false; this.error = '';
    this.suspended = false;
    this.hid = new MozaHidFfb(error => { this.error = error; this.stop(); });
    this.settingsStatus='Rig settings save automatically in this browser.';
    try {
      const saved=JSON.parse(localStorage.getItem('apexgp.rig.v1'));
      if (saved && typeof saved==='object' && !Array.isArray(saved)) { this.profile=saved; this.settingsStatus='Saved rig settings restored.'; }
    } catch (_) { this.settingsStatus='Saved rig settings could not be read. Changes may work only for this session.'; }
    if (typeof this.profile.enabled==='boolean') this.enabled=this.profile.enabled;
    const tuning = this.profile.feedback || {};
    if (Number.isFinite(tuning.strength)) this.strength = clamp(tuning.strength, 0, 1);
    if (Number.isFinite(tuning.roadFeel)) this.roadFeel = clamp(tuning.roadFeel, 0, 1);
    for (const [key,max] of [['outputLimit',1],['gain',3],['damping',1],['friction',1],['smoothing',50]]) {
      if (Number.isFinite(tuning[key])) this[key]=clamp(tuning[key],0,max);
    }
    this.invert = tuning.invert === true;
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
        body: JSON.stringify({ device: this.target, force: this.bridge ? this.force : 0, ...this.feedbackSettings(), active: this.bridge && this.active && !this.suspended && performance.now() - this.feedbackAt < 100 }), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Bridge: ' + response.status);
      if (!Array.isArray(data.devices)) throw new Error('Wheel bridge not running');
      if (!this.bridge && this.hid.ready) { this.stop(); await this.hid.disconnect(); }
      this.devices = data.devices; this.error = data.error || ''; this.updated = performance.now(); this.bridge = true; this.bridgeAdvanced=data.feedbackVersion===2;
    } catch (e) {
      if (this.bridge) this.stop();
      this.devices = []; this.bridge = false;
      if (!this.hid.ready) this.error = 'Local bridge unavailable. Connect browser FFB for a Moza R3, or start the local bridge.';
    } finally {
      clearTimeout(timeout);
      setTimeout(() => this.poll(), this.bridge ? 16 : 2000);
    }
  }
  read(edges) {
    if (this.wizard) { this.wizard.observe(this.allDevices()); return null; }
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
  ffbAvailable(wheel, devices = this.allDevices()) { return this.bridge ? !!wheel?.ffb : this.hid.matches(wheel, devices); }
  conditionAvailable(name) {
    const devices=this.allDevices(), wheel=devices.find(d=>this.profile.steer && d.key===this.profile.steer.device);
    return this.bridge ? !!(this.bridgeAdvanced && wheel?.ffb && wheel[name]) : this.hid.matches(wheel,devices) && this.hid.conditions;
  }
  feedbackSettings() {
    return {outputLimit:this.bridge&&!this.bridgeAdvanced?Math.min(MAX_FORCE,this.outputLimit):this.outputLimit,
      damping:this.conditionAvailable('damping')?this.damping*this.strength:0, friction:this.conditionAvailable('friction')?this.friction*this.strength:0};
  }
  feedback(sim, active) {
    this.feedbackAt = performance.now();
    this.surface = sim.surf ? [...new Set(sim.surf.slice(0, 2))].join(' / ') : '';
    const d = this.allDevices().find(d => this.profile.steer && d.key === this.profile.steer.device);
    this.active = !!(active && !this.wizard && this.enabled && this.ffb && this.ffbAvailable(d) && !this.suspended);
    this.target = d ? d.id : null;
    sim.roadSmoothing=this.smoothing;
    // Aligning torque comes from the front tyres; grip loss lightens the wheel. Never substitute rumble.
    const signal = feedbackSignal(sim, this.roadFeel, this.gain);
    this.clipped=this.active && Math.abs(signal)>=1;
    this.force = this.active ? clamp(signal, -1, 1) * this.strength * (this.invert ? -1 : 1) : 0;
    if (!this.bridge) { if (this.active) this.hid.write(this.force,this.feedbackSettings()); else this.hid.stop(); }
  }
  stop() { this.force = 0; this.clipped=false; this.active = false; this.ffb = false; this.hid.stop(); }
  save() {
    this.profile.enabled=this.enabled;
    this.profile.feedback=Object.fromEntries(['strength','roadFeel','invert','outputLimit','gain','damping','friction','smoothing'].map(key=>[key,this[key]]));
    try {
      localStorage.setItem('apexgp.rig.v1',JSON.stringify(this.profile));
      this.settingsStatus='Rig settings saved in this browser.'; return true;
    } catch (_) { this.settingsStatus='Could not save rig settings. Browser storage may be blocked or full; settings work only for this session.'; return false; }
  }
  mount(container) {
    const make = (tag, text, parent = container) => { const el = document.createElement(tag); if (text) el.textContent = text; parent.append(el); return el; };
    const status = make('div'); status.className = 'note'; status.setAttribute('role', 'status');
    const enabled = make('button', 'Wheel input: '+(this.enabled?'ON':'OFF')); enabled.type = 'button'; enabled.className = 'opt';
    enabled.onclick = () => { this.enabled = !this.enabled; this.stop(); this.save(); enabled.textContent = 'Wheel input: ' + (this.enabled ? 'ON' : 'OFF'); };
    const saveRig=make('button','Save rig settings'); saveRig.type='button'; saveRig.className='opt'; saveRig.onclick=()=>{this.save();refresh();};
    const settingsStatus=make('p',this.settingsStatus); settingsStatus.setAttribute('role','status');
    make('p','Calibration and tuning are kept across browser restarts on this site in this browser profile. Private browsing, clearing site data or a different site address can lose or separate saved settings. Connect FFB and enable it each session.');
    const preview = (parent) => {
      const panel = make('div', '', parent); panel.className = 'rig-preview'; panel.setAttribute('aria-label', 'Live rig inputs');
      const wheelBox = make('div', '', panel); wheelBox.className = 'rig-wheel-box';
      make('div', 'STEERING', wheelBox).className = 'label';
      const wheel = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      wheel.setAttribute('viewBox', '0 0 180 180'); wheel.setAttribute('aria-hidden', 'true'); wheel.classList.add('rig-wheel'); wheelBox.append(wheel);
      for (const [tag, attrs] of [
        ['circle', { cx: 90, cy: 90, r: 72, fill: '#121820', stroke: '#637080', 'stroke-width': 17 }],
        ['path', { d: 'M24 88 L72 98 L90 151 L108 98 L156 88 M90 90 V24', fill: 'none', stroke: '#adb8c4', 'stroke-width': 12, 'stroke-linejoin': 'round' }],
        ['circle', { cx: 90, cy: 90, r: 24, fill: '#232b35', stroke: '#637080', 'stroke-width': 3 }],
        ['path', { d: 'M90 11 V28', stroke: '#ff6a1a', 'stroke-width': 8 }],
      ]) { const el = document.createElementNS(wheel.namespaceURI, tag); for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value); wheel.append(el); }
      const angleLabel = make('output', 'Unassigned', wheelBox); angleLabel.setAttribute('aria-label', 'Steering position');
      const pedals = [];
      for (const [key, label] of [['throttle', 'Throttle'], ['brake', 'Brake']]) {
        const box = make('div', '', panel); box.className = 'rig-pedal-box ' + key;
        make('div', label.toUpperCase(), box).className = 'label';
        const model = make('div', '', box); model.className = 'rig-pedal-model'; model.setAttribute('aria-hidden', 'true');
        const arm = make('div', '', model); arm.className = 'rig-pedal-arm';
        make('div', '', arm).className = 'rig-pedal-face';
        const bar = make('progress', '', box); bar.max = 100; bar.value = 0; bar.setAttribute('aria-label', label + ' input');
        const value = make('output', 'Unassigned', box); value.setAttribute('aria-label', label + ' percentage');
        pedals.push({ key, arm, bar, value });
      }
      const buttons = make('div', '', parent); buttons.className = 'rig-button-preview';
      const chips = ['up', 'down', 'drs', 'overtake', 'pause'].map((key, i) => {
        const el = make('span', ['Shift up', 'Shift down', 'DRS', 'Overtake', 'Pause'][i], buttons); return { key, el };
      });
      return (profile, devices) => {
        const raw = axis(profile.steer, devices), calibrated = valid(profile.steer, true) && raw !== null;
        const steer = calibrated ? normalize(profile.steer, raw, true) : 0;
        wheel.style.transform = 'rotate(' + steer * 180 + 'deg)';
        angleLabel.textContent = calibrated ? Math.round(Math.abs(steer) * 180) + '° ' + (steer < -0.005 ? 'left' : steer > 0.005 ? 'right' : 'centered') : 'Unassigned';
        for (const p of pedals) {
          const raw = axis(profile[p.key], devices), ready = valid(profile[p.key]) && raw !== null;
          const value = ready ? normalize(profile[p.key], raw) : 0, percent = Math.round(value * 100);
          p.bar.value = percent; p.value.textContent = ready ? percent + '%' : 'Unassigned';
          p.arm.style.transform = 'rotateX(' + (15 + value * 35) + 'deg)';
        }
        for (const { key, el } of chips) {
          const b = profile[key], d = b && devices.find(d => d.key === b.device), pressed = !!(d && d.buttons[b.button] > 0.5);
          el.classList.toggle('pressed', pressed); el.classList.toggle('unassigned', !b);
          el.setAttribute('aria-label', el.textContent + (b ? pressed ? ': pressed' : ': released' : ': unassigned'));
        }
      };
    };
    const monitor = preview(container);
    make('p', 'Pedal percentages show the reported signal: pressure on load-cell pedals, travel on position sensors.');
    const startWizard = make('button', 'Start input walkthrough'); startWizard.type = 'button'; startWizard.className = 'opt rig-primary';
    const savedNote = make('div'); savedNote.className = 'note'; savedNote.setAttribute('role', 'status');
    const dialog = make('dialog'); dialog.className = 'rig-wizard'; dialog.setAttribute('aria-labelledby', 'rigWizardTitle');
    const progress = make('div', '', dialog); progress.className = 'label';
    const title = make('h2', '', dialog); title.id = 'rigWizardTitle'; title.tabIndex = -1;
    const instructions = make('p', '', dialog);
    const wizardPreview = preview(dialog);
    const detected = make('div', '', dialog); detected.className = 'rig-detected'; detected.setAttribute('role', 'status');
    const hint = make('p', 'Only move the requested control. FFB and driving input stay off during setup. Existing bindings are kept until you save.', dialog); hint.className = 'note';
    const actions = make('div', '', dialog); actions.className = 'rig-wizard-actions';
    const next = make('button', '', actions); next.type = 'button'; next.className = 'opt rig-primary';
    const retry = make('button', 'Try again', actions); retry.type = 'button'; retry.className = 'opt';
    const skip = make('button', 'Skip this button', actions); skip.type = 'button'; skip.className = 'opt';
    const reverse = make('button', 'Reverse steering direction', actions); reverse.type = 'button'; reverse.className = 'opt';
    const cancel = make('button', 'Cancel setup', actions); cancel.type = 'button'; cancel.className = 'opt';
    const endWizard = () => { this.stop(); this.wizard = null; dialog.close(); startWizard.focus(); };
    cancel.onclick = endWizard;
    dialog.addEventListener('cancel', e => { e.preventDefault(); endWizard(); });
    for (const event of ['keydown', 'keyup']) dialog.addEventListener(event, e => e.stopPropagation());
    startWizard.onclick = () => { this.stop(); this.wizard = new RigWizard(); savedNote.textContent = ''; dialog.showModal(); refresh(); title.focus(); };
    next.onclick = () => {
      const wizard = this.wizard, finished = wizard.step[1] === 'review';
      if (!wizard.confirm(this.allDevices())) return;
      if (finished) {
        this.profile = { ...wizard.draft, feedback: this.profile.feedback }; const saved = this.save(); signature = ''; endWizard();
        savedNote.textContent = saved ? 'Rig setup saved. Your inputs are ready.' : this.settingsStatus;
      }
      refresh(); if (!finished) title.focus();
    };
    retry.onclick = () => { this.wizard.retry(this.allDevices()); refresh(); title.focus(); };
    skip.onclick = () => { this.wizard.skip(this.allDevices()); refresh(); title.focus(); };
    reverse.onclick = () => { const b = this.wizard.draft.steer; [b.left, b.right] = [b.right, b.left]; refresh(); };
    const manual = make('details'); manual.className = 'rig-advanced';
    make('summary', 'Advanced manual bindings', manual);
    const manualRows = make('div', '', manual); manualRows.className = 'rig-manual';
    make('p', 'Choose axes and capture endpoints manually if needed. Set wheelbase rotation to 360° for this car.', manualRows);

    const fields = [], rows = [];
    for (const [key, label, points] of [['steer', 'Steering', ['left', 'center', 'right']], ['throttle', 'Throttle', ['rest', 'full']], ['brake', 'Brake', ['rest', 'full']]]) {
      const row = make('div', '', manualRows), labelEl = make('label', label, row), select = make('select', '', labelEl);
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
      const labelEl = make('label', label, manualRows), select = make('select', '', labelEl);
      select.onchange = () => { this.stop(); this.profile[key] = select.value ? JSON.parse(select.value) : null; this.save(); };
      fields.push({ select, key, type: 'button' });
    }
    const connectHid = make('button', 'Connect browser FFB'); connectHid.type = 'button'; connectHid.className = 'opt';
    connectHid.onclick = async () => {
      this.stop();
      try { if (this.hid.ready) await this.hid.disconnect(); else await this.hid.connect(); this.error = ''; }
      catch (e) { this.error = e.name === 'NotFoundError' ? 'No wheel selected. You can connect it when ready.' : e.message + ' On Linux, check HID device access permissions.'; }
      refresh();
    };
    make('p', 'Direct browser FFB: Moza R3 on desktop Chrome/Edge. Choose the wheel in the browser prompt, then explicitly enable Steering FFB. Other wheelbases can use the local bridge.');
    const ffb = make('button', 'Steering FFB: OFF'); ffb.type = 'button'; ffb.className = 'opt';
    ffb.onclick = () => { if(this.ffb)this.stop(); else this.ffb=true; ffb.textContent = 'Steering FFB: ' + (this.ffb ? 'ON' : 'OFF'); };
    const saveFeedback = () => this.save();
    const slider=(key,label,max,scale,unit,help)=>{
      const box=make('div'), labelEl=make('label',label,box), input=make('input','',labelEl), value=make('output','',box);
      input.type='range'; input.min='0'; input.max=String(max); input.value=String(Math.round(this[key]*scale));
      const describe=()=>{value.textContent=Math.round(this[key]*scale)+unit;}; describe();
      input.oninput=()=>{this[key]=+input.value/scale; if(key==='outputLimit')this.stop(); describe(); saveFeedback();};
      const hint=make('p',help,box); hint.id='rig-'+key+'-help'; input.setAttribute('aria-describedby',hint.id);
      return input;
    };
    slider('outputLimit','Maximum FFB output',100,100,'% of base output','Starts at the previous 20% limit. Increasing this can make the wheel much stronger and disarms FFB. All effects share this limit.');
    const strengthLabel = make('label', 'FFB strength'), strength = make('input', '', strengthLabel);
    strength.type = 'range'; strength.min = '0'; strength.max = '100'; strength.value = String(Math.round(this.strength * 100));
    const strengthValue = make('output', strength.value + '%', strengthLabel);
    strength.oninput = () => { this.strength = +strength.value / 100; strengthValue.textContent = strength.value + '%'; saveFeedback(); };
    slider('gain','Steering gain',300,100,'%','Raises cornering load independently of road texture. Reduce it if the signal clips.');
    const roadLabel = make('label', 'Road texture'), road = make('input', '', roadLabel);
    road.type = 'range'; road.min = '0'; road.max = '100'; road.value = String(Math.round(this.roadFeel * 100));
    const roadValue = make('output', road.value + '%', roadLabel);
    road.oninput = () => { this.roadFeel = +road.value / 100; roadValue.textContent = road.value + '%'; saveFeedback(); };
    slider('smoothing','Road smoothing',50,1,' ms','0 is sharpest. Higher values soften road detail; start near 13 ms. Low values may buzz when frame rate drops.');
    const damping=slider('damping','Damping',100,100,'%','Resists fast wheel movement. Add small amounts to calm oscillation; too much hides detail.');
    const friction=slider('friction','Friction',100,100,'%','Adds resistance during wheel movement. Keep low to preserve small steering cues.');
    const conditionStatus=make('p'); conditionStatus.setAttribute('role','status');
    const forceMeterLabel = make('label', 'FFB output request'), forceMeter = make('progress', '', forceMeterLabel);
    forceMeter.max = 100; forceMeter.value = 0; forceMeter.setAttribute('aria-label', 'FFB output request');
    const forceValue = make('output', '0.0% of base output', forceMeterLabel);
    const clipping=make('p'); clipping.setAttribute('role','status');
    make('p','The meter shows steering torque requested, not measured torque. Damping and friction depend on wheel movement; their combined ceiling is shown separately.');
    make('p', 'Road texture follows the front tyres: subtle asphalt grain, rhythmic kerbs and rough loose surfaces. This is procedural surface feedback, not scanned pavement.');
    const invertLabel = make('label', 'Reverse FFB direction'), invert = make('input', '', invertLabel); invert.type = 'checkbox'; invert.checked = this.invert;
    invert.onchange = () => { this.invert = invert.checked; this.stop(); saveFeedback(); };
    make('p', 'Moza R3 normally uses Reverse FFB direction OFF. If you enabled it to compensate for the earlier direction bug, turn it OFF after updating and recheck at low strength.');
    make('p', 'FFB starts off each session. Begin at low strength: the wheel should resist a turn. If it pulls into the turn, disable FFB and reverse its direction. Pause or loss of focus disarms it.');
    const reset = make('button', 'Clear wheel calibration'); reset.type = 'button'; reset.className = 'opt';
    reset.onclick = () => { this.stop(); this.profile = { feedback: this.profile.feedback }; this.save(); signature = ''; refresh(); };
    let signature = '', lastStatus = '', wizardIndex = -1;
    const refresh = () => {
      if(settingsStatus.textContent!==this.settingsStatus)settingsStatus.textContent=this.settingsStatus;
      saveRig.disabled=!!this.wizard;
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
      monitor(this.profile, devices);
      const settings=this.feedbackSettings(), levels=forceLevels(this.force,settings);
      const requested = this.active?Math.abs(levels.constant)*100:0;
      forceMeter.value = requested;
      const ceiling=this.active?(Math.abs(levels.constant)+levels.damper+levels.friction)*100:0;
      forceValue.textContent = requested.toFixed(1) + '% of base output · all effects ≤ '+ceiling.toFixed(1)+'%' + (this.surface ? ' · ' + this.surface : '');
      clipping.textContent=this.clipped?'Signal clipping — reduce steering gain or road texture.':'Signal within range';
      damping.disabled=!!this.wizard || !this.conditionAvailable('damping'); friction.disabled=!!this.wizard || !this.conditionAvailable('friction');
      conditionStatus.textContent=this.bridge&&!this.bridgeAdvanced?'Restart the local bridge to use adjustable output, damping and friction.':this.hid.conditionError ||
        'Damping: '+(damping.disabled?'unavailable':'supported')+' · Friction: '+(friction.disabled?'unavailable':'supported')+'. Base software may add its own resistance.';
      if (this.wizard) {
        const wizard = this.wizard; wizard.observe(devices);
        const [key, phase, heading, prompt] = wizard.step;
        if (wizardIndex !== wizard.index) { title.textContent = heading; instructions.textContent = prompt; wizardIndex = wizard.index; }
        progress.textContent = 'STEP ' + (wizard.index + 1) + ' OF ' + WIZARD_STEPS.length;
        next.textContent = phase === 'review' ? 'Save rig setup' : phase === 'prepare' ? 'Start listening' : phase === 'rest' ? 'Pedal released — continue' : phase === 'center' ? 'Confirm center' : phase === 'test' ? 'Yes, this works correctly' : 'Confirm this input';
        next.disabled = !wizard.ready(devices);
        skip.hidden = phase !== 'button'; retry.hidden = phase === 'prepare' || phase === 'rest';
        reverse.hidden = !(key === 'steer' && phase === 'test');
        const b = wizard.candidate, device = b && devices.find(d => d.key === b.device);
        const message = wizard.problem || (b && !device ? 'Device disconnected. Reconnect it or try again.' : b ? 'Detected: ' + device.name + ' · ' + (phase === 'button' ? 'button ' + b.button : 'axis ' + b.axis) + '. Confirm if this is the correct control.' : next.disabled ? 'Waiting for the requested input. Keep other controls still.' : phase === 'review' ? 'Test each input above. Save when everything moves correctly.' : 'Ready when you are.');
        if (detected.textContent !== message) detected.textContent = message;
        wizardPreview(wizard.preview(), devices);
      } else wizardIndex = -1;
      const input = mappedInput(this.profile, devices), wheel = devices.find(d => this.profile.steer && d.key === this.profile.steer.device);
      const names = devices.map(d => d.name).join(', ');
      const nextStatus = (devices.length ? 'Detected: ' + names : 'No wheel detected. Connect it and move a control.') +
        (input ? ' · Calibration ready.' : ' · Calibration required.') + (this.bridge ? ' · Local bridge connected.' : this.hid.ready ? ' · Browser FFB connected to ' + this.hid.device.productName + '.' : ' · Browser input. Connect browser FFB or use the local bridge for steering torque.') + (this.error ? ' ' + this.error : '');
      if (nextStatus !== lastStatus) { status.textContent = nextStatus; lastStatus = nextStatus; }
      connectHid.disabled = this.hid.connecting || this.bridge || !!this.wizard || !this.hid.available;
      connectHid.textContent = this.hid.connecting ? 'Connecting browser FFB…' : this.hid.ready ? 'Disconnect browser FFB' : this.hid.available ? 'Connect browser FFB' : 'Browser FFB needs Chrome/Edge';
      ffb.disabled = !!this.wizard || !(this.ffbAvailable(wheel, devices) && input);
      ffb.textContent = 'Steering FFB: ' + (this.ffb ? 'ON' : 'OFF') + (wheel && !this.ffbAvailable(wheel, devices) ? ' (not connected for this wheel)' : '');
      for (const { key, live, points } of rows) {
        const b = this.profile[key], v = axis(b, devices);
        live.textContent = (v === null ? 'Disconnected / unbound' : 'Raw ' + v.toFixed(3)) + ' · ' + points.map(p => p + ': ' + (b && Number.isFinite(b[p]) ? b[p].toFixed(2) : '—')).join(' / ') +
          (valid(b, key === 'steer') ? ' · Ready' : ' · Capture all positions');
      }
    };
    refresh(); setInterval(refresh, 33);
  }
}
const api = { RigControls, RigWizard, normalize, valid, mappedInput, feedbackForce, feedbackSignal };
if (typeof module !== 'undefined') module.exports = api;
else root.ApexRig = api;
})(typeof window === 'undefined' ? globalThis : window);
