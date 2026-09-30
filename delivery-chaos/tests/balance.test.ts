import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/shared/constants';
import { createBalance, isFeetDown, isTipped, kick, leanTarget, stepBalance, stiffness, wobble } from '../src/sim/balance';

const DT = 1 / 60;

function sim(seconds: number, f: (t: number) => { steer?: number; speed: number; throttle?: number; aLat?: number; extra?: number }, seed = 1) {
  const s = createBalance(seed);
  let maxLean = 0;
  let tippedAt = -1;
  for (let t = 0; t < seconds; t += DT) {
    const i = f(t);
    stepBalance(s, { dt: DT, steer: i.steer ?? 0, speed: i.speed, throttle: i.throttle ?? 0, aLat: i.aLat ?? 0, extra: i.extra });
    maxLean = Math.max(maxLean, Math.abs(s.lean));
    if (tippedAt < 0 && isTipped(s)) tippedAt = t;
  }
  return { s, maxLean, tippedAt };
}

describe('balance model', () => {
  it('stiffness: gyroscopic with speed, 40 with feet down', () => {
    expect(stiffness(0, false)).toBe(BALANCE.K_BASE);
    expect(stiffness(6, false)).toBe(BALANCE.K_BASE + BALANCE.K_SPEED);
    expect(stiffness(20, false)).toBe(BALANCE.K_BASE + BALANCE.K_SPEED);
    expect(stiffness(0, true)).toBe(40);
    expect(isFeetDown(0.5, 0)).toBe(true);
    expect(isFeetDown(0.5, 1)).toBe(false); // throttle held: no foot down
    expect(isFeetDown(3, 0)).toBe(false);
  });

  it('lean target follows steering (right = +) and speed', () => {
    expect(leanTarget(1, 16)).toBeCloseTo(0.5);
    expect(leanTarget(-1, 16)).toBeCloseTo(-0.5);
    expect(leanTarget(1, 4)).toBeCloseTo(0.25);
    expect(leanTarget(1, 0)).toBe(0);
  });

  it('standing still with feet down does not tip (even for a long time)', () => {
    const r = sim(60, () => ({ speed: 0, throttle: 0 }));
    expect(r.tippedAt).toBe(-1);
    expect(r.maxLean).toBeLessThan(0.15);
  });

  it('a wobbling low-speed rider stays up but visibly sways', () => {
    const r = sim(30, () => ({ speed: 2.5, throttle: 0.3 }));
    expect(r.tippedAt).toBe(-1);
    expect(r.maxLean).toBeGreaterThan(0.06);
    expect(r.maxLean).toBeLessThan(0.6);
    // ... and it settles down once you are up to speed
    const fast = sim(30, () => ({ speed: 8, throttle: 0.6 }));
    expect(fast.maxLean).toBeLessThan(0.01);
  });

  it('a big disturbance at low speed tips the bike over', () => {
    const r = sim(3, (t) => ({ speed: 1.5, throttle: 0.4, extra: t < 0.5 ? 18 : 0 }));
    expect(r.tippedAt).toBeGreaterThan(0);
  });

  it('the same push at speed is shrugged off', () => {
    const r = sim(3, (t) => ({ speed: 14, throttle: 0.8, extra: t < 0.5 ? 18 : 0 }));
    expect(r.tippedAt).toBe(-1);
  });

  it('an impulse kick that flips a slow bike does not flip a fast one', () => {
    const slow = createBalance();
    const fast = createBalance();
    kick(slow, 9);
    kick(fast, 9);
    let slowTipped = false;
    let fastTipped = false;
    for (let t = 0; t < 3; t += DT) {
      stepBalance(slow, { dt: DT, steer: 0, speed: 1.5, throttle: 0.3, aLat: 0 });
      stepBalance(fast, { dt: DT, steer: 0, speed: 12, throttle: 0.8, aLat: 0 });
      slowTipped ||= isTipped(slow);
      fastTipped ||= isTipped(fast);
    }
    expect(slowTipped).toBe(true);
    expect(fastTipped).toBe(false);
  });

  it('a hard steady turn at top speed leans into the corner without tipping', () => {
    const r = sim(6, () => ({ speed: 16, throttle: 1, steer: 1, aLat: 19 }));
    expect(r.tippedAt).toBe(-1);
    expect(r.s.lean).toBeGreaterThan(0.25);
    expect(r.s.lean).toBeLessThan(0.55);
    const left = sim(6, () => ({ speed: 16, throttle: 1, steer: -1, aLat: -19 }));
    expect(left.s.lean).toBeLessThan(-0.25);
  });

  it('wobble fades out with speed and is deterministic per seed', () => {
    const a = createBalance(3);
    const b = createBalance(3);
    a.time = b.time = 1.234;
    expect(wobble(a, 1, false)).toBe(wobble(b, 1, false));
    let peakSlow = 0;
    let peakFast = 0;
    for (let t = 0; t < 10; t += 0.05) {
      a.time = t;
      peakSlow = Math.max(peakSlow, Math.abs(wobble(a, 1, false)));
      peakFast = Math.max(peakFast, Math.abs(wobble(a, 6, false)));
    }
    expect(peakSlow).toBeGreaterThan(0.2); // radians of lean-target wobble while creeping
    expect(peakFast).toBe(0);
  });
});
