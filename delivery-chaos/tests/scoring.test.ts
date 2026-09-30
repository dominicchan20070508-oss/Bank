import { describe, expect, it } from 'vitest';
import { baseTip, computeTip, emptyStats, integrityQuote, pickAwards, starsFor, starThresholds, type TipInput } from '../src/shared/scoring';

const base: TipInput = { distance: 100, food: 'soup', size: 1, integrity: 1, elapsed: 0, timeLimit: 40, request: null, requestOk: null };

describe('tip formula (DESIGN §7)', () => {
  it('base = 10 + distance*0.08 + size bonus', () => {
    expect(baseTip(100, 'soup', 1)).toBeCloseTo(18);
    expect(baseTip(100, 'pizza', 2)).toBeCloseTo(22); // +4 per extra box
    expect(baseTip(100, 'pizza', 5)).toBeCloseTo(34);
    expect(baseTip(100, 'ice', 3)).toBeCloseTo(24); // +3 per extra scoop
  });

  it('perfect delivery with half the time left earns 1.25x base', () => {
    const r = computeTip({ ...base, elapsed: 20 });
    expect(r.timeMult).toBeCloseTo(1.25);
    expect(r.tip).toBe(Math.round(18 * 1 * 1.25)); // 23 (22.5 rounds up)
    expect(r.onTime).toBe(true);
  });

  it('integrity scales the tip by 0.3 + 0.7*integrity', () => {
    const half = computeTip({ ...base, integrity: 0.5, elapsed: 40 }); // timeMult = 1.0 exactly at the deadline
    expect(half.tip).toBe(Math.round(18 * (0.3 + 0.7 * 0.5)));
    const low = computeTip({ ...base, integrity: 0.1, elapsed: 40 });
    expect(low.tip).toBe(Math.round(18 * (0.3 + 0.7 * 0.1)));
    expect(computeTip({ ...base, integrity: 1, elapsed: 40 }).tip).toBeGreaterThan(half.tip);
  });

  it('integrity 0 => tip 0, whatever the bonuses', () => {
    const r = computeTip({ ...base, integrity: 0, request: 'rush', requestOk: true });
    expect(r.tip).toBe(0);
  });

  it('late delivery halves the time multiplier', () => {
    const r = computeTip({ ...base, elapsed: 60 });
    expect(r.onTime).toBe(false);
    expect(r.timeMult).toBe(0.5);
    expect(r.tip).toBe(Math.round(18 * 0.5));
    expect(r.secondsDelta).toBe(-20);
  });

  it('special request bonuses: +8 ok, +15 rush ok, -8 fail; never below zero', () => {
    const t0 = computeTip({ ...base, elapsed: 40 }).tip; // 18
    expect(computeTip({ ...base, elapsed: 40, request: 'noHorn', requestOk: true }).tip).toBe(t0 + 8);
    expect(computeTip({ ...base, elapsed: 40, request: 'gentle', requestOk: true }).tip).toBe(t0 + 8);
    expect(computeTip({ ...base, elapsed: 40, request: 'backDoor', requestOk: true }).tip).toBe(t0 + 8);
    expect(computeTip({ ...base, elapsed: 40, request: 'rush', requestOk: true }).tip).toBe(t0 + 15);
    expect(computeTip({ ...base, elapsed: 40, request: 'noHorn', requestOk: false }).tip).toBe(t0 - 8);
    // heavy penalty on a small tip is clamped at 0
    expect(computeTip({ ...base, distance: 0, integrity: 0.05, elapsed: 100, request: 'noHorn', requestOk: false }).tip).toBe(0);
  });

  it('summary line lists integrity, timing and the request result', () => {
    const r = computeTip({ ...base, integrity: 0.72, elapsed: 22, request: 'noHorn', requestOk: false });
    expect(r.summary).toContain('完整度 72%');
    expect(r.summary).toContain('提前 18s');
    expect(r.summary).toContain('狗被吵醒 −8');
    expect(r.summary.startsWith(`+¥${r.tip}`)).toBe(true);
  });

  it('customer quotes follow the integrity bands', () => {
    expect(integrityQuote('soup', 1)).toBe('五星好评！');
    expect(integrityQuote('soup', 0.9)).toBe('五星好评！');
    expect(integrityQuote('pizza', 0.75)).toBe('还行吧…');
    expect(integrityQuote('soup', 0.5)).toBe('汤怎么只剩一半？');
    expect(integrityQuote('pizza', 0.4)).toContain('披萨');
    expect(integrityQuote('ice', 0.4)).toContain('冰淇淋');
    expect(integrityQuote('soup', 0.1)).toBe('这是什么鬼？？');
    expect(integrityQuote('soup', 0)).toBe('我的外卖呢？？');
  });
});

describe('stars and awards', () => {
  it('thresholds scale with player count', () => {
    expect(starThresholds(1)).toEqual([110, 200, 290]);
    expect(starThresholds(3)).toEqual([330, 600, 870]);
    expect(starsFor(109, 1)).toBe(0);
    expect(starsFor(110, 1)).toBe(1);
    expect(starsFor(200, 1)).toBe(2);
    expect(starsFor(289, 1)).toBe(2);
    expect(starsFor(290, 1)).toBe(3);
    expect(starsFor(500, 1)).toBe(3);
    // two players: 220 / 400 / 580
    expect(starsFor(219, 2)).toBe(0);
    expect(starsFor(300, 2)).toBe(1);
    expect(starsFor(400, 2)).toBe(2);
    expect(starsFor(580, 2)).toBe(3);
  });

  it('picks the standout player per category', () => {
    const a = { ...emptyStats(), tips: 50, deliveries: 3, integritySum: 2.7, crashes: 0, honks: 1 };
    const b = { ...emptyStats(), tips: 30, deliveries: 2, integritySum: 1, crashes: 4, soupSpilled: 2.5, honks: 9, maxAirTime: 1.4 };
    const awards = pickAwards([{ id: 'a', name: 'A', stats: a }, { id: 'b', name: 'B', stats: b }], 10);
    const by = Object.fromEntries(awards.map((x) => [x.id, x.playerId]));
    expect(by.tips).toBe('a');
    expect(by.crash).toBe('b');
    expect(by.soup).toBe('b');
    expect(by.honk).toBe('b');
    expect(by.air).toBe('b');
    expect(by.steady).toBe('a');
  });

  it('gives no award for nothing, caps the list, and works solo', () => {
    expect(pickAwards([{ id: 'a', name: 'A', stats: emptyStats() }])).toEqual([]);
    const busy = { ...emptyStats(), tips: 10, deliveries: 1, integritySum: 1, crashes: 2, soupSpilled: 1, honks: 5, maxAirTime: 1 };
    const solo = pickAwards([{ id: 'a', name: 'A', stats: busy }]);
    expect(solo.length).toBe(4);
    expect(solo.every((x) => x.playerId === 'a')).toBe(true);
  });
});
