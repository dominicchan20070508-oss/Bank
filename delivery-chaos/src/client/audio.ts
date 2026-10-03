// WebAudio-only sound effects (no audio files). Every method is a silent no-op with ?nosfx.
//
// Signal chain:  sources -> master gain -> DynamicsCompressor -> soft clipper -> destination   (+ an analyser tap)
// The compressor keeps overlapping sounds (crash + splash + horn + engine) from distorting; the soft clipper is a
// final safety net so the output can never reach full scale.
//
// Testability: pass a BaseAudioContext (e.g. an OfflineAudioContext) as `opts.ctx`. Scheduling then uses the
// context clock plus `clockOffset`, so a test can lay sounds out on a timeline and render them.
import { AUDIO } from '../shared/constants';
import type { PingId } from '../shared/pings';
import { AudioSessionFix } from './audioSession';
import { Throttle, engineTargets, isIdling, pingNotes, puttWave, softClipCurve, spillSound } from './audioLogic';
import { safeStorage } from './storage';

const AC: typeof AudioContext | undefined =
  typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;

const MUTE_KEY = 'dc.muted';
const VOLUME_KEY = 'dc.volume';

export interface SfxOptions {
  /** inject an audio context (tests: OfflineAudioContext). Disables the gesture / visibility handling. */
  ctx?: BaseAudioContext;
  /** initial mute state when injecting (otherwise it is read from localStorage) */
  muted?: boolean;
  /** initial volume 0..1 when injecting (otherwise from localStorage, default AUDIO.DEFAULT_VOLUME) */
  volume?: number;
}

export interface SfxInfo {
  enabled: boolean;
  ctxState: string; // 'none' before the first gesture
  muted: boolean;
  volume: number; // the player's slider, 0..1
  session: string; // which iOS silent-switch fix is active: 'audioSession' | 'audioElement' | 'none'
  engineGain: number;
  masterGain: number;
  /** RMS of the last ~46 ms at the output */
  level: number;
}

export class Sfx {
  private ctx: BaseAudioContext | null = null;
  private readonly injected: boolean;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  private engineOut: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private harmFilter: BiquadFilterNode | null = null;
  private engineOscs: { osc: OscillatorNode; mult: number }[] = [];
  private lfo: OscillatorNode | null = null;
  private readonly throttleMap = new Throttle();
  private muted = false;
  private volume: number = AUDIO.DEFAULT_VOLUME;
  private readonly session = new AudioSessionFix();
  private readonly stateListeners = new Set<() => void>();
  private hidden = false;
  private lastEngineCall = 0;
  private idleSince = -1;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lifecycleAttached = false;
  private listeners: [EventTarget, string, EventListener][] = [];
  /** seconds added to the context clock when scheduling (offline rendering: lay sounds out on a timeline) */
  clockOffset = 0;
  private seed = 12345;

  constructor(
    readonly enabled: boolean,
    opts: SfxOptions = {},
  ) {
    this.injected = !!opts.ctx;
    if (opts.ctx) this.ctx = opts.ctx;
    this.muted = opts.muted ?? (this.injected ? false : loadMuted());
    this.volume = clamp01(opts.volume ?? (this.injected ? AUDIO.DEFAULT_VOLUME : loadVolume()));
    if (this.injected && this.enabled) this.build();
  }

  // ---------------------------------------------------------------- lifecycle / unlocking
  /**
   * Create / resume the AudioContext. Call it from every user gesture until the context runs (iOS Safari only lets a
   * context start inside pointerup / touchend / click / keydown, and can drop it back to 'interrupted' later).
   */
  unlock(): void {
    if (!this.enabled || this.injected) return;
    this.session.apply(); // iPhone: make the side mute switch not silence the game (a no-op elsewhere)
    try {
      if (!this.ctx) {
        if (!AC) return;
        this.ctx = new AC();
        this.build();
        this.ctx.addEventListener?.('statechange', () => this.onStateChange());
      }
      const ctx = this.ctx!;
      if (ctx.state !== 'running' && !this.hidden) {
        // resume() must be called inside the gesture; playing a one-sample silent buffer also "blesses" iOS audio
        void (ctx as AudioContext).resume?.().catch(() => {});
        this.playSilentBuffer();
      }
    } catch {
      /* audio is optional */
    }
  }

