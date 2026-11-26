// SKYFERRY — sound, synthesized. One file, one job: every noise the
// game makes, built from oscillators and filtered noise at run time.
// No audio files, no network. Silent until the player interacts (the
// browser's autoplay rule) and silent in screenshot mode.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.muted = false;
  }

  /** Create the context. Call from a user gesture; safe to call twice. */
  ensure() {
    if (this.ctx || typeof window === 'undefined') return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.gain.value = 0.5;
      master.connect(this.ctx.destination);
      this.master = master;
      // Engine: a sawtooth through a low-pass, pitch follows throttle.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp).connect(this.engineGain).connect(master);
      this.engineOsc.start();
      // Wind: looped noise through a band-pass, loudness follows speed.
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      noise.connect(bp).connect(this.windGain).connect(master);
      noise.start();
    } catch {
      this.ctx = null;
    }
  }

  /** Continuous engine + wind levels, called every frame. */
  setFlight(throttle, speed, engineOn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = engineOn ? 0.05 + throttle * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + throttle * 95, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.16, Math.max(0, speed - 18) * 0.0022), t, 0.15);
  }

  tone(freq, dur, type = 'sine', vol = 0.25, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  ring() {
    this.tone(880, 0.35, 'sine', 0.3);
    this.tone(1318, 0.4, 'sine', 0.18, 0.07);
  }

  objective() {
    this.tone(523, 0.18, 'triangle', 0.25);
    this.tone(784, 0.3, 'triangle', 0.25, 0.12);
  }

  fail() {
    this.tone(196, 0.5, 'square', 0.16);
    this.tone(147, 0.7, 'square', 0.16, 0.18);
  }

  finish() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.25, i * 0.11));
  }

  crash() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain).connect(this.master);
    src.start(t0);
    this.tone(70, 0.6, 'sine', 0.4);
  }

  click() {
    this.tone(1200, 0.06, 'square', 0.12);
  }
}
