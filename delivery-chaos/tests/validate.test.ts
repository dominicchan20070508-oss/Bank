import { describe, expect, it } from 'vitest';
import { TokenBucket, clampLength, parseClientMsg, sanitizeCargo, sanitizeName, sanitizeVec3 } from '../src/shared/validate';

describe('validate', () => {
  it('sanitizeVec3 accepts only length-3 arrays of bounded finite numbers', () => {
    expect(sanitizeVec3([1, 2, 3])).toEqual([1, 2, 3]);
    for (const bad of [[1, 2], [1, 2, 3, 4], [1, 2, NaN], [1, 2, Infinity], ['1', 2, 3], [1, 2, null], 'abc', null, undefined, {}, [1e9, 0, 0]]) {
      expect(sanitizeVec3(bad)).toBeNull();
    }
  });

  it('clampLength keeps direction', () => {
    expect(clampLength([3, 4, 0], 10)).toEqual([3, 4, 0]);
    const v = clampLength([30, 40, 0], 10);
    expect(v[0]).toBeCloseTo(6);
    expect(v[1]).toBeCloseTo(8);
  });

  it('sanitizeCargo returns a fresh, clamped, four-field object or null', () => {
    const c = sanitizeCargo({ kind: 'soup', a: 0.5, b: 0.1, c: -0.2, junk: 1 });
    expect(c).toEqual({ kind: 'soup', a: 0.5, b: 0.1, c: -0.2 });
    expect(Object.keys(c!).sort()).toEqual(['a', 'b', 'c', 'kind']);
    expect(sanitizeCargo({ kind: 'sushi', a: 1, b: 1, c: 1 })).toBeNull();
    expect(sanitizeCargo({ kind: 'soup', a: 1, b: 1 })).toBeNull();
    expect(sanitizeCargo(null)).toBeNull();
    expect(sanitizeCargo('soup')).toBeNull();
    expect(sanitizeCargo({ kind: 'ice', a: -5, b: 99, c: -99 })).toEqual({ kind: 'ice', a: 0, b: 5, c: -5 });
  });

  it('sanitizeName strips markup/control chars and clamps to 12', () => {
    expect(sanitizeName('  小明  ')).toBe('小明');
    expect(sanitizeName('<img src=x onerror=1>')).toBe('img src=x onerror=1'.slice(0, 12).trim());
    expect(sanitizeName('a'.repeat(50))).toHaveLength(12);
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName('a\u0000b\nc')).toBe('abc');
  });

  it('TokenBucket allows a burst, then the sustained rate', () => {
    const b = new TokenBucket(10, 10);
    let ok = 0;
    for (let i = 0; i < 100; i++) if (b.take(i * 0.001)) ok++;
    expect(ok).toBe(10);
    let later = 0;
    for (let i = 0; i < 100; i++) if (b.take(1 + i * 0.01)) later++; // 100/s for 1 s, after ~0.9 s of refill (9 tokens)
    expect(later).toBeGreaterThanOrEqual(18);
    expect(later).toBeLessThanOrEqual(20);
  });

  it('parseClientMsg copies only known fields and drops everything malformed', () => {
    expect(parseClientMsg({ type: 'honk', extra: 'x' })).toEqual({ type: 'honk' });
    expect(parseClientMsg({ type: 'joinRoom', code: ' abcd ' })).toEqual({ type: 'joinRoom', code: 'ABCD' });
    expect(parseClientMsg({ type: 'startGame', seed: 3.7, duration: 99999 })).toEqual({ type: 'startGame', seed: 3 });
    expect(parseClientMsg({ type: 'state', t: 1, p: [1, 2, 3], h: 0, l: 0, v: 1, crashed: 'yes', cargo: { kind: 'pizza', a: 1, b: 0, c: 0, x: 1 } })).toEqual({
      type: 'state', t: 1, p: [1, 2, 3], h: 0, l: 0, v: 1, crashed: false, cargo: { kind: 'pizza', a: 1, b: 0, c: 0 },
    });
    for (const bad of [null, 42, 'x', [], {}, { type: 'nope' }, { type: 'pickup' }, { type: 'pickup', orderId: 7 }, { type: 'pickup', orderId: 'x'.repeat(100) }, { type: 'stat', key: 'hax', delta: 1 }, { type: 'stat', key: 'crashes', delta: NaN }, { type: 'ping', t: 'x' }, { type: 'deliver', orderId: 'o1', integrity: 'lots' }, { type: 'state', t: 1, p: [1], h: 0, l: 0, v: 0 }]) {
      expect(parseClientMsg(bad)).toBeNull();
    }
  });
});
