// Headless tests for the sphere-car controller + cannon world (no three / DOM needed).
import { describe, expect, it } from 'vitest';
import { BikeController, type BikeEvent, type BikeInput } from '../src/client/bike';
import { FIXED_DT, createPhysics } from '../src/client/physics';
import { BIKE, CARGO, MAP } from '../src/shared/constants';
import { generateCity, inBuilding, type Building, type CityMap } from '../src/shared/map';

const IN = (o: Partial<BikeInput> = {}): BikeInput => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, ...o });

/** real city walls, but an empty interior */
function emptyMap(): CityMap {
  const m = generateCity(1);
  m.buildings = [];
  m.ramps = [];
  m.bumps = [];
  m.obstacles = [];
  return m;
}

function setup(map = emptyMap(), x = 0, z = -100, heading = 0) {
  const phys = createPhysics(map);
  const bike = new BikeController(phys, map, 1);
  bike.place(x, z, heading);
  const events: BikeEvent[] = [];
  const step = (input: BikeInput, seconds: number, onStep?: () => void) => {
    for (let t = 0; t < seconds - 1e-9; t += FIXED_DT) {
      bike.step(FIXED_DT, input);
      events.push(...bike.drainEvents());
      onStep?.();
    }
  };
  return { map, phys, bike, step, events };
}

