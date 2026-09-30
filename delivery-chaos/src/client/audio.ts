// WebAudio-only sound effects (no audio files). Every method is a silent no-op with ?nosfx.
const AC: typeof AudioContext | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engineOsc: OscillatorNode[] = [];
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private lastPlay = new Map<string, number>();

  constructor(readonly enabled: boolean) {}

  /** Create / resume the AudioContext. Must be called from a user gesture (click / keydown) the first time. */
  unlock(): void {
    if (!this.enabled || !AC) return;
    try {
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.startEngine();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      /* audio is optional */
    }
  }

  private get ready(): boolean {
    return this.enabled && !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  /** rate-limit a sound by key (ms) */
  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlay.get(key) ?? -1e9) < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  // ---------------- engine ----------------
  private startEngine(): void {
    const ctx = this.ctx!;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineFilter.connect(this.engineGain).connect(this.master!);
    for (const [type, mult, gain] of [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sawtooth', 2.01, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 50 * mult;
      (o as OscillatorNode & { mult: number }).mult = mult;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.engineFilter);
      o.start();
      this.engineOsc.push(o);
    }
  }

  /** speed01: 0..1 of max speed; throttle 0..1; active=false silences the engine (menu / results) */
  setEngine(speed01: number, throttle: number, active = true): void {
    if (!this.ready || !this.engineGain || !this.engineFilter) return;
    const t = this.ctx!.currentTime;
    const base = 46 + 90 * speed01 + 22 * throttle;
    for (const o of this.engineOsc) o.frequency.setTargetAtTime(base * (o as OscillatorNode & { mult: number }).mult, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(280 + 900 * speed01 + 300 * throttle, t, 0.06);
    this.engineGain.gain.setTargetAtTime(active ? 0.05 + 0.07 * throttle + 0.04 * speed01 : 0, t, 0.08);
  }

  // ---------------- one-shots ----------------
  private env(gain: GainNode, t0: number, attack: number, peak: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number, dest: AudioNode = this.master!): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this.env(g, t0, 0.008, peak, dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noiseBurst(t0: number, dur: number, peak: number, filterType: BiquadFilterType, f0: number, f1: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    this.env(g, t0, 0.01, peak, dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  /** Two-tone scooter horn. volume 0..1 (lower for far-away riders). */
  horn(volume = 1): void {
    if (!this.ready || !this.throttle('horn', 120)) return;
    const t = this.ctx!.currentTime;
    for (const [i, f] of [[0, 392], [0, 494], [1, 392], [1, 494]] as const) {
      this.tone('square', f, f * 0.98, t + i * 0.2, 0.16, 0.13 * volume);
    }
  }

  dogBark(): void {
    if (!this.ready || !this.throttle('dog', 300)) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * 0.22;
      this.tone('sawtooth', 420, 190, t0, 0.13, 0.22);
      this.noiseBurst(t0, 0.1, 0.16, 'bandpass', 1400, 700, 2);
    }
  }

  splash(intensity = 0.5): void {
    if (!this.ready || !this.throttle('splash', 250)) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.28 + 0.2 * intensity, 0.22 + 0.2 * intensity, 'bandpass', 2400, 500, 0.9);
  }

  crash(): void {
    if (!this.ready || !this.throttle('crash', 300)) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(t, 0.55, 0.45, 'lowpass', 1800, 120, 0.7);
    this.tone('sine', 120, 38, t, 0.4, 0.6);
    this.tone('square', 210, 60, t, 0.18, 0.12);
  }

  thud(intensity = 0.5): void {
    if (!this.ready || !this.throttle('thud', 120)) return;
    const t = this.ctx!.currentTime;
    this.tone('sine', 110, 45, t, 0.14, 0.25 + 0.3 * intensity);
    this.noiseBurst(t, 0.06, 0.1 * intensity, 'lowpass', 900, 200);
  }

  /** delivery "叮咚" */
  chime(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone('sine', 1318, 1318, t, 0.5, 0.28);
    this.tone('sine', 1046, 1046, t + 0.16, 0.7, 0.28);
    this.tone('sine', 2637, 2637, t, 0.25, 0.06);
  }

  /** pickup blip */
  pickup(): void {
    if (!this.ready) return;
    const t = this.ctx!.currentTime;
    this.tone('triangle', 660, 660, t, 0.12, 0.22);
    this.tone('triangle', 990, 990, t + 0.09, 0.18, 0.22);
  }

  pop(): void {
    if (!this.ready || !this.throttle('pop', 80)) return;
    const t = this.ctx!.currentTime;
    this.tone('sine', 520, 180, t, 0.12, 0.3);
  }

  fail(): void {
    if (!this.ready || !this.throttle('fail', 200)) return;
    const t = this.ctx!.currentTime;
    this.tone('sawtooth', 220, 110, t, 0.3, 0.15);
  }
}
