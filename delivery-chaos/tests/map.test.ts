import { describe, expect, it } from 'vitest';
import { MAP } from '../src/shared/constants';
import { generateCity, inBuilding, isOnRoad, locationOf, pointInRect, roadLine, type Rect } from '../src/shared/map';

const SEEDS = [1, 2, 3, 7, 42, 99, 123, 777, 2024, 31337];

const overlap = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 1e-6;

describe('generateCity determinism', () => {
  it('same seed -> identical output', () => {
    for (const seed of SEEDS) {
      expect(JSON.stringify(generateCity(seed))).toBe(JSON.stringify(generateCity(seed)));
    }
  });

  it('different seeds -> different cities', () => {
    const a = JSON.stringify(generateCity(1));
    const b = JSON.stringify(generateCity(2));
    expect(a).not.toBe(b);
  });
});

describe('generateCity contents', () => {
  it('has the layout from the design doc', () => {
    for (const seed of SEEDS) {
      const m = generateCity(seed);
      expect(m.blocks).toHaveLength(MAP.BLOCKS * MAP.BLOCKS);
      expect(m.blocks.filter((b) => b.park)).toHaveLength(1);
      expect(m.roads).toHaveLength((MAP.BLOCKS + 1) * 2);
      expect(m.restaurants.map((r) => r.food).sort()).toEqual(['ice', 'pizza', 'soup']);
      expect(m.customers).toHaveLength(8);
      expect(new Set(m.customers.map((c) => c.name)).size).toBe(8);
      expect(m.ramps.length).toBeGreaterThanOrEqual(4);
      expect(m.ramps.length).toBeLessThanOrEqual(6);
      expect(m.bumps.length).toBeGreaterThanOrEqual(8);
      expect(m.bumps.length).toBeLessThanOrEqual(12);
      expect(m.obstacles.length).toBeGreaterThanOrEqual(10);
      expect(m.obstacles.length).toBeLessThanOrEqual(14);
      expect(m.walls).toHaveLength(4);
      expect(m.half).toBeCloseTo(126);
      // 1-4 buildings per non-park block, none in the park
      for (const b of m.blocks) {
        const n = m.buildings.filter((x) => x.block === b.index).length;
        if (b.park) expect(n).toBe(0);
        else {
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(4);
        }
      }
      for (const b of m.buildings) {
        expect(b.h).toBeGreaterThanOrEqual(MAP.HEIGHT_MIN);
        expect(b.h).toBeLessThanOrEqual(MAP.HEIGHT_MAX);
      }
    }
  });

  it('buildings never overlap each other or the roads', () => {
    for (const seed of SEEDS) {
      const m = generateCity(seed);
      for (let i = 0; i < m.buildings.length; i++) {
        for (let j = i + 1; j < m.buildings.length; j++) expect(overlap(m.buildings[i]!, m.buildings[j]!)).toBe(false);
        for (const r of m.roads) expect(overlap(m.buildings[i]!, r)).toBe(false);
      }
    }
  });

  it('restaurants and customers are on reachable, road-adjacent spots and never inside a building', () => {
    for (const seed of SEEDS) {
      const m = generateCity(seed);
      const doors = [...m.restaurants.map((r) => r.door), ...m.customers.flatMap((c) => [c.front, c.back])];
      for (const d of doors) {
        expect(isOnRoad(m, d.x, d.z)).toBe(true);
        expect(inBuilding(m, d.x, d.z, 1)).toBeNull(); // not even near a wall
        expect(Math.abs(d.x)).toBeLessThan(m.half);
        expect(Math.abs(d.z)).toBeLessThan(m.half);
        // the door itself sits on the wall of its building
        const nearWall = m.buildings.some((b) => pointInRect(b, d.wallX, d.wallZ, 0.05));
        expect(nearWall).toBe(true);
      }
      for (const c of m.customers) {
        expect(Math.hypot(c.front.x - c.back.x, c.front.z - c.back.z)).toBeGreaterThanOrEqual(12); // circles (r=5) can't overlap
        expect(c.front.face).not.toBe(c.back.face);
      }
      // every door has a matching building role
      for (const r of m.restaurants) expect(m.buildings[r.buildingId]!.roleId).toBe(r.id);
      for (const c of m.customers) expect(m.buildings[c.buildingId]!.roleId).toBe(c.id);
    }
  });

  it('keeps pickup / delivery circles clear of ramps, bumps and obstacles; props sit on roads', () => {
    for (const seed of SEEDS) {
      const m = generateCity(seed);
      const doors = [...m.restaurants.map((r) => r.door), ...m.customers.flatMap((c) => [c.front, c.back])];
      const props = [...m.ramps, ...m.bumps, ...m.obstacles];
      for (const p of props) {
        expect(isOnRoad(m, p.x, p.z)).toBe(true);
        for (const d of doors) expect(Math.hypot(p.x - d.x, p.z - d.z)).toBeGreaterThan(9);
      }
      for (const r of m.ramps) {
        // whole footprint on the road
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          const horiz = r.dir === 0 || r.dir === 2;
          const hx = (horiz ? r.len : r.width) / 2;
          const hz = (horiz ? r.width : r.len) / 2;
          expect(isOnRoad(m, r.x + dx * hx, r.z + dz * hz)).toBe(true);
        }
      }
    }
  });

  it('spawns are on roads; location ids resolve', () => {
    const m = generateCity(5);
    for (const s of m.spawns) expect(isOnRoad(m, s.x, s.z)).toBe(true);
    expect(locationOf(m, 'r0')).toEqual([m.restaurants[0]!.door.x, m.restaurants[0]!.door.z]);
    expect(locationOf(m, 'c3')).toEqual([m.customers[3]!.front.x, m.customers[3]!.front.z]);
    expect(locationOf(m, 'c3b')).toEqual([m.customers[3]!.back.x, m.customers[3]!.back.z]);
    expect(locationOf(m, 'zzz')).toBeNull();
    expect(roadLine(0)).toBe(-120);
  });
});
