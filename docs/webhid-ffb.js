/* Moza R3 HID PID reports, verified against the connected 346e:0005 descriptor. */
(function (root) {
'use strict';
const VENDOR = 0x346e, PRODUCT = 5, DURATION = 120, MAX_FORCE = 0.2;
const pid = n => 0xf0000 | n;
function reports(collections, kind, found = new Map()) {
  for (const c of collections || []) {
    for (const r of c[kind] || []) {
      const bits = r.items.reduce((n, i) => n + i.reportSize * i.reportCount, 0);
      if (!found.has(r.reportId) || bits > found.get(r.reportId).bits) found.set(r.reportId, { ...r, bits });
    }
    reports(c.children, kind, found);
  }
  return found;
}
function fields(report) {
  const result = []; let offset = 0;
  for (const i of report.items) {
    const usages = i.usages?.length ? i.usages : i.isRange ? Array.from({length:Math.min(256,i.usageMaximum-i.usageMinimum+1)},(_,n)=>i.usageMinimum+n) : [];
    if (!i.isConstant) for (let n = 0; n < i.reportCount; n++) {
      const choices = i.isArray ? usages : [usages[Math.min(n, usages.length - 1)]];
      for (const usage of choices) result.push({ usage, offset:offset+n*i.reportSize, size:i.reportSize, min:i.logicalMinimum, max:i.logicalMaximum });
    }
    offset += i.reportSize * i.reportCount;
  }
  return result;
}
function has(table, id, bytes, checks) {
  const r=table.get(id); if (!r || r.bits !== bytes*8) return false;
  const fs=fields(r);
  return checks.every(([usage,offset,size,min,max])=>fs.some(f=>f.usage===usage&&f.offset===offset&&f.size===size&&(min===undefined||f.min===min)&&(max===undefined||f.max===max)));
}
function supported(device) {
  if (device.vendorId !== VENDOR || device.productId !== PRODUCT) return false;
  const outs = reports(device.collections,'outputReports'), features = reports(device.collections,'featureReports');
  // Reject a changed firmware layout before writing any output. Array usage order differs on Windows.
  return has(outs,1,21,[[pid(0x22),0,8],[pid(0x26),8,8],[pid(0x50),16,16,0,32767],[pid(0x52),80,8],[pid(0x53),88,8],[pid(0x56),98,1],[0xa0001,104,16]]) &&
    has(outs,2,13,[[pid(0x22),0,8],[pid(0x5b),8,16],[pid(0x5d),24,16]]) &&
    has(outs,5,3,[[pid(0x22),0,8],[pid(0x70),8,16,-32768,32767]]) &&
    has(outs,10,3,[[pid(0x22),0,8],[pid(0x79),8,8],[pid(0x7b),8,8],[pid(0x7c),16,8]]) &&
    has(outs,11,1,[[pid(0x22),0,8]]) &&
    has(outs,12,1,[[pid(0x97),0,1],[pid(0x98),1,1],[pid(0x99),2,1],[pid(0x9a),3,1]]) &&
    has(outs,13,1,[[pid(0x7e),0,8]]) &&
    has(features,17,3,[[pid(0x26),0,8]]) &&
    has(features,18,4,[[pid(0x22),0,8,1,10],[pid(0x8c),8,8]]) &&
    has(features,19,4,[[pid(0x80),0,16]]);
}
function conditionsSupported(device) {
  const outs=reports(device.collections,'outputReports'), features=reports(device.collections,'featureReports');
  return supported(device) &&
    has(outs,1,21,[[pid(0x41),8,8,1,11],[pid(0x43),8,8,1,11],[0x10030,96,1]]) &&
    has(features,17,3,[[pid(0x41),0,8,1,11],[pid(0x43),0,8,1,11]]) &&
    has(outs,3,14,[[pid(0x22),0,8,1,10],[pid(0x23),8,4,0,3],[pid(0x60),16,16,-32768,32767],
      [pid(0x61),32,16,-32768,32767],[pid(0x62),48,16,-32768,32767],
      [pid(0x63),64,16,0,32767],[pid(0x64),80,16,0,32767],[pid(0x65),96,16,0,32767]]);
}
function setEffect(block, type=1) {
  const data=new Uint8Array(21), view=new DataView(data.buffer);
  data[0]=block; data[1]=type; view.setUint16(2,DURATION,true);
  data[10]=255; data[11]=0; data[12]=type===1?4:1; view.setUint16(13,9000,true);
  return data; // constant: +X direction; conditions: X axis; no trigger or parameter offsets
}
const unit = (value, fallback=0) => Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
function forceLevels(force, options={}) {
  const constant=Number.isFinite(force)?Math.max(-1,Math.min(1,force)):0;
  const damper=unit(options.damping), friction=unit(options.friction);
  // Reserve a shared worst-case budget: simultaneous effects cannot exceed the selected limit.
  const scale=unit(options.outputLimit,MAX_FORCE)/(1+damper+friction);
  return {constant:constant*scale, damper:damper*scale, friction:friction*scale};
}
function constantForce(block, force, limit=MAX_FORCE) {
  const data=new Uint8Array(3); data[0]=block;
  const safe=Number.isFinite(force)?Math.max(-1,Math.min(1,force)):0;
  // PID direction is where force comes FROM: + magnitude at 9000 pushes left; the game uses +right.
  new DataView(data.buffer).setInt16(1,Math.trunc(-safe*unit(limit)*32767),true);
  return data;
}
function conditionForce(block, level) {
  const data=new Uint8Array(14), view=new DataView(data.buffer); data[0]=block;
  const magnitude=Math.trunc(unit(level)*32767);
  for (const offset of [4,6,8,10]) view.setUint16(offset,magnitude,true);
  return data; // X condition; symmetric positive resistance, zero centre and deadband
}
function loadedBlock(view) {
  let bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
  if (bytes.length>4 && bytes[0]===18) bytes=bytes.subarray(1);
  if (bytes.length<4 || bytes[1]!==1 || bytes[0]<1 || bytes[0]>10) throw new Error('The wheel could not allocate a force-feedback effect. Close other wheel games and reconnect.');
  return bytes[0];
}
class MozaHidFfb {
  constructor(onError = () => {}) {
    this.onError=onError; this.device=null; this.block=0; this.ready=false; this.connecting=false; this.desired=0; this.playing=false; this.busy=null; this.generation=0;
    this.effects=[]; this.conditions=false; this.conditionError=''; this.requested=false;
    if (typeof navigator!=='undefined' && navigator.hid) navigator.hid.addEventListener('disconnect',e=>{
      if (e.device!==this.device) return;
      this.ready=false; this.device=null; this.block=0; this.desired=0; this.requested=false; this.conditions=false; this.effects=[]; this.playing=false; this.generation++;
      this.onError('Wheel disconnected. Reconnect browser FFB.');
    });
  }
  get available() { return typeof navigator!=='undefined' && !!navigator.hid && typeof window!=='undefined' && window.isSecureContext; }
  async allocate(type) {
    const device=this.device;
    await device.sendFeatureReport(17,new Uint8Array([type,0,0]));
    let block;
    for (let attempt=0; attempt<3; attempt++) {
      try { block=loadedBlock(await device.receiveFeatureReport(18)); break; }
      catch (error) { if (attempt===2) throw error; await new Promise(resolve=>setTimeout(resolve,20)); }
    }
    if (this.effects.some(e=>e.block===block)) throw new Error('Wheel returned an effect block that is already in use.');
    const effect={block,type,level:0}; this.effects.push(effect);
    await device.sendReport(1,setEffect(block,type));
    if (type===1) {
      const envelope=new Uint8Array(13); envelope[0]=block;
      await device.sendReport(2,envelope);
      await device.sendReport(5,constantForce(block,0));
    } else await device.sendReport(3,conditionForce(block,0));
    return block;
  }
  // silent: reopen a wheel Chrome already granted (no chooser, no user click needed); resolves false if there is none
  async connect(silent=false) {
    if (this.connecting || this.ready) return;
    if (!this.available) throw new Error('Direct wheel FFB needs desktop Chrome or Edge on HTTPS or localhost.');
    this.connecting=true;
    try {
      const devices=silent?await navigator.hid.getDevices():await navigator.hid.requestDevice({filters:[{vendorId:VENDOR,productId:PRODUCT}]});
      const device=devices.find(supported);
      if (!device && silent) return false;
      if (!device) throw new Error('No supported Moza R3 FFB interface was selected. Other wheel layouts can use the local bridge.');
      if (this.device) await this.disconnect();
      this.device=device;
      if (!device.opened) await device.open();
      await device.sendReport(12,new Uint8Array([8])); // PID reset, then stop all, matching the kernel's PID initialization
      await new Promise(resolve=>setTimeout(resolve,60));
      await device.sendReport(12,new Uint8Array([4]));
      await device.receiveFeatureReport(19);
      this.block=await this.allocate(1);
      this.conditionError=''; this.conditions=false;
      if (conditionsSupported(device)) {
        try { await this.allocate(9); await this.allocate(11); this.conditions=true; }
        catch (error) {
          for (const effect of this.effects.slice(1)) await device.sendReport(11,new Uint8Array([effect.block]));
          this.effects=this.effects.slice(0,1);
          this.conditionError='Damping/friction unavailable: '+error.message;
        }
      }
      await device.sendReport(13,new Uint8Array([255]));
      await device.sendReport(12,new Uint8Array([1]));
      this.ready=true; // connection never starts an effect; the player must explicitly enable FFB
    } catch (error) { await this.disconnect(); throw error; }
    finally { this.connecting=false; }
  }
  matches(wheel, devices) {
    if (!this.ready || !this.device || !wheel) return false;
    const name=(this.device.productName||'').toLowerCase();
    const matching=devices.filter(d=>{
      const ids=/Vendor:\s*([0-9a-f]{4}).*Product:\s*([0-9a-f]{4})/i.exec(d.name);
      return ids ? parseInt(ids[1],16)===VENDOR&&parseInt(ids[2],16)===PRODUCT : name.length>0&&d.name.toLowerCase().includes(name);
    });
    return matching.length===1 && matching[0].key===wheel.key;
  }
  stop() {
    if (this.requested || this.playing) this.generation++;
    return this.write(0,{outputLimit:0});
  }
  async stopEffects(device, effects) {
    for (const effect of effects) {
      if (effect.type===1) {
        try { await device.sendReport(5,constantForce(effect.block,0)); } catch (_) { /* still try the stop operation */ }
      }
      try { await device.sendReport(10,new Uint8Array([effect.block,3,0])); } catch (_) { /* finite effect also expires */ }
    }
    this.playing=false;
  }
  write(force, options={}) {
    if (!this.ready || !this.device || !this.block) return Promise.resolve();
    this.desired=Number.isFinite(force)?Math.max(-1,Math.min(1,force)):0;
    const levels=forceLevels(this.desired,{...options,damping:this.conditions?options.damping:0,friction:this.conditions?options.friction:0});
    this.requested=Object.values(levels).some(level=>level!==0);
    if (this.busy) return this.busy;
    if (!this.requested && !this.playing) return Promise.resolve();
    const generation=this.generation, device=this.device, effects=this.effects.slice();
    this.busy=Promise.resolve().then(async()=>{
      try {
        if (!this.requested) { await this.stopEffects(device,effects); return; }
        if (this.playing && effects.some(e=>e.type!==1 && e.level!==levels[e.type===9?'damper':'friction'])) await this.stopEffects(device,effects);
        for (const effect of effects) {
          if (generation!==this.generation || !this.requested || !this.ready) break;
          const value=levels[effect.type===1?'constant':effect.type===9?'damper':'friction'];
          if (effect.type===1) await device.sendReport(5,constantForce(effect.block,value,1));
          else if (value!==effect.level) { await device.sendReport(3,conditionForce(effect.block,value)); effect.level=value; }
          if (generation!==this.generation || !this.requested || !this.ready) break;
          await device.sendReport(10,new Uint8Array([effect.block,value!==0?1:3,value!==0?1:0]));
        }
        if (generation!==this.generation || !this.requested || !this.ready) await this.stopEffects(device,effects);
        else this.playing=Object.values(levels).some(level=>level!==0);
      } catch(error) {
        this.ready=false; this.desired=0; this.requested=false;
        await this.stopEffects(device,effects);
        this.onError('Browser FFB stopped: '+error.message);
      } finally { this.busy=null; }
    });
    return this.busy;
  }
  async disconnect() {
    this.ready=false; this.desired=0; this.requested=false; this.generation++;
    if (this.busy) await this.busy;
    const device=this.device, effects=this.effects; this.device=null; this.block=0; this.effects=[]; this.conditions=false; this.playing=false;
    if (!device?.opened) return;
    try {
      await this.stopEffects(device,effects);
      for (const effect of effects) await device.sendReport(11,new Uint8Array([effect.block]));
      await device.sendReport(12,new Uint8Array([2]));
    } finally { await device.close(); }
  }
}
const api={MozaHidFfb,supported,conditionsSupported,setEffect,constantForce,conditionForce,forceLevels,loadedBlock,DURATION,MAX_FORCE};
if (typeof module!=='undefined') module.exports=api; else root.ApexHID=api;
})(typeof window==='undefined'?globalThis:window);