describe('bike controller', () => {
  it('accelerates to top speed, steers, brakes and reverses', () => {
    const { bike, step } = setup();
    step(IN({ throttle: 1 }), 3);
    expect(bike.speed).toBeCloseTo(BIKE.VMAX, 0);
    expect(bike.pos.z).toBeGreaterThan(-100 + 20); // moved along +z (heading 0)
    const h0 = bike.heading;
    step(IN({ throttle: 1, steer: 1 }), 0.5); // D = right
    expect(bike.heading).toBeLessThan(h0 - 0.3); // right turn decreases the heading
    expect(bike.lean).toBeGreaterThan(0.1); // and leans right
    step(IN({ steer: 0, brake: 1 }), 0.8); // 18 m/s^2 brake: from 16 m/s to a stop takes < 0.9 s
    expect(bike.speed).toBeLessThan(4);
    step(IN({ brake: 1 }), 2); // keep holding it: reverse, capped at 4 m/s
    expect(bike.speedFwd).toBeCloseTo(-BIKE.REVERSE_MAX, 0);
  });

  it('starts moving from a standstill in every heading, including north (regression: solver residue read as "reversing")', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 3.0, -2.5, 0.8]) {
      const { bike, step } = setup(emptyMap(), 0, 0, heading);
      step(IN(), 1); // let it settle at rest
      step(IN({ throttle: 1 }), 1.5);
      expect(bike.speed, `heading ${heading}`).toBeGreaterThan(8);
    }
  });

  it("can't turn on the spot", () => {
    const { bike, step } = setup();
    step(IN({ steer: 1 }), 1);
    expect(bike.heading).toBe(0);
  });

  it('stays upright standing still for a long time, feet down', () => {
    const { bike, step, events } = setup();
    step(IN(), 30);
    expect(Math.abs(bike.lean)).toBeLessThan(0.1);
    expect(events.filter((e) => e.type === 'crash')).toHaveLength(0);
  });

  it('wobbles visibly when creeping along, but does not fall', () => {
    const { bike, step, events } = setup();
    let maxLean = 0;
    step(IN({ throttle: 0.16 }), 15, () => (maxLean = Math.max(maxLean, Math.abs(bike.lean))));
    expect(bike.speed).toBeGreaterThan(1.5);
    expect(bike.speed).toBeLessThan(4);
    expect(maxLean).toBeGreaterThan(0.05);
    expect(events.filter((e) => e.type === 'crash')).toHaveLength(0);
  });

  it('the handbrake lets the back end slide', () => {
    const grip = setup();
    grip.step(IN({ throttle: 1 }), 3);
    let maxGrip = 0;
    grip.step(IN({ throttle: 1, steer: 1 }), 1, () => (maxGrip = Math.max(maxGrip, Math.abs(grip.bike.speedLat))));
    const slide = setup();
    slide.step(IN({ throttle: 1 }), 3);
    let maxSlide = 0;
    slide.step(IN({ throttle: 1, steer: 1, handbrake: true }), 1, () => (maxSlide = Math.max(maxSlide, Math.abs(slide.bike.speedLat))));
    expect(maxSlide).toBeGreaterThan(maxGrip * 2);
    expect(maxSlide).toBeGreaterThan(5);
  });

  it('releasing the handbrake mid-slide at speed high-sides the bike', () => {
    const { bike, step, events } = setup();
    step(IN({ throttle: 1 }), 3);
    step(IN({ throttle: 1, steer: 1, handbrake: true }), 1.0);
    step(IN({ throttle: 1, steer: 1 }), 1);
    expect(events.some((e) => e.type === 'crash')).toBe(true);
    expect(bike.lean).toBeDefined();
  });

  it('hits a wall head on: slow = a wobble, fast = crash, then recovery after ~1.8 s', () => {
    const wall: Building = { id: 0, x: 0, z: -20, w: 40, d: 10, h: 8, color: 0, block: 0, roadFaces: [], role: 'plain' };
    const map = emptyMap();
    map.buildings = [wall];
    // slow: 4 m/s
    const slow = setup(map, 0, -60, 0);
    slow.step(IN({ throttle: 4 / 16 }), 11);
    expect(slow.events.some((e) => e.type === 'wallHit')).toBe(true);
    expect(slow.events.some((e) => e.type === 'crash')).toBe(false);
    // fast: full throttle
    const fast = setup(map, 0, -60, 0);
    fast.step(IN({ throttle: 1 }), 5.2);
    const crash = fast.events.find((e) => e.type === 'crash');
    expect(crash).toMatchObject({ cause: 'wall' });
    const crashIdx = fast.events.findIndex((e) => e.type === 'crash');
    expect(fast.events.slice(crashIdx).some((e) => e.type === 'recovered')).toBe(true);
    expect(fast.bike.crashed).toBe(false);
    // and it is upright and controllable again
    expect(Math.abs(fast.bike.lean)).toBeLessThan(0.2);
    fast.step(IN({ brake: 1 }), 1.5);
    expect(fast.bike.speedFwd).toBeLessThan(0);
  });

  it('crash lasts CRASH_TIME and ignores controls meanwhile', () => {
    const { bike, step, events } = setup();
    step(IN({ throttle: 1 }), 2);
    bike.forceCrash();
    expect(bike.crashed).toBe(true);
    const start = bike.body.position.z;
    step(IN({ throttle: 1 }), 1.0);
    expect(bike.crashed).toBe(true);
    expect(bike.speed).toBeLessThan(16 - 4); // skidding to a halt, not accelerating
    expect(bike.body.position.z).toBeGreaterThan(start);
    step(IN({ throttle: 1 }), BIKE.CRASH_TIME - 1.0 + 0.1);
    expect(bike.crashed).toBe(false);
    expect(events.filter((e) => e.type === 'recovered')).toHaveLength(1);
  });

  it('R stands the bike up at once (3 s cooldown)', () => {
    const { bike, step } = setup();
    step(IN({ throttle: 1 }), 1);
    bike.forceCrash();
    step(IN(), 0.3);
    expect(bike.reset()).toBe(true);
    expect(bike.crashed).toBe(false);
    expect(bike.reset()).toBe(false); // cooling down
    step(IN(), BIKE.RESET_COOLDOWN + 0.1);
    expect(bike.reset()).toBe(true);
  });

  it('a ramp launches the bike; the landing is reported', () => {
    const map = emptyMap();
    map.ramps = [{ x: 0, z: 0, dir: 1, len: MAP.RAMP_LEN, width: MAP.RAMP_WIDTH, height: MAP.RAMP_HEIGHT }];
    const { bike, step, events } = setup(map, 0, -40, 0);
    let maxY = 0;
    let maxAy = 0;
    step(IN({ throttle: 1 }), 5, () => {
      maxY = Math.max(maxY, bike.pos.y);
      maxAy = Math.max(maxAy, bike.aLocal.y);
    });
    expect(maxY).toBeGreaterThan(MAP.RAMP_HEIGHT + 0.5);
    const landed = events.find((e) => e.type === 'landed');
    expect(landed).toBeDefined();
    if (landed?.type === 'landed') expect(landed.airTime).toBeGreaterThan(0.4);
    expect(maxAy).toBeGreaterThan(30); // a landing is a hard vertical spike (knocks ice-cream off)
    expect(bike.airborne).toBe(false);
    expect(events.some((e) => e.type === 'crash')).toBe(false);
  });

  it('speed bumps are a jolt only when taken fast', () => {
    const map = emptyMap();
    map.bumps = [{ x: 0, z: 0, w: MAP.BUMP_WIDTH, d: MAP.BUMP_DEPTH, h: MAP.BUMP_HEIGHT }];
    const slow = setup(map, 0, -20, 0);
    let slowAy = 0;
    slow.step(IN({ throttle: 4 / 16 }), 10, () => (slowAy = Math.max(slowAy, slow.bike.aLocal.y)));
    const fast = setup(map, 0, -40, 0);
    let fastAy = 0;
    fast.step(IN({ throttle: 1 }), 5, () => (fastAy = Math.max(fastAy, fast.bike.aLocal.y)));
    expect(slow.bike.pos.z).toBeGreaterThan(5); // it did cross the bump
    expect(fast.bike.pos.z).toBeGreaterThan(5);
    expect(slowAy).toBeLessThan(CARGO.ICE.IMPACT);
    expect(fastAy).toBeGreaterThan(CARGO.ICE.IMPACT);
    expect(fast.bike.pos.y).toBeLessThan(1); // a hop, not a rocket
    expect(fast.events.some((e) => e.type === 'crash')).toBe(false);
  });

  it('is deterministic', () => {
    const run = () => {
      const { bike, step } = setup();
      step(IN({ throttle: 1 }), 2);
      step(IN({ throttle: 1, steer: 0.5 }), 2);
      step(IN({ throttle: 0.5, steer: -1, handbrake: true }), 1);
      return [bike.pos.x, bike.pos.z, bike.heading, bike.lean, bike.speed];
    };
    expect(run()).toEqual(run());
  });

  it('place() never puts the bike inside a building', () => {
    const map = generateCity(1);
    const b = map.buildings[0]!;
    const { bike } = setup(map, b.x, b.z, 0);
    expect(inBuilding(map, bike.pos.x, bike.pos.z, 0.5)).toBeNull();
    expect(Math.hypot(bike.pos.x - b.x, bike.pos.z - b.z)).toBeGreaterThan(5);
  });

  it('recovery moves a bike that ended up inside a building back onto the road', () => {
    const map = generateCity(1);
    const b = map.buildings[0]!;
    const { bike, step } = setup(map, 0, 0, 0);
    bike.body.position.set(b.x, 0.5, b.z); // (bypass place(): e.g. it was shoved through a corner)
    expect(inBuilding(map, b.x, b.z)).not.toBeNull();
    bike.forceCrash();
    step(IN(), BIKE.CRASH_TIME + 0.3);
    expect(bike.crashed).toBe(false);
    expect(inBuilding(map, bike.pos.x, bike.pos.z)).toBeNull();
  });

  it('the R key at rest does not move the bike', () => {
    const { bike, step } = setup();
    step(IN(), 0.5);
    const z = bike.pos.z;
    bike.reset();
    step(IN(), 0.5);
    expect(bike.pos.z).toBeCloseTo(z, 1);
  });
});
