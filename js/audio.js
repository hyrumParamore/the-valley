// AudioManager — all sound is synthesized with WebAudio, no asset files.
// Ambient layers (wind / structure hum / water) crossfade with proximity and
// restoration progress, mirroring the AudioManager autoload design.
TV.Audio = {
  ctx: null,
  master: null,
  muted: false,
  _musicTimer: 0,
  _musicNext: 2,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = C;
    this.master = C.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(C.destination);

    // shared echo for plucks/chimes
    this.delay = C.createDelay(1.0);
    this.delay.delayTime.value = 0.42;
    this.delayFb = C.createGain(); this.delayFb.gain.value = 0.32;
    this.delayLp = C.createBiquadFilter(); this.delayLp.type = 'lowpass'; this.delayLp.frequency.value = 2200;
    this.delay.connect(this.delayLp); this.delayLp.connect(this.delayFb); this.delayFb.connect(this.delay);
    this.delayOut = C.createGain(); this.delayOut.gain.value = 0.5;
    this.delay.connect(this.delayOut); this.delayOut.connect(this.master);

    const noiseBuf = this._noiseBuffer();

    // wind — slow filtered noise with a breathing LFO
    this.windGain = C.createGain(); this.windGain.gain.value = 0.0;
    const wind = C.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const windBp = C.createBiquadFilter(); windBp.type = 'bandpass'; windBp.frequency.value = 420; windBp.Q.value = 0.6;
    const windLfo = C.createOscillator(); windLfo.frequency.value = 0.07;
    const windLfoAmt = C.createGain(); windLfoAmt.gain.value = 0.35;
    const windBase = C.createGain(); windBase.gain.value = 0.65;
    windLfo.connect(windLfoAmt); windLfoAmt.connect(windBase.gain);
    wind.connect(windBp); windBp.connect(windBase); windBase.connect(this.windGain);
    this.windGain.connect(this.master);
    wind.start(); windLfo.start();

    // structure hum — deep detuned sines, gain by proximity
    this.humGain = C.createGain(); this.humGain.gain.value = 0.0;
    for (const f of [54, 81.5, 108.7]) {
      const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = C.createGain(); g.gain.value = f < 60 ? 0.5 : 0.18;
      o.connect(g); g.connect(this.humGain); o.start();
    }
    this.humGain.connect(this.master);

    // water — bright filtered noise, gain by proximity to flowing water
    this.waterGain = C.createGain(); this.waterGain.gain.value = 0.0;
    const wat = C.createBufferSource(); wat.buffer = noiseBuf; wat.loop = true;
    const watBp = C.createBiquadFilter(); watBp.type = 'bandpass'; watBp.frequency.value = 2400; watBp.Q.value = 0.5;
    wat.connect(watBp); watBp.connect(this.waterGain);
    this.waterGain.connect(this.master);
    wat.start();

    // fire — low crackling noise with amplitude jitter, gain by proximity to embers
    this.fireGain = C.createGain(); this.fireGain.gain.value = 0.0;
    const fir = C.createBufferSource(); fir.buffer = noiseBuf; fir.loop = true;
    const firLp = C.createBiquadFilter(); firLp.type = 'lowpass'; firLp.frequency.value = 520;
    const jitter = C.createGain(); jitter.gain.value = 0.6;
    for (const [fq, amt] of [[6.7, 0.22], [11.3, 0.16]]) {
      const o = C.createOscillator(); o.frequency.value = fq;
      const g = C.createGain(); g.gain.value = amt;
      o.connect(g); g.connect(jitter.gain); o.start();
    }
    fir.connect(firLp); firLp.connect(jitter); jitter.connect(this.fireGain);
    this.fireGain.connect(this.master);
    fir.start();
  },

  igniteSound() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this._noiseBuffer();
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(180, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + 1.2);
    this.pluck(110, 0.25, 'sine', 2.5);
  },

  _noiseBuffer() {
    const C = this.ctx, len = C.sampleRate * 2;
    const buf = C.createBuffer(1, len, C.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { // pinkish noise
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      d[i] = last * 4.5;
    }
    return buf;
  },

  setLevels(wind, hum, water, fire = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(wind * 0.5, t, 0.6);
    this.humGain.gain.setTargetAtTime(hum * 0.16, t, 0.6);
    this.waterGain.gain.setTargetAtTime(water * 0.30, t, 0.4);
    this.fireGain.gain.setTargetAtTime(fire * 0.22, t, 0.4);
  },

  toggleMute() {
    if (!this.ctx) return;
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
    return this.muted;
  },

  pluck(freq, vol = 0.22, type = 'triangle', dur = 1.6, echo = true) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    if (echo) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.1);
  },

  step() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this._stepBuf || (this._stepBuf = this._noiseBuffer());
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = C.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + 0.1);
  },

  interactChime() { this.pluck(523.25, 0.12, 'sine', 0.8); },

  craft() { this.pluck(392, 0.16, 'square', 0.25, false); setTimeout(() => this.pluck(587, 0.14, 'square', 0.4, false), 90); },

  rumble(dur = 1.6) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this._noiseBuffer(); s.loop = true;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 90;
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.1);
  },

  // the restoration payoff — rising swell into a pentatonic arpeggio
  restorationTheme(stage) {
    if (!this.ctx) return;
    this.rumble(1.2);
    const base = [220, 261.63, 329.63, 392, 440, 523.25, 659.25, 783.99];
    const seq = stage >= 3 ? [0, 2, 4, 5, 6, 7, 6, 4] : stage === 2 ? [0, 1, 3, 4, 5, 6] : [0, 2, 3, 4, 5];
    seq.forEach((n, i) => {
      setTimeout(() => this.pluck(base[n], 0.26, 'triangle', 2.4), 350 + i * 190);
    });
    setTimeout(() => this.pluck(base[0] / 2, 0.3, 'sine', 4.0), 300);
  },

  // sparse generative music once the valley starts waking
  updateMusic(dt, stage) {
    if (!this.ctx || stage < 1 || this.muted) return;
    this._musicTimer += dt;
    if (this._musicTimer < this._musicNext) return;
    this._musicTimer = 0;
    this._musicNext = 2.5 + Math.random() * (6 - stage);
    const pent = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
    const hi = Math.min(pent.length, 4 + stage * 2);
    const n = pent[Math.floor(Math.random() * hi)];
    this.pluck(n, 0.10 + stage * 0.015, 'triangle', 2.8);
    if (stage >= 2 && Math.random() < 0.4) this.pluck(n * 1.5, 0.07, 'sine', 2.2);
    if (stage >= 3 && Math.random() < 0.5) this.pluck(n * 2, 0.05, 'sine', 1.8);
  },
};
