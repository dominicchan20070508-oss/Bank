import { describe, expect, it } from 'vitest';
import { CARGO } from '../src/shared/constants';
import { IceCargo, PizzaCargo, SoupCargo, createCargo, integrityOfSummary, type ALocal, type Cargo, type CargoEvent } from '../src/sim/cargo';

const DT = 1 / 60;
const A = (x = 0, y = 0, z = 0): ALocal => ({ x, y, z });

function run(c: Cargo, seconds: number, a: ALocal | ((t: number) => ALocal), lean = 0, speed = 10): CargoEvent[] {
  const all: CargoEvent[] = [];
  for (let t = 0; t < seconds; t += DT) all.push(...c.update(DT, typeof a === 'function' ? a(t) : a, lean, speed));
  return all;
}

describe('soup', () => {
  it('a still bike never spills', () => {
    const c = new SoupCargo();
    const ev = run(c, 30, A(), 0, 0);
    expect(ev).toHaveLength(0);
    expect(c.integrity).toBe(1);
    expect(c.detail).toBe('汤 100%');
  });

  it('cruising straight and ordinary acceleration / braking spill nothing', () => {
    const c = new SoupCargo();
    run(c, 2, A(0, 0, CARGO_ACCEL()));
    run(c, 5, A());
    expect(c.integrity).toBe(1);
  });

  it('sustained hard lateral acceleration spills, and reports how much', () => {
    const c = new SoupCargo();
    const ev = run(c, 5, A(19, 0, 0));
    expect(c.integrity).toBeLessThan(0.95);
    expect(c.integrity).toBeGreaterThan(0); // "some but not all" within ~5 s
    const spilled = ev.filter((e) => e.type === 'spill').reduce((s, e) => s + (e.type === 'spill' ? e.amount : 0), 0);
    expect(spilled).toBeCloseTo(1 - c.integrity, 5);
    // it heaps toward the side opposite to the acceleration
    expect(c.sx).toBeLessThan(0);
  });

  it('slalom near the slosh resonance spills more than a gentle wiggle', () => {
    const hard = new SoupCargo();
    run(hard, 5, (t) => A(Math.sin(t * 2 * Math.PI * 0.8) > 0 ? 19 : -19, 0, 0));
    const gentle = new SoupCargo();
    run(gentle, 5, (t) => A(Math.sin(t * 2 * Math.PI * 0.8) > 0 ? 4 : -4, 0, 0));
    expect(hard.integrity).toBeLessThan(gentle.integrity);
    expect(gentle.integrity).toBeGreaterThan(0.99);
  });

  it('a vertical spike (bump / landing) makes the bowl rock', () => {
    const c = new SoupCargo();
    run(c, 0.15, A(0, 60, 0));
    expect(Math.hypot(c.sx, c.sz)).toBeGreaterThan(0.05);
  });

  it('leaning alone makes it slosh', () => {
    const c = new SoupCargo();
    run(c, 1, A(), 0.6, 10);
    expect(c.sx).toBeGreaterThan(0.1); // leaning right => heaped right
  });

  it('a crash keeps only 40% and reports the loss', () => {
    const c = new SoupCargo();
    const ev = c.onCrash();
    expect(c.integrity).toBeCloseTo(0.4);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'spill', crash: true });
    c.onCrash();
    expect(c.integrity).toBeCloseTo(0.16);
  });

  it('summary is compact and JSON-safe', () => {
    const c = new SoupCargo();
    run(c, 1, A(10, 0, 0));
    const s = JSON.parse(JSON.stringify(c.summary()));
    expect(Object.keys(s).sort()).toEqual(['a', 'b', 'c', 'kind']);
    expect(s.kind).toBe('soup');
    expect(s.a).toBe(c.level);
    expect(integrityOfSummary(s, 1)).toBe(c.integrity);
  });
});

function CARGO_ACCEL() {
  return 9; // BIKE.ACCEL
}