  private playSilentBuffer(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  private onStateChange(): void {
    // 'interrupted' (iOS: phone call, Siri, lock screen) / 'suspended' while the page is visible: the next gesture resumes it
    if (this.ctx?.state !== 'running') this.fadeEngineNow();
    for (const f of [...this.stateListeners]) f();
  }

  /** AudioContext state for the UI ('none' until the first gesture creates it) */
  state(): string {
    return this.ctx?.state ?? 'none';
  }

  /** The "tap to turn sound on" banner is needed: sound is wanted (enabled, not muted) but the context is not running. */
  needsUnlock(): boolean {
    return this.enabled && !this.injected && !this.muted && this.state() !== 'running';
  }

  onStateChanged(fn: () => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  /** Wake the context (call inside a gesture) and run `fn` as soon as it is running; never runs it when audio is unavailable. */
  unlockThen(fn: () => void): void {
    this.unlock();
    const ctx = this.ctx as AudioContext | null;
    if (!ctx) return;
    if (ctx.state === 'running') fn();
    else void ctx.resume?.().then(() => ctx.state === 'running' && fn(), () => {});
  }

  /** The banner was tapped: wake the context and confirm with a short sound once it runs. */
  unlockWithConfirm(): void {
    this.unlockThen(() => this.confirm());
  }

  /** QA: put the context to sleep, as a phone call or an app switch would (the banner must come back) */
  debugSuspend(): void {
    void (this.ctx as AudioContext | null)?.suspend?.().catch(() => {});
  }

  /**
   * Hook the browser events that must silence the game: tab hidden / page frozen (suspend the context and mute the
   * engine, because rAF stops and nobody calls setEngine() any more) and the user gestures that unlock iOS audio.
   */
  attachLifecycle(win: Window = window, doc: Document = document): void {
    if (this.lifecycleAttached || this.injected) return;
    this.lifecycleAttached = true;
    const on = (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts);
      this.listeners.push([target, type, fn]);
    };
    const gesture = () => this.unlock();
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) on(win, type, gesture, { capture: true, passive: true });
    const vis = () => (doc.visibilityState === 'hidden' ? this.onHidden() : this.onVisible());
    on(doc, 'visibilitychange', vis);
    on(win, 'pagehide', () => this.onHidden());
    on(win, 'pageshow', () => doc.visibilityState !== 'hidden' && this.onVisible());
    // rAF can stall without the page being "hidden" (occluded window, background iframe): fade out if nobody feeds the engine
    this.watchdog = setInterval(() => {
      if (this.engineOut && performance.now() - this.lastEngineCall > AUDIO.ENGINE.WATCHDOG_MS) this.fadeEngineNow();
    }, 200);
  }

  detachLifecycle(): void {
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.listeners = [];
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.lifecycleAttached = false;
  }

  private onHidden(): void {
    this.hidden = true;
    this.fadeEngineNow();
    // let the (fast) fade render, then stop the whole audio thread; resume() on return
    if (this.injected || !this.ctx) return;
    setTimeout(() => {
      const ctx = this.ctx as AudioContext | null;
      if (this.hidden && ctx && ctx.state === 'running') void ctx.suspend?.().catch(() => {});
    }, 80);
  }

  private onVisible(): void {
    this.hidden = false;
    const ctx = this.ctx as AudioContext | null;
    if (ctx && !this.injected && ctx.state !== 'running') void ctx.resume?.().catch(() => {}); // may need a gesture on iOS: unlock() retries
  }

  /** Engine to silence right now (menus, results, disconnects, hidden tab). */
  private fadeEngineNow(): void {
    if (!this.engineOut || !this.ctx) return;
    const t = this.now();
    this.engineOut.gain.cancelScheduledValues(t);
    this.engineOut.gain.setTargetAtTime(0, t, 0.015);
    this.idleSince = -1;
  }

