// Pure helpers behind audio.ts (no Web Audio, no DOM) so the numbers can be unit-tested.
import { AUDIO } from '../shared/constants';
import type { PingId } from '../shared/pings';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export interface EngineTargets {
  fireHz: number; // putt-putt rate
  pitch: number; // Hz of the body tone
  cutoff: number; // low-pass Hz
  level: number; // output gain (0 = silent)
}

/** How hard the engine is working, 0..1. */
export function engineDrive(speed01: number, throttle: number): number {
  return clamp01(0.35 * clamp01(speed01) + 0.65 * clamp01(throttle));
}

/** True when the bike is standing still with the throttle released (the engine is only idling). */
export function isIdling(speed01: number, throttle: number): boolean {
  return throttle < 0.05 && speed01 < 0.04;
}

/** Maximum engine output gain: a fixed fraction of the horn so the engine never competes with it. */
export const ENGINE_MAX_LEVEL = AUDIO.HORN_PEAK * AUDIO.ENGINE.MAX_VS_HORN;

/**
 * Engine parameters for the current riding state. `idleFor` = seconds spent idling (standing still, no throttle);
 * past ENGINE.IDLE_FADE_AFTER the level drops to 0 (the caller smooths it with ENGINE.IDLE_FADE_TC).
 */
export function engineTargets(speed01: number, throttle: number, idleFor = 0): EngineTargets {
  const E = AUDIO.ENGINE;
  const drive = engineDrive(speed01, throttle);
  const idleLevel = ENGINE_MAX_LEVEL * E.IDLE_VS_MAX;
  let level = lerp(idleLevel, ENGINE_MAX_LEVEL, drive);
  if (isIdling(speed01, throttle) && idleFor >= E.IDLE_FADE_AFTER) level = 0;
  return {
    fireHz: lerp(E.FIRE_HZ_IDLE, E.FIRE_HZ_MAX, drive),
    pitch: lerp(E.PITCH_IDLE, E.PITCH_MAX, drive),
    cutoff: lerp(E.CUTOFF_IDLE, E.CUTOFF_MAX, drive),
    level,
  };
}

export interface PingNote {
  f: number; // Hz
  at: number; // s after the start
  dur: number; // s
}

/** One distinct short phrase per quick-chat preset (DESIGN §14.3: "每条有自己的短提示音"). */
export function pingNotes(id: PingId): { type: OscillatorType; notes: PingNote[] } {
  switch (id) {
    case 'claim': // "got it": two quick rising notes
      return { type: 'triangle', notes: [{ f: 659, at: 0, dur: 0.13 }, { f: 880, at: 0.1, dur: 0.2 }] };
    case 'help': // SOS: urgent alternating pair, three times
      return { type: 'square', notes: [880, 660, 880, 660].map((f, i) => ({ f, at: i * 0.1, dur: 0.1 })) };
    case 'wait': // soft low double tap
      return { type: 'sine', notes: [{ f: 440, at: 0, dur: 0.16 }, { f: 440, at: 0.2, dur: 0.22 }] };
    case 'follow': // little rising run
      return { type: 'triangle', notes: [523, 659, 784].map((f, i) => ({ f, at: i * 0.07, dur: 0.14 })) };
    case 'thanks': // warm falling third
      return { type: 'sine', notes: [{ f: 880, at: 0, dur: 0.16 }, { f: 698, at: 0.13, dur: 0.3 }] };
    case 'nice': // bright major arpeggio
      return { type: 'triangle', notes: [784, 988, 1175].map((f, i) => ({ f, at: i * 0.08, dur: 0.2 })) };
  }
}

/** Soup spilled since the last sound -> a light drip tick or a real splash. */
export function spillSound(amount: number): 'drip' | 'splash' {
  return amount >= AUDIO.SPLASH_BIG_AMOUNT ? 'splash' : 'drip';
}

/** Rate limiter keyed by sound name. `now` in ms. */
export class Throttle {
  private readonly last = new Map<string, number>();
  allow(key: string, gapMs: number, now: number): boolean {
    if (now - (this.last.get(key) ?? -1e12) < gapMs) return false;
    this.last.set(key, now);
    return true;
  }
}

/**
 * Fourier coefficients of one "putt": a sharp attack followed by an exponential decay, repeated at the firing rate.
 * (PeriodicWave ignores the DC term and normalises the peak to 1; the caller adds an offset so the trough sits at 0.)
 */
export function puttWave(harmonics = 48, decay: number = AUDIO.ENGINE.PULSE_DECAY): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  const N = 1024;
  for (let k = 1; k <= harmonics; k++) {
    let a = 0;
    let b = 0;
    for (let i = 0; i < N; i++) {
      const ph = i / N;
      const v = Math.exp(-decay * ph);
      a += v * Math.cos(2 * Math.PI * k * ph);
      b += v * Math.sin(2 * Math.PI * k * ph);
    }
    real[k] = (2 * a) / N;
    imag[k] = (2 * b) / N;
  }
  return { real, imag };
}

/** Waveshaper curve: identity up to LINEAR_UNTIL, then a smooth knee that tops out below CEILING (< 1). */
export function softClipCurve(size = 2048): Float32Array<ArrayBuffer> {
  const { LINEAR_UNTIL: L, CEILING: C } = AUDIO.SOFTCLIP;
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const room = C - L;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a <= L ? x : Math.sign(x) * (L + room * Math.tanh((a - L) / room));
  }
  return curve;
}