describe('pizza tower', () => {
  it('a still bike keeps every box', () => {
    const c = new PizzaCargo(5);
    expect(run(c, 20, A(), 0, 0)).toHaveLength(0);
    expect(c.integrity).toBe(1);
    expect(c.detail).toBe('披萨 5/5');
  });

  it('moderate driving keeps the tower up', () => {
    const c = new PizzaCargo(5);
    run(c, 3, A(0, 0, 9));
    run(c, 3, A(6, 0, 0));
    expect(c.boxes).toBe(5);
  });

  it('a tall stack loses boxes faster than a short one under the same lateral acceleration', () => {
    const tall = new PizzaCargo(5);
    const short = new PizzaCargo(2);
    const a = (t: number) => A(Math.sin(t * 2 * Math.PI * 0.7) > 0 ? 18 : -18, 0, 0);
    const evTall = run(tall, 5, a);
    const evShort = run(short, 5, a);
    const lostTall = evTall.filter((e) => e.type === 'boxLost').length;
    const lostShort = evShort.filter((e) => e.type === 'boxLost').length;
    expect(lostTall).toBeGreaterThan(lostShort);
    expect(lostTall).toBeGreaterThanOrEqual(1);
    expect(tall.boxes).toBe(5 - lostTall);
  });

  it('the top box goes first, flies in the tilt direction, and the tower is steadied', () => {
    const c = new PizzaCargo(4);
    const ev = run(c, 6, A(25, 0, 0)); // pushed right => tower tilts left
    const first = ev.find((e) => e.type === 'boxLost');
    expect(first).toBeDefined();
    if (first?.type === 'boxLost') {
      expect(first.index).toBe(3);
      expect(first.dirX).toBeLessThan(0);
      expect(first.crash).toBe(false);
    }
    expect(Math.hypot(c.tx, c.tz)).toBeLessThan(CARGO.PIZZA.TIP_LIMIT + 0.2);
  });

  it('a crash throws every remaining box', () => {
    const c = new PizzaCargo(3);
    const ev = c.onCrash();
    expect(ev.filter((e) => e.type === 'boxLost')).toHaveLength(3);
    expect(c.boxes).toBe(0);
    expect(c.integrity).toBe(0);
    expect(c.onCrash()).toHaveLength(0);
  });

  it('summary carries the box count and tilt', () => {
    const c = new PizzaCargo(3);
    run(c, 0.5, A(15, 0, 0));
    const s = c.summary();
    expect(s).toMatchObject({ kind: 'pizza', a: 3 });
    expect(s.b).not.toBe(0);
    expect(integrityOfSummary(s, 3)).toBe(1);
  });
});

describe('ice cream', () => {
  it('melts about 1/90 per second while moving, 1.5x faster standing still', () => {
    const moving = new IceCargo(3);
    run(moving, 9, A(), 0, 10);
    expect(moving.melt).toBeCloseTo(0.1, 2);
    const still = new IceCargo(3);
    run(still, 9, A(), 0, 0);
    expect(still.melt).toBeCloseTo(0.15, 2);
    expect(moving.integrity).toBeCloseTo(1 - 0.7 * 0.1, 2);
    expect(moving.detail).toBe('冰淇淋 3/3 · 融化 10%');
  });

  it('a hard vertical spike knocks the top scoop off; gentle bumps do not', () => {
    const gentle = new IceCargo(3);
    expect(run(gentle, 1, A(0, CARGO.ICE.IMPACT - 5, 0))).toHaveLength(0);
    const hard = new IceCargo(3);
    const ev = run(hard, 0.1, A(0, 60, 0));
    expect(ev).toHaveLength(1); // one scoop per impact (cooldown)
    expect(ev[0]).toMatchObject({ type: 'scoopLost', index: 2, remaining: 2, crash: false });
    expect(hard.scoops).toBe(2);
    // a second impact later takes the next one
    run(hard, 1, A());
    run(hard, 0.05, A(0, 60, 0));
    expect(hard.scoops).toBe(1);
  });

  it('crash drops one scoop; integrity is 0 with no scoops', () => {
    const c = new IceCargo(2);
    expect(c.onCrash()).toMatchObject([{ type: 'scoopLost', crash: true, remaining: 1 }]);
    c.onCrash();
    expect(c.scoops).toBe(0);
    expect(c.integrity).toBe(0);
    expect(c.onCrash()).toHaveLength(0);
  });

  it('integrity = scoops/initial * (1 - 0.7*melt)', () => {
    const c = new IceCargo(2);
    c.onCrash();
    run(c, 45, A(), 0, 10); // melt 0.5
    expect(c.integrity).toBeCloseTo(0.5 * (1 - 0.7 * 0.5), 2);
    expect(integrityOfSummary(c.summary(), 2)).toBeCloseTo(c.integrity, 6);
  });
});

describe('createCargo', () => {
  it('builds the right model and initial size', () => {
    expect(createCargo('soup', 1).kind).toBe('soup');
    const p = createCargo('pizza', 4);
    expect(p.kind).toBe('pizza');
    expect(p.size).toBe(4);
    expect(createCargo('ice', 3).size).toBe(3);
  });
});
