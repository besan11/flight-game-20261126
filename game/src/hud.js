// SKYFERRY — the cockpit. One file, one job: every instrument the
// pilot reads. Twelve live systems on the glass: airspeed, altitude,
// heading tape, attitude indicator, vertical speed, fuel, throttle,
// flaps, gear, wind, mission timer and score — plus integrity and the
// warning line. DOM text for numbers, canvas for the attitude ball
// and the compass tape, so both stay crisp in a screenshot.

import { MISSIONS, WORLD } from './config.js';

function $(doc, id) {
  return doc.getElementById(id);
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function compassLabel(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export class Hud {
  constructor(doc, hooks = {}) {
    this.doc = doc;
    this.hooks = hooks;
    this.els = {};
    for (const id of [
      'hud-airspeed', 'hud-altitude', 'hud-vsi', 'hud-heading', 'hud-attitude',
      'hud-fuel-fill', 'hud-fuel-text', 'hud-throttle-fill', 'hud-throttle-text',
      'hud-flaps', 'hud-gear', 'hud-wind', 'hud-timer', 'hud-score',
      'hud-integrity-fill', 'hud-integrity-text', 'hud-mission-name',
      'hud-objectives', 'hud-message', 'hud-warn', 'hud-g',
      'overlay-title', 'overlay-pause', 'overlay-end',
      'end-title', 'end-lines', 'end-hint', 'title-missions',
    ]) {
      this.els[id] = $(doc, id);
    }
    this.attitude = this.els['hud-attitude'].getContext('2d');
    this.headingCtx = this.els['hud-heading'].getContext('2d');
    this.buildMissionList();
  }

  buildMissionList() {
    const list = this.els['title-missions'];
    if (!list) return;
    list.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const btn = this.doc.createElement('button');
      btn.className = 'mission-btn';
      btn.dataset.mission = String(i);
      btn.innerHTML = `<span class="mission-num">${i + 1}</span><span class="mission-name">${m.name}</span><span class="mission-tag">${m.tag}</span><span class="mission-points">${m.points} pts</span>`;
      btn.addEventListener('click', () => this.hooks.onSelectMission?.(i));
      list.appendChild(btn);
    });
  }

  setMessage(text) {
    if (this.els['hud-message']) this.els['hud-message'].textContent = text;
  }

  showTitle() {
    this.showOnly('overlay-title');
  }

  showPause() {
    this.showOnly('overlay-pause');
  }

  showEnd(title, lines, hint) {
    if (this.els['end-title']) this.els['end-title'].textContent = title;
    if (this.els['end-lines']) this.els['end-lines'].innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    if (this.els['end-hint']) this.els['end-hint'].textContent = hint;
    this.showOnly('overlay-end');
  }

  hideOverlays() {
    for (const id of ['overlay-title', 'overlay-pause', 'overlay-end']) {
      this.els[id]?.classList.add('hidden');
    }
  }

  showOnly(id) {
    for (const oid of ['overlay-title', 'overlay-pause', 'overlay-end']) {
      this.els[oid]?.classList.toggle('hidden', oid !== id);
    }
  }

  update(world) {
    const p = world.plane;
    const m = world.mission;
    const kt = Math.round(p.speed * WORLD.knotsPerMs);
    const ft = Math.round((p.pos.y - world.heightAt(p.pos.x, p.pos.z)) * WORLD.feetPerM);
    const altFt = Math.round(p.pos.y * WORLD.feetPerM);
    const hdg = ((Math.round((p.heading * 180) / Math.PI) % 360) + 360) % 360;
    const set = (id, text) => {
      const el = this.els[id];
      if (el && el.textContent !== text) el.textContent = text;
    };
    set('hud-airspeed', String(kt));
    set('hud-altitude', String(altFt));
    set('hud-vsi', `${p.vs >= 0 ? '+' : ''}${(p.vs * WORLD.feetPerM * 60 / 100).toFixed(1)}`);
    set('hud-fuel-text', `${Math.round(p.fuel * 100)}%`);
    set('hud-throttle-text', `${Math.round(p.throttle * 100)}%`);
    set('hud-flaps', ['UP', '1', 'FULL'][p.flaps]);
    set('hud-gear', p.gearDown ? 'DOWN' : 'UP');
    const wind = world.weather.windAt(p.pos.x, p.pos.z, world.time);
    set('hud-wind', `${Math.round(wind.speed * WORLD.knotsPerMs)} kt ${compassLabel((wind.dir * 180) / Math.PI + 180)}`);
    set('hud-timer', fmtTime(m.timeLeft));
    set('hud-score', String(m.score));
    set('hud-integrity-text', `${Math.round(p.integrity)}%`);
    set('hud-g', `${p.gForce.toFixed(1)} G`);
    set('hud-mission-name', `${m.index + 1} · ${m.def.name}`);
    if (this.els['hud-fuel-fill']) this.els['hud-fuel-fill'].style.width = `${p.fuel * 100}%`;
    if (this.els['hud-throttle-fill']) this.els['hud-throttle-fill'].style.width = `${p.throttle * 100}%`;
    if (this.els['hud-integrity-fill']) this.els['hud-integrity-fill'].style.width = `${p.integrity}%`;
    const warn = [];
    const stallWarn = p.flaps === 2 ? 26 : p.flaps === 1 ? 28 : 31;
    if (!p.onGround && p.speed < stallWarn) warn.push('STALL');
    if (world.weather.shearWarning(p.pos.x, p.pos.z, world.time)) warn.push('WIND SHEAR');
    if (p.fuel < 0.15) warn.push('LOW FUEL');
    if (p.integrity < 35) warn.push('AIRFRAME');
    set('hud-warn', warn.join(' · '));
    this.els['hud-warn']?.classList.toggle('on', warn.length > 0);
    const obj = this.els['hud-objectives'];
    if (obj) {
      const html = m.objectives.map((o) => `<div class="obj${o.done ? ' done' : ''}">${o.done ? '✓' : '○'} ${o.text}</div>`).join('');
      if (obj.innerHTML !== html) obj.innerHTML = html;
    }
    this.drawAttitude(p);
    this.drawHeading(hdg);
  }

  drawAttitude(p) {
    const ctx = this.attitude;
    const W = 150;
    const H = 150;
    const cx = W / 2;
    const cy = H / 2;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-p.bank);
    const pitchPx = Math.max(-60, Math.min(60, p.pitch * 90));
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#2f7fc2';
    ctx.fillRect(-90, -160, 180, 160);
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(-90, 0, 180, 160);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-90, 0);
    ctx.lineTo(90, 0);
    ctx.stroke();
    for (const off of [-40, -20, 20, 40]) {
      ctx.beginPath();
      ctx.moveTo(-26, off);
      ctx.lineTo(26, off);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-46, 0);
    ctx.lineTo(-16, 0);
    ctx.moveTo(16, 0);
    ctx.lineTo(46, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawHeading(hdg) {
    const ctx = this.headingCtx;
    const W = 300;
    const H = 34;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8, 18, 30, 0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8f2fa';
    ctx.font = 'bold 13px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 15) {
      const deg = ((hdg + d) % 360 + 360) % 360;
      const x = W / 2 + d * 2.1;
      const major = deg % 45 === 0;
      ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, major ? 6 : 12);
      ctx.lineTo(x, 20);
      ctx.stroke();
      if (major) {
        const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
        ctx.fillText(label, x, 32);
      }
    }
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 6, 0);
    ctx.lineTo(W / 2 + 6, 0);
    ctx.lineTo(W / 2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 13px Rajdhani, sans-serif';
    ctx.fillText(String(hdg).padStart(3, '0'), W / 2, 32);
  }
}
