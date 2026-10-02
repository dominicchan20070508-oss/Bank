import { describe, expect, it } from 'vitest';
import { AUDIO } from '../src/shared/constants';
import { ENGINE_MAX_LEVEL, Throttle, engineTargets, isIdling, puttWave, softClipCurve, spillSound } from '../src/client/audioLogic';

describe('engine (putt-putt)', () => {
  it('is far quieter than the horn: full throttle gain <= 30% of the horn peak', () => {
    const full = engineTargets(1, 1);
    expect(full.level).toBeLessThanOrEqual(AUDIO.HORN_PEAK * 0.3 + 1e-9);
    expect(ENGINE_MAX_LEVEL).toBeCloseTo(AUDIO.HORN_PEAK * AUDIO.ENGINE.MAX_VS_HORN, 9);
  });

  it('idle is very light, throttle is clearly louder, and pitch / putt rate rise with speed', () => {
    const idle = engineTargets(0, 0, 0);
    const half = engineTargets(0.5, 0.7);
    const full = engineTargets(1, 1);
    expect(idle.level).toBeGreaterThan(0);
    expect(idle.level).toBeLessThan(half.level);
    expect(half.level).toBeLessThan(full.level);
    expect(idle.fireHz).toBeLessThan(half.fireHz);
    expect(half.fireHz).toBeLessThan(full.fireHz);
    expect(idle.pitch).toBeLessThan(full.pitch);
    expect(idle.cutoff).toBeLessThan(full.cutoff);
    expect(full.fireHz).toBeLessThanOrEqual(AUDIO.ENGINE.FIRE_HZ_MAX);
  });

  it('standing still without throttle fades to silence after IDLE_FADE_AFTER, but not before', () => {
    expect(isIdling(0, 0)).toBe(true);
    expect(isIdling(0.02, 0.01)).toBe(true);
    expect(isIdling(0.3, 0)).toBe(false);
    expect(isIdling(0, 0.5)).toBe(false);
    expect(engineTargets(0, 0, AUDIO.ENGINE.IDLE_FADE_AFTER - 0.1).level).toBeGreaterThan(0);
    expect(engineTargets(0, 0, AUDIO.ENGINE.IDLE_FADE_AFTER).level).toBe(0);
    // touching the throttle (or rolling) brings it back no matter how long we idled
    expect(engineTargets(0, 0.5, 10).level).toBeGreaterThan(0);
    expect(engineTargets(0.4, 0, 10).level).toBeGreaterThan(0);
  });
});

describe('soup spill sounds (A4)', () => {
  it('small amounts are a drip, only big gulps are a splash', () => {
    expect(spillSound(0.001)).toBe('drip');
    expect(spillSound(AUDIO.SPLASH_BIG_AMOUNT - 0.01)).toBe('drip');
    expect(spillSound(AUDIO.SPLASH_BIG_AMOUNT)).toBe('splash');
    expect(spillSound(0.5)).toBe('splash');
  });

  it('the splash gap is at least 600 ms (no 250 ms spam)', () => {
    expect(AUDIO.SPLASH_MIN_GAP_MS).toBeGreaterThanOrEqual(600);
    const th = new Throttle();
    let played = 0;
    for (let ms = 0; ms < 3000; ms += 50) if (th.allow('splash', AUDIO.SPLASH_MIN_GAP_MS, ms)) played++;
    expect(played).toBeLessThanOrEqual(Math.ceil(3000 / AUDIO.SPLASH_MIN_GAP_MS));
    expect(played).toBeGreaterThanOrEqual(4);
  });

  it('throttle keys are independent', () => {
    const th = new Throttle();
    expect(th.allow('a', 500, 0)).toBe(true);
    expect(th.allow('a', 500, 100)).toBe(false);
    expect(th.allow('b', 500, 100)).toBe(true);
    expect(th.allow('a', 500, 500)).toBe(true);
  });
});

describe('master bus', () => {
  it('compressor settings follow the spec', () => {
    expect(AUDIO.COMPRESSOR).toMatchObject({ THRESHOLD: -14, RATIO: 8, ATTACK: 0.003, RELEASE: 0.15 });
  });

  it('the soft clipper is transparent below the knee and never reaches full scale', () => {
    const c = softClipCurve(2001);
    const at = (x: number) => c[Math.round(((x + 1) / 2) * 2000)]!;
    expect(at(0.5)).toBeCloseTo(0.5, 3);
    expect(at(-0.7)).toBeCloseTo(-0.7, 3);
    let max = 0;
    for (const v of c) max = Math.max(max, Math.abs(v));
    expect(max).toBeLessThan(0.99);
    expect(max).toBeLessThanOrEqual(AUDIO.SOFTCLIP.CEILING);
    // monotonic
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
  });

  it('the putt waveform is a pulse: strong attack, and has energy on the first harmonics', () => {
    const { real, imag } = puttWave(32);
    expect(real.length).toBe(33);
    expect(Math.hypot(real[1]!, imag[1]!)).toBeGreaterThan(0.2);
    expect(real[0]).toBe(0);
  });
});
