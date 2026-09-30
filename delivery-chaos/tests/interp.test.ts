import { describe, expect, it } from 'vitest';
import { InterpBuffer, toSample, type Sample } from '../src/client/interp';
import type { PlayerStateMsg } from '../src/shared/protocol';

const S = (t: number, x: number, extra: Partial<Sample> = {}): Sample => ({ t, x, y: 0.5, z: 0, h: 0, l: 0, v: 10, crashed: false, cargo: null, ...extra });

describe('InterpBuffer', () => {
  it('returns null before any data and the only sample afterwards', () => {
    const b = new InterpBuffer();
    expect(b.sample(1)).toBeNull();
    b.push(S(1, 5));
    expect(b.sample(0.5)!.x).toBe(5);
  });

  it('interpolates linearly between the bracketing samples', () => {
    const b = new InterpBuffer();
    b.push(S(1.0, 0));
    b.push(S(1.05, 1));
    b.push(S(1.10, 3));
    expect(b.sample(1.025)!.x).toBeCloseTo(0.5);
    expect(b.sample(1.075)!.x).toBeCloseTo(2);
    expect(b.sample(1.05)!.x).toBeCloseTo(1);
  });

  it('takes the short way around for angles', () => {
    const b = new InterpBuffer();
    b.push(S(0, 0, { h: Math.PI - 0.1 }));
    b.push(S(1, 0, { h: -Math.PI + 0.1 }));
    const mid = b.sample(0.5)!.h;
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.01); // passes through +-PI, not through 0
  });

  it('extrapolates briefly along the heading, then freezes; ignores stale packets', () => {
    const b = new InterpBuffer();
    b.push(S(1, 0, { h: Math.PI / 2, v: 10 })); // heading +x
    b.push(S(1.05, 0.5, { h: Math.PI / 2, v: 10 }));
    expect(b.sample(1.10)!.x).toBeCloseTo(1.0, 2);
    expect(b.sample(5)!.x).toBeCloseTo(0.5 + 10 * 0.2, 2); // capped at 200 ms
    b.push(S(0.5, 99)); // late arrival: dropped
    expect(b.length).toBe(2);
  });

  it('does not dead-reckon a crashed or stopped rider, and interpolates the cargo summary', () => {
    const b = new InterpBuffer();
    b.push(S(0, 0, { crashed: true, cargo: { kind: 'pizza', a: 4, b: 0, c: 0 } }));
    expect(b.sample(0.15)!.x).toBe(0);
    const c = new InterpBuffer();
    c.push(S(0, 0, { cargo: { kind: 'pizza', a: 4, b: 0, c: 0 } }));
    c.push(S(1, 0, { cargo: { kind: 'pizza', a: 3, b: 0.2, c: -0.2 } }));
    const m = c.sample(0.5)!.cargo!;
    expect(m.a).toBe(3);
    expect(m.b).toBeCloseTo(0.1);
    expect(m.c).toBeCloseTo(-0.1);
  });

  it('keeps the history bounded', () => {
    const b = new InterpBuffer();
    for (let i = 0; i < 400; i++) b.push(S(i * 0.05, i));
    expect(b.length).toBeLessThan(40);
  });
});

describe('toSample (never trust the network)', () => {
  const good: PlayerStateMsg = { t: 5, p: [1, 2, 3], h: 0.5, l: 0.1, v: 4, crashed: false, cargo: { kind: 'pizza', a: 3, b: 0.1, c: -0.1 } };

  it('accepts a well-formed state', () => {
    expect(toSample(5, good)).toEqual({ t: 5, x: 1, y: 2, z: 3, h: 0.5, l: 0.1, v: 4, crashed: false, cargo: { kind: 'pizza', a: 3, b: 0.1, c: -0.1 } });
  });

  it('rejects non-finite or malformed values instead of feeding them to the renderer', () => {
    const bad = (patch: Record<string, unknown>) => toSample(5, { ...good, ...patch } as unknown as PlayerStateMsg);
    expect(bad({ p: [1, NaN, 3] })).toBeNull();
    expect(bad({ p: [1, 2] })).toBeNull();
    expect(bad({ p: 'x' })).toBeNull();
    expect(bad({ h: Infinity })).toBeNull();
    expect(bad({ l: undefined })).toBeNull();
    expect(bad({ v: null })).toBeNull();
    expect(toSample(NaN, good)).toBeNull();
    expect(toSample(5, null as unknown as PlayerStateMsg)).toBeNull();
  });

  it('drops a broken cargo summary but keeps the rider', () => {
    expect(bad2({ kind: 'bomb', a: 1, b: 0, c: 0 })?.cargo).toBeNull();
    expect(bad2({ kind: 'soup', a: NaN, b: 0, c: 0 })?.cargo).toBeNull();
    expect(bad2('soup')?.cargo).toBeNull();
    expect(bad2({ kind: 'soup', a: 1, b: 0, c: 0 })?.cargo).toEqual({ kind: 'soup', a: 1, b: 0, c: 0 });
    function bad2(cargo: unknown) {
      return toSample(5, { ...good, cargo } as unknown as PlayerStateMsg);
    }
  });
});
