// DUSTFALL sound: every effect is synthesised with WebAudio — no audio
// files, no network. A shared noise buffer and short envelopes keep it
// cheap; distance attenuates by a simple 1/(1+d/12) falloff.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  _gain(vol, when) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.connect(this.master);
    return g;
  }

  _noise(dur, vol, freq, type = 'lowpass', when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this._gain(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, vol, type = 'sine', slideTo = 0, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this._gain(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // vol is 0..1 at the listener; dist scales it down.
  _at(dist, base) {
    return base / (1 + Math.max(0, dist) / 12);
  }

  shot(kind, dist = 0) {
    if (!this.ctx) return;
    const v = this._at(dist, kind === 'lr50' ? 0.9 : kind === 'ar77' ? 0.7 : 0.55);
    this._noise(0.09, v, kind === 'p9' ? 2400 : 1500, 'lowpass');
    this._tone(kind === 'lr50' ? 220 : 160, 0.08, v * 0.5, 'square', 60);
  }

  dryFire() { this._tone(1400, 0.03, 0.12, 'square'); }
  reload() { this._tone(900, 0.04, 0.15, 'square'); this._tone(600, 0.04, 0.15, 'square', 0, 0.12); }
  hit() { this._tone(2400, 0.05, 0.2, 'sine'); }
  kill() { this._tone(1800, 0.07, 0.25, 'sine'); this._tone(2400, 0.09, 0.2, 'sine', 0, 0.07); }
  hurt() { this._tone(220, 0.12, 0.3, 'sawtooth', 110); }
  step(dist = 0) { this._noise(0.05, this._at(dist, 0.12), 500); }
  plantBeep(final = false) { this._tone(final ? 1600 : 1100, 0.09, 0.25, 'square'); }
  defuseTick() { this._tone(900, 0.05, 0.18, 'square'); }
  explosion(dist = 0) {
    const v = this._at(dist, 1);
    this._noise(0.9, v, 300);
    this._tone(70, 0.8, v * 0.8, 'sine', 30);
  }
  grenadeThrow() { this._noise(0.12, 0.2, 900, 'bandpass'); }
  flashPop(dist = 0) { this._noise(0.2, this._at(dist, 0.5), 4000, 'highpass'); }
  roundStart() { this._tone(660, 0.12, 0.2, 'sine'); this._tone(880, 0.18, 0.2, 'sine', 0, 0.12); }
  roundWin() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.16, 0.2, 'sine', 0, i * 0.11)); }
  roundLose() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.16, 0.18, 'sine', 0, i * 0.11)); }
  buy() { this._tone(1200, 0.06, 0.18, 'sine'); this._tone(1500, 0.08, 0.15, 'sine', 0, 0.06); }
  deny() { this._tone(180, 0.12, 0.25, 'square', 140); }
}