  // ---------------------------------------------------------------- mute
  isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.injected) saveMuted(m);
    this.applyMaster();
    for (const f of [...this.stateListeners]) f();
  }

  private masterTarget(): number {
    return this.muted ? 0 : AUDIO.MASTER_GAIN * this.volume;
  }

  private applyMaster(): void {
    if (this.master && this.ctx) {
      const t = this.now();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.masterTarget(), t, 0.015);
    }
  }

  // ---------------------------------------------------------------- volume
  getVolume(): number {
    return this.volume;
  }

  /** player's volume slider, 0..1 (linear on the master gain). Saved on this device. */
  setVolume(v: number): void {
    this.volume = clamp01(Number.isFinite(v) ? v : AUDIO.DEFAULT_VOLUME);
    if (!this.injected) saveVolume(this.volume);
    this.applyMaster();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ---------------------------------------------------------------- graph
  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.masterTarget();
    const comp = ctx.createDynamicsCompressor();
    const C = AUDIO.COMPRESSOR;
    comp.threshold.value = C.THRESHOLD;
    comp.knee.value = C.KNEE;
    comp.ratio.value = C.RATIO;
    comp.attack.value = C.ATTACK;
    comp.release.value = C.RELEASE;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = '2x';
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(comp).connect(clip).connect(ctx.destination);
    clip.connect(this.analyser);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = this.rand() * 2 - 1;
    this.startEngine();
  }

  /** deterministic noise (identical renders in tests) */
  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  private get ready(): boolean {
    if (!this.enabled || !this.ctx || !this.master) return false;
    return this.injected || this.ctx.state === 'running';
  }

  private now(): number {
    return (this.ctx?.currentTime ?? 0) + this.clockOffset;
  }

  /** ms clock for rate limiting: audio time when injected (deterministic), wall clock otherwise */
  private clockMs(): number {
    return this.injected ? this.now() * 1000 : performance.now();
  }

  private throttle(key: string, ms: number): boolean {
    return this.throttleMap.allow(key, ms, this.clockMs());
  }

  /** current state for tests / ?debug */
  info(): SfxInfo {
    let level = 0;
    if (this.analyser) {
      const buf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      level = Math.sqrt(sum / buf.length);
    }
    return {
      enabled: this.enabled,
      ctxState: this.ctx?.state ?? 'none',
      muted: this.muted,
      volume: this.volume,
      session: this.session.path,
      engineGain: this.engineOut?.gain.value ?? 0,
      masterGain: this.master?.gain.value ?? 0,
      level,
    };
  }

  // ---------------------------------------------------------------- engine ("putt-putt" scooter)
  private startEngine(): void {
    const ctx = this.ctx!;
    const E = AUDIO.ENGINE;
    this.engineOut = ctx.createGain();
    this.engineOut.gain.value = 0;
    this.engineOut.connect(this.master!);
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 0.6;
    this.engineFilter.frequency.value = E.CUTOFF_IDLE;
    // amplitude modulation at the firing rate = the putt-putt
    const amp = ctx.createGain();
    amp.gain.value = 0.2;
    this.engineFilter.connect(amp).connect(this.engineOut);
    const { real, imag } = puttWave();
    this.lfo = ctx.createOscillator();
    this.lfo.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    this.lfo.frequency.value = E.FIRE_HZ_IDLE;
    const depth = ctx.createGain();
    depth.gain.value = 0.8;
    this.lfo.connect(depth).connect(amp.gain);
    this.lfo.start();
    // mid-frequency harmonic layer (v0.3): 4x / 6x / 8x the body pitch = 300-1200 Hz, which phone speakers CAN reproduce.
    // It shares the putt amplitude modulation, so the engine stays "putt-putt" and is now audible on a phone.
    this.harmFilter = ctx.createBiquadFilter();
    this.harmFilter.type = 'bandpass';
    this.harmFilter.Q.value = 0.8;
    this.harmFilter.frequency.value = E.CUTOFF_IDLE * 0.9;
    const harmGain = ctx.createGain();
    harmGain.gain.value = E.HARMONIC_MIX;
    this.harmFilter.connect(harmGain).connect(amp);
    for (const [type, mult, gain] of [['sawtooth', 4, 0.5], ['square', 6, 0.28], ['sawtooth', 8, 0.22]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = E.PITCH_IDLE * mult;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(this.harmFilter);
      osc.start();
      this.engineOscs.push({ osc, mult });
    }
    // soft body: triangle + sub sine + a whisper of sawtooth for the exhaust rasp
    for (const [type, mult, gain] of [['triangle', 1, 0.6], ['sine', 0.5, 0.3], ['sawtooth', 2, 0.16]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = E.PITCH_IDLE * mult;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(this.engineFilter);
      osc.start();
      this.engineOscs.push({ osc, mult });
    }
  }

  /**
   * Call every frame while riding. speed01: 0..1 of max speed; throttle 0..1; active=false silences the engine
   * (menu / lobby / results / disconnect). Ignored while the tab is hidden.
   */
  setEngine(speed01: number, throttle: number, active = true): void {
    this.lastEngineCall = performance.now();
    if (!this.ready || !this.engineOut || !this.engineFilter || !this.lfo) return;
    const t = this.now();
    if (!active || this.hidden || this.muted) {
      this.engineOut.gain.setTargetAtTime(0, t, 0.05);
      this.idleSince = -1;
      return;
    }
    const nowS = this.clockMs() / 1000;
    if (isIdling(speed01, throttle)) {
      if (this.idleSince < 0) this.idleSince = nowS;
    } else this.idleSince = -1;
    const idleFor = this.idleSince < 0 ? 0 : nowS - this.idleSince;
    const tg = engineTargets(speed01, throttle, idleFor);
    for (const { osc, mult } of this.engineOscs) osc.frequency.setTargetAtTime(tg.pitch * mult, t, 0.08);
    this.lfo.frequency.setTargetAtTime(tg.fireHz, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(tg.cutoff, t, 0.08);
    this.harmFilter?.frequency.setTargetAtTime(tg.cutoff * 0.9, t, 0.08);
    this.engineOut.gain.setTargetAtTime(tg.level, t, tg.level === 0 ? AUDIO.ENGINE.IDLE_FADE_TC : 0.1);
  }

  // ---------------------------------------------------------------- one-shots
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
    src.start(t0, this.rand() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  /** Two-tone scooter horn. volume 0..1 (lower for far-away riders). */
  horn(volume = 1): void {
    if (!this.ready || this.muted || !this.throttle('horn', 120)) return;
    const ctx = this.ctx!;
    const t = this.now();
    const bus = ctx.createGain();
    bus.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    bus.connect(lp).connect(this.master!);
    const peak = (AUDIO.HORN_PEAK / 2) * Math.min(1, Math.max(0, volume));
    for (const [i, f] of [[0, 392], [0, 494], [1, 392], [1, 494]] as const) {
      this.tone('square', f, f * 0.98, t + i * 0.2, 0.16, peak, bus);
    }
  }

  dogBark(): void {
    if (!this.ready || this.muted || !this.throttle('dog', 300)) return;
    const ctx = this.ctx!;
    const t = this.now();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(this.master!);
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * 0.22;
      this.tone('sawtooth', 420, 190, t0, 0.13, AUDIO.DOG_PEAK * 0.7, lp);
      this.noiseBurst(t0, 0.1, AUDIO.DOG_PEAK * 0.4, 'bandpass', 1400, 700, 2);
    }
  }

  /**
   * Soup spilling. Small amounts -> a light "drip" tick, big ones (or a crash) -> a real splash. Both are rate
   * limited, so a continuous spill can never machine-gun the sound.
   */
  spill(amount: number, forceBig = false): void {
    if (!this.ready || this.muted) return;
    const kind = forceBig ? 'splash' : spillSound(amount);
    if (kind === 'splash') this.splash(Math.min(1, 0.4 + amount * 3));
    else this.drip(Math.min(1, amount / AUDIO.SPLASH_BIG_AMOUNT));
  }

  splash(intensity = 0.5): void {
    if (!this.ready || this.muted || !this.throttle('splash', AUDIO.SPLASH_MIN_GAP_MS)) return;
    const t = this.now();
    const k = 0.7 + 0.3 * intensity;
    this.noiseBurst(t, 0.28 + 0.2 * intensity, AUDIO.SPLASH_BIG_PEAK * k, 'bandpass', 2200, 500, 0.9);
  }

  /** a soft "tick-tock" of a few drops */
  drip(intensity = 0.5): void {
    if (!this.ready || this.muted || !this.throttle('drip', AUDIO.DRIP_MIN_GAP_MS)) return;
    const t = this.now();
    const p = AUDIO.DRIP_PEAK * (0.6 + 0.4 * intensity);
    this.tone('sine', 1100, 620, t, 0.07, p);
    this.tone('sine', 900, 520, t + 0.09, 0.06, p * 0.7);
  }

  crash(): void {
    if (!this.ready || this.muted || !this.throttle('crash', 300)) return;
    const t = this.now();
    this.noiseBurst(t, 0.5, AUDIO.CRASH_PEAK * 0.62, 'lowpass', 1600, 140, 0.7);
    this.tone('sine', 110, 46, t, 0.32, AUDIO.CRASH_PEAK * 0.5); // was 0.6 at 120 -> 38 Hz: far too boomy
    this.tone('square', 210, 70, t, 0.14, AUDIO.CRASH_PEAK * 0.12);
  }

  thud(intensity = 0.5): void {
    if (!this.ready || this.muted || !this.throttle('thud', 120)) return;
    const t = this.now();
    const k = Math.min(1, Math.max(0, intensity));
    this.tone('sine', 110, 50, t, 0.14, AUDIO.THUD_PEAK * (0.45 + 0.55 * k));
    this.noiseBurst(t, 0.06, AUDIO.THUD_PEAK * 0.4 * k, 'lowpass', 900, 200);
  }

  /** delivery "ding-dong" (`delay` s later: the volume test plays horn, then chime) */
  chime(delay = 0): void {
    if (!this.ready || this.muted) return;
    const t = this.now() + delay;
    const p = AUDIO.CHIME_PEAK;
    this.tone('sine', 1318, 1318, t, 0.5, p);
    this.tone('sine', 1046, 1046, t + 0.16, 0.7, p);
    this.tone('sine', 2637, 2637, t, 0.25, p * 0.22);
  }

  /** pickup blip */
  pickup(): void {
    if (!this.ready || this.muted) return;
    const t = this.now();
    this.tone('triangle', 660, 660, t, 0.12, AUDIO.PICKUP_PEAK);
    this.tone('triangle', 990, 990, t + 0.09, 0.18, AUDIO.PICKUP_PEAK);
  }

  /** Quick-chat sound: every preset has its own short phrase (see PING_NOTES). `volume` 0..1 for far-away riders. */
  ping(id: PingId, volume = 1): void {
    if (!this.ready || this.muted || !this.throttle('ping', 150)) return;
    const ctx = this.ctx!;
    const t = this.now();
    const { type, notes } = pingNotes(id);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = type === 'square' ? 2200 : 5000;
    lp.connect(this.master!);
    const peak = AUDIO.PING_PEAK * Math.min(1, Math.max(0.25, volume));
    for (const n of notes) this.tone(type, n.f, n.f, t + n.at, n.dur, peak, lp);
  }

  /** a teammate's cargo was saved: bright coin-collect arpeggio */
  salvage(): void {
    if (!this.ready || this.muted || !this.throttle('salvage', 300)) return;
    const t = this.now();
    const p = AUDIO.SALVAGE_PEAK;
    [784, 988, 1319, 1568].forEach((f, i) => {
      this.tone('triangle', f, f, t + i * 0.075, 0.22, p);
      this.tone('sine', f * 2, f * 2, t + i * 0.075, 0.12, p * 0.25);
    });
  }

  /** the "sound is on" confirmation after the banner was tapped */
  confirm(): void {
    if (!this.ready || this.muted) return;
    const t = this.now();
    this.tone('triangle', 784, 784, t, 0.12, AUDIO.PICKUP_PEAK);
    this.tone('triangle', 1175, 1175, t + 0.1, 0.22, AUDIO.PICKUP_PEAK);
  }

  /** volume-slider test: horn, then the delivery chime */
  testSound(): void {
    this.horn(1);
    this.chime(0.62);
  }

  pop(): void {
    if (!this.ready || this.muted || !this.throttle('pop', 80)) return;
    this.tone('sine', 520, 180, this.now(), 0.12, AUDIO.POP_PEAK);
  }

  fail(): void {
    if (!this.ready || this.muted || !this.throttle('fail', 200)) return;
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(this.master!);
    this.tone('sawtooth', 220, 110, this.now(), 0.3, AUDIO.FAIL_PEAK, lp);
  }

  dispose(): void {
    this.detachLifecycle();
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function loadVolume(): number {
  const raw = safeStorage.getItem(VOLUME_KEY);
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) ? clamp01(v) : AUDIO.DEFAULT_VOLUME;
}

function saveVolume(v: number): void {
  safeStorage.setItem(VOLUME_KEY, String(Math.round(v * 100) / 100));
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* storage may be blocked */
  }
}
