// All the game's sound, synthesised live with the Web Audio API (no sound files needed).
// Effects: work, combat, interface, disasters. Ambience: wind + birds that fade as the planet heats up.

const SETTINGS_KEY = 'climate-rts-audio';

// Minimum time (s) between two plays of the same sound, so busy scenes don't turn into noise.
const MIN_GAP = {
  chop: 0.09, mine: 0.09, forage: 0.12, build: 0.09, arrow: 0.05, sword: 0.06, gun: 0.06, cannon: 0.12,
  death: 0.08, click: 0.03, confirm: 0.08, error: 0.25, horn: 4, fanfare: 2, chime: 0.4, thunder: 2,
  wave: 3, whoosh: 2, collapse: 0.4, victory: 3, defeat: 3,
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.last = {};
    this.settings = { master: 0.8, sfx: 0.9, ambience: 0.6 };
    try {
      const s = JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
      if (s) Object.assign(this.settings, s);
    } catch (e) { /* no saved settings */ }
    this.climate = { temp: 0, fires: 0, storm: 0 };
    this.birdTimer = 2;
    this.crackleTimer = 0;
  }

  // Hook up to an AudioContext (Phaser's, so it's unlocked on the first click).
  init(ctx) {
    if (!ctx || this.ctx === ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor(); // keeps big battles from distorting
    this.limiter.threshold.value = -10;
    this.limiter.ratio.value = 8;
    this.master.connect(this.limiter).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
    // a little shared reverb so things sit in a space
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.18;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.applyVolumes();
  }

  get ready() {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---------- settings ----------
  setVolume(kind, v) {
    this.settings[kind] = Math.max(0, Math.min(1, Math.round(v * 10) / 10));
    this.applyVolumes();
    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.settings.ambience, t, 0.05);
  }

  // ---------- building blocks ----------
  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  // Envelope: quick attack then exponential decay.
  env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  out(vol, wet = true) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.sfxBus);
    if (wet) g.connect(this.reverbSend);
    return g;
  }

  tone(dest, t, type, f0, f1, peak, attack, decay) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = this.ctx.createGain();
    this.env(g, t, peak, attack, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  noise(dest, t, filterType, freq, q, peak, attack, decay, freqEnd) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    if (attack + decay > 0.4) src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, attack, decay);
    src.connect(f).connect(g).connect(dest);
    const offset = Math.random() * 1.5;
    src.start(t, offset);
    src.stop(t + attack + decay + 0.05);
  }

  // ---------- the sounds ----------
  // vol: 0..1 (e.g. quieter for things far from the camera)
  play(name, vol = 1) {
    if (!this.ready || vol <= 0.01) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < (MIN_GAP[name] || 0.05)) return;
    this.last[name] = now;
    const t = now + 0.005;
    const j = () => 0.92 + Math.random() * 0.16; // slight random pitch so repeats don't sound robotic
    const o = this.out(vol);
    switch (name) {
      case 'chop':
        this.noise(o, t, 'bandpass', 1500 * j(), 1.2, 0.5, 0.002, 0.07);
        this.tone(o, t, 'sine', 140 * j(), 70, 0.45, 0.002, 0.09);
        break;
      case 'mine':
        this.tone(o, t, 'triangle', 1250 * j(), 1150, 0.18, 0.001, 0.18);
        this.tone(o, t, 'square', 1870 * j(), 1800, 0.05, 0.001, 0.12);
        this.noise(o, t, 'highpass', 3000, 0.7, 0.3, 0.001, 0.03);
        break;
      case 'forage':
        this.noise(o, t, 'highpass', 2500 * j(), 0.5, 0.12, 0.02, 0.12);
        break;
      case 'build':
        this.tone(o, t, 'triangle', 320 * j(), 160, 0.4, 0.001, 0.07);
        this.noise(o, t, 'bandpass', 900, 1.5, 0.3, 0.001, 0.05);
        break;
      case 'arrow':
        this.noise(o, t, 'bandpass', 3200, 2.5, 0.35, 0.01, 0.16, 700);
        this.tone(o, t + 0.17, 'sine', 180, 90, 0.18, 0.002, 0.06);
        break;
      case 'sword':
        for (const f of [2350, 3120, 4410]) this.tone(o, t, 'sine', f * j(), f * 0.98, 0.09, 0.001, 0.22);
        this.noise(o, t, 'highpass', 4000, 0.7, 0.25, 0.001, 0.04);
        break;
      case 'gun':
        this.noise(o, t, 'lowpass', 4500, 0.8, 0.6, 0.001, 0.18, 300);
        this.tone(o, t, 'sine', 110, 45, 0.4, 0.001, 0.15);
        break;
      case 'cannon':
        this.noise(o, t, 'lowpass', 1800, 0.8, 0.6, 0.002, 0.45, 120);
        this.tone(o, t, 'sine', 70, 30, 0.5, 0.002, 0.4);
        break;
      case 'death':
        this.tone(o, t, 'sine', 160 * j(), 60, 0.35, 0.005, 0.25);
        this.noise(o, t, 'lowpass', 600, 0.7, 0.2, 0.005, 0.2);
        break;
      case 'collapse':
        this.noise(o, t, 'lowpass', 900, 0.7, 0.9, 0.02, 1.4, 120);
        this.tone(o, t, 'sine', 55, 30, 0.6, 0.02, 1.2);
        break;
      case 'click':
        this.tone(this.out(vol, false), t, 'sine', 1400, 900, 0.18, 0.001, 0.04);
        break;
      case 'confirm':
        this.tone(this.out(vol, false), t, 'triangle', 660, 660, 0.14, 0.004, 0.07);
        this.tone(this.out(vol, false), t + 0.06, 'triangle', 990, 990, 0.12, 0.004, 0.09);
        break;
      case 'error':
        this.tone(this.out(vol, false), t, 'square', 150, 140, 0.08, 0.005, 0.18);
        break;
      case 'horn': {
        // a low war horn
        for (const [f, d] of [[146.8, 0], [220, 0.02]]) {
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f * 0.94, t + d);
          osc.frequency.linearRampToValueAtTime(f, t + d + 0.15);
          const lp = this.ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 900;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t + d);
          g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.12);
          g.gain.setValueAtTime(0.18, t + d + 0.8);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.3);
          osc.connect(lp).connect(g).connect(o);
          osc.start(t + d);
          osc.stop(t + d + 1.4);
        }
        break;
      }
      case 'fanfare':
        [523.3, 659.3, 784, 1046.5].forEach((f, i) => {
          this.tone(o, t + i * 0.13, 'triangle', f, f, 0.2, 0.01, i === 3 ? 0.9 : 0.25);
          this.tone(o, t + i * 0.13, 'sawtooth', f / 2, f / 2, 0.04, 0.01, i === 3 ? 0.9 : 0.25);
        });
        break;
      case 'chime':
        for (const [f, k] of [[880, 0.16], [1320, 0.08], [1760, 0.05]]) this.tone(o, t, 'sine', f, f, k, 0.003, 0.9);
        break;
      case 'victory':
        [392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(o, t + i * 0.18, 'triangle', f, f, 0.22, 0.01, i === 4 ? 1.6 : 0.3));
        break;
      case 'defeat':
        [392, 349.2, 311.1, 261.6].forEach((f, i) => this.tone(o, t + i * 0.32, 'triangle', f, f, 0.18, 0.02, i === 3 ? 1.6 : 0.4));
        break;
      case 'thunder':
        this.noise(o, t, 'lowpass', 2500, 0.6, 0.7, 0.01, 0.25, 600);
        this.noise(o, t + 0.15, 'lowpass', 400, 0.6, 0.9, 0.2, 2.4, 80);
        break;
      case 'wave':
        this.noise(o, t, 'lowpass', 300, 0.7, 0.9, 0.8, 2.2, 1400);
        break;
      case 'whoosh':
        this.noise(o, t, 'bandpass', 400, 0.8, 0.5, 0.3, 1.2, 2200);
        break;
      default:
        break;
    }
  }

  // ---------- ambience ----------
  startAmbience() {
    if (!this.ready || this.amb) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 350;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    // slow "gusts"
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.ambBus);
    src.start();
    lfo.start();
    this.amb = { src, lp, g, lfo };
  }

  stopAmbience() {
    if (!this.amb) return;
    try { this.amb.src.stop(); this.amb.lfo.stop(); } catch (e) { /* already stopped */ }
    this.amb = null;
  }

  // Called a few times a second with the state of the world.
  updateAmbience(dt, { temp = 0, firesOnScreen = 0, paused = false } = {}) {
    if (!this.ready || !this.amb) return;
    const t = this.ctx.currentTime;
    const heat = Math.max(0, Math.min(1, temp / 4));
    // hotter = harsher, louder wind
    this.amb.g.gain.setTargetAtTime((paused ? 0.025 : 0.05) + heat * 0.06, t, 0.5);
    this.amb.lp.frequency.setTargetAtTime(350 + heat * 500, t, 0.5);
    if (paused) return;

    // birdsong fades out as the planet warms
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 4 + heat * 10;
      if (Math.random() > heat * 1.2) this.bird();
    }
    // fire crackle when wildfires are on screen
    if (firesOnScreen > 0) {
      this.crackleTimer -= dt;
      while (this.crackleTimer <= 0) {
        this.crackleTimer += 0.05 + Math.random() * (0.25 / Math.min(4, firesOnScreen));
        const o = this.ambOut(0.5);
        this.noise(o, t + Math.random() * 0.05, 'highpass', 1800 + Math.random() * 2500, 0.8, 0.25 + Math.random() * 0.35, 0.001, 0.02 + Math.random() * 0.03);
      }
    }
  }

  ambOut(vol) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.ambBus);
    g.connect(this.reverbSend);
    return g;
  }

  bird() {
    const o = this.ambOut(0.35);
    const t = this.ctx.currentTime + 0.01;
    const base = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05);
      this.tone(o, s, 'sine', base * (1 + Math.random() * 0.2), base * (0.8 + Math.random() * 0.5), 0.05, 0.005, 0.06);
    }
  }
}

export const audio = new AudioEngine();
