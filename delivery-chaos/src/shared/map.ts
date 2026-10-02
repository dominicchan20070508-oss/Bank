// Deterministic city generator (DESIGN §3). Depends ONLY on the seed (mulberry32 + integer/float arithmetic;
// no trig, no Math.random, no Set/Map iteration order tricks) so every client and the server agree.
import { MAP } from './constants';
import { Rng, deriveSeed } from './rng';

export type Face = 'N' | 'S' | 'E' | 'W'; // N = -z, S = +z, E = +x, W = -x
export type FoodKind = 'soup' | 'pizza' | 'ice';

/** Axis-aligned rectangle on the ground: centre (x, z), full size w (along x) by d (along z). */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Block {
  index: number;
  i: number; // column (along x)
  j: number; // row (along z)
  cx: number;
  cz: number;
  park: boolean;
}

export interface Building extends Rect {
  id: number;
  h: number;
  color: number;
  block: number;
  roadFaces: Face[];
  role: 'plain' | 'restaurant' | 'customer';
  roleId?: string; // 'r0' / 'c3'
}

/** A door marker: the delivery / pickup circle centre, plus the wall point it belongs to. */
export interface Door {
  x: number;
  z: number;
  nx: number; // outward normal
  nz: number;
  face: Face;
  wallX: number;
  wallZ: number;
}

export interface Restaurant {
  id: string; // 'r0'..'r2'
  name: string; // Simplified Chinese
  nameEn: string; // English
  food: FoodKind;
  color: number;
  buildingId: number;
  door: Door;
}

export interface Customer {
  id: string; // 'c0'..'c7'
  name: string; // "3号楼 张先生"
  nameEn: string; // "Bldg 3 · Mr. Zhang"
  houseNo: number;
  buildingId: number;
  front: Door;
  back: Door;
}

/** Wedge ramp. dir = climb direction: 0 = +x, 1 = +z, 2 = -x, 3 = -z. (x, z) is the wedge centre. */
export interface Ramp {
  x: number;
  z: number;
  dir: 0 | 1 | 2 | 3;
  len: number;
  width: number;
  height: number;
}

/** Speed bump: a low bar across the road, axis-aligned. */
export interface Bump extends Rect {
  h: number;
}

export interface Obstacle extends Rect {
  h: number;
  kind: 'barrier' | 'bin';
}

export interface WallBox extends Rect {
  h: number;
}

export interface Tree {
  x: number;
  z: number;
  s: number; // scale
}

export interface Spawn {
  x: number;
  z: number;
  heading: number;
}

export interface CityMap {
  seed: number;
  half: number; // playable half extent (inner face of the boundary walls)
  blocks: Block[];
  parkBlock: number;
  roads: Rect[];
  buildings: Building[];
  restaurants: Restaurant[];
  customers: Customer[];
  ramps: Ramp[];
  bumps: Bump[];
  obstacles: Obstacle[];
  walls: WallBox[];
  trees: Tree[];
  benches: Rect[];
  spawns: Spawn[];
}

export const RESTAURANT_DEFS: readonly { name: string; nameEn: string; food: FoodKind; color: number }[] = [
  { name: '王记汤馆', nameEn: "Wang's Soup House", food: 'soup', color: 0xe63946 },
  { name: '披萨大叔', nameEn: 'Uncle Pizza', food: 'pizza', color: 0xff8c1a },
  { name: '冰冰甜品', nameEn: 'Chill Desserts', food: 'ice', color: 0xff7eb6 },
];

/** Customer names in both languages (the shuffle below permutes the pairs together, so the RNG stream is unchanged). */
const CUSTOMER_NAMES: readonly { zh: string; en: string }[] = [
  { zh: '张先生', en: 'Mr. Zhang' },
  { zh: '李女士', en: 'Ms. Li' },
  { zh: '王大爷', en: 'Grandpa Wang' },
  { zh: '赵奶奶', en: 'Grandma Zhao' },
  { zh: '刘小姐', en: 'Miss Liu' },
  { zh: '陈同学', en: 'Student Chen' },
  { zh: '周老板', en: 'Boss Zhou' },
  { zh: '吴阿姨', en: 'Auntie Wu' },
  { zh: '郑叔叔', en: 'Uncle Zheng' },
  { zh: '孙大姐', en: 'Sister Sun' },
  { zh: '钱博士', en: 'Dr. Qian' },
  { zh: '冯师傅', en: 'Master Feng' },
];

const BUILDING_COLORS = [
  0xf4a261, 0xe9c46a, 0x8ecae6, 0xa8dadc, 0xb5e48c, 0xcdb4db,
  0xffafcc, 0xbde0fe, 0xfcd5ce, 0xd8e2dc, 0xf7d794, 0x9bc4e2,
];

const FACE_NORMAL: Record<Face, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPPOSITE: Record<Face, Face> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** Road centre-line coordinate k (0..BLOCKS). */
export function roadLine(k: number): number {
  return (k - MAP.BLOCKS / 2) * MAP.PITCH;
}
/** Block centre coordinate i (0..BLOCKS-1). */
export function blockCentre(i: number): number {
  return (i - (MAP.BLOCKS - 1) / 2) * MAP.PITCH;
}

export function pointInRect(r: Rect, x: number, z: number, margin = 0): boolean {
  return Math.abs(x - r.x) <= r.w / 2 + margin && Math.abs(z - r.z) <= r.d / 2 + margin;
}

export function isOnRoad(map: CityMap, x: number, z: number, margin = 0): boolean {
  for (const r of map.roads) if (pointInRect(r, x, z, margin)) return true;
  return false;
}

export function inBuilding(map: CityMap, x: number, z: number, margin = 0): Building | null {
  for (const b of map.buildings) if (pointInRect(b, x, z, margin)) return b;
  return null;
}

/** Nearest drivable point (kept 1.5 m inside the road edge). Used to un-stick a bike. */
export function nearestRoadPoint(map: CityMap, x: number, z: number): [number, number] {
  let best: [number, number] = [x, z];
  let bestD = Infinity;
  for (const r of map.roads) {
    const hx = Math.max(0, r.w / 2 - 1.5);
    const hz = Math.max(0, r.d / 2 - 1.5);
    const px = Math.min(r.x + hx, Math.max(r.x - hx, x));
    const pz = Math.min(r.z + hz, Math.max(r.z - hz, z));
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < bestD) {
      bestD = d;
      best = [px, pz];
    }
  }
  return best;
}

/** 'r0' / 'c3' (front door) / 'c3b' or 'c3:back' (back door) -> door. */
export function doorOf(map: CityMap, id: string): Door | null {
  const back = id.endsWith('b') || id.endsWith(':back');
  const clean = id.replace(/(:back|b)$/, '');
  if (clean.startsWith('r')) return map.restaurants.find((r) => r.id === clean)?.door ?? null;
  const c = map.customers.find((cu) => cu.id === clean);
  if (!c) return null;
  return back ? c.back : c.front;
}

export function locationOf(map: CityMap, id: string): [number, number] | null {
  const d = doorOf(map, id);
  return d ? [d.x, d.z] : null;
}

export function manhattan(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

function dist2(ax: number, az: number, bx: number, bz: number): number {
  return (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
}

// ---------- building layout inside a block ----------

function splitRegion(rng: Rng, region: Rect, n: number): Rect[] {
  const leaves: Rect[] = [region];
  const minSplit = 2 * MAP.BUILD_MIN + MAP.BUILD_GAP;
  while (leaves.length < n) {
    let best = -1;
    let bestArea = 0;
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i]!;
      if (l.w < minSplit && l.d < minSplit) continue;
      const area = l.w * l.d;
      if (area > bestArea) {
        bestArea = area;
        best = i;
      }
    }
    if (best < 0) break;
    const l = leaves[best]!;
    const canX = l.w >= minSplit;
    const canZ = l.d >= minSplit;
    let alongX: boolean;
    if (canX && canZ) alongX = l.w > l.d + 0.01 ? true : l.d > l.w + 0.01 ? false : rng.chance(0.5);
    else alongX = canX;
    const total = alongX ? l.w : l.d;
    const usable = total - MAP.BUILD_GAP;
    const lo = Math.max(MAP.BUILD_MIN, usable * 0.4);
    const hi = Math.min(usable - MAP.BUILD_MIN, usable * 0.6);
    const a = rng.range(lo, Math.max(lo, hi));
    const b = usable - a;
    if (alongX) {
      const minX = l.x - l.w / 2;
      const left: Rect = { x: minX + a / 2, z: l.z, w: a, d: l.d };
      const right: Rect = { x: minX + a + MAP.BUILD_GAP + b / 2, z: l.z, w: b, d: l.d };
      leaves.splice(best, 1, left, right);
    } else {
      const minZ = l.z - l.d / 2;
      const top: Rect = { x: l.x, z: minZ + a / 2, w: l.w, d: a };
      const bottom: Rect = { x: l.x, z: minZ + a + MAP.BUILD_GAP + b / 2, w: l.w, d: b };
      leaves.splice(best, 1, top, bottom);
    }
  }
  return leaves;
}

function doorFor(block: Block, b: Rect, face: Face): Door {
  const e = MAP.BLOCK / 2 + MAP.DOOR_INSET;
  const [nx, nz] = FACE_NORMAL[face];
  switch (face) {
    case 'N':
      return { x: b.x, z: block.cz - e, nx, nz, face, wallX: b.x, wallZ: b.z - b.d / 2 };
    case 'S':
      return { x: b.x, z: block.cz + e, nx, nz, face, wallX: b.x, wallZ: b.z + b.d / 2 };
    case 'W':
      return { x: block.cx - e, z: b.z, nx, nz, face, wallX: b.x - b.w / 2, wallZ: b.z };
    case 'E':
      return { x: block.cx + e, z: b.z, nx, nz, face, wallX: b.x + b.w / 2, wallZ: b.z };
  }
}

// ---------- generator ----------

interface Segment {
  cx: number;
  cz: number;
  axis: 'x' | 'z'; // direction the road runs
}

export function generateCity(seed: number): CityMap {
  const rng = new Rng(deriveSeed(seed, 0x0c17));
  // outer edge of the outer ring road (= inner face of the boundary walls)
  const halfExtent = Math.abs(roadLine(0)) + MAP.ROAD / 2;

  // --- blocks & roads ---
  const blocks: Block[] = [];
  for (let j = 0; j < MAP.BLOCKS; j++) {
    for (let i = 0; i < MAP.BLOCKS; i++) {
      blocks.push({ index: j * MAP.BLOCKS + i, i, j, cx: blockCentre(i), cz: blockCentre(j), park: false });
    }
  }
  const parkBlock = rng.int(0, blocks.length - 1);
  blocks[parkBlock]!.park = true;

  const roads: Rect[] = [];
  const roadLen = halfExtent * 2;
  for (let k = 0; k <= MAP.BLOCKS; k++) {
    roads.push({ x: 0, z: roadLine(k), w: roadLen, d: MAP.ROAD }); // horizontal (runs along x)
  }
  for (let k = 0; k <= MAP.BLOCKS; k++) {
    roads.push({ x: roadLine(k), z: 0, w: MAP.ROAD, d: roadLen }); // vertical (runs along z)
  }

  // --- buildings ---
  const buildings: Building[] = [];
  const buildable = MAP.BLOCK / 2 - MAP.BUILD_MARGIN;
  for (const block of blocks) {
    if (block.park) continue;
    const roll = rng.next();
    const n = roll < 0.15 ? 1 : roll < 0.45 ? 2 : roll < 0.75 ? 3 : 4;
    const region: Rect = { x: block.cx, z: block.cz, w: buildable * 2, d: buildable * 2 };
    const leaves = splitRegion(rng, region, n);
    for (const leaf of leaves) {
      const roadFaces: Face[] = [];
      const eps = 0.01;
      if (Math.abs(leaf.z - leaf.d / 2 - (block.cz - buildable)) < eps) roadFaces.push('N');
      if (Math.abs(leaf.z + leaf.d / 2 - (block.cz + buildable)) < eps) roadFaces.push('S');
      if (Math.abs(leaf.x + leaf.w / 2 - (block.cx + buildable)) < eps) roadFaces.push('E');
      if (Math.abs(leaf.x - leaf.w / 2 - (block.cx - buildable)) < eps) roadFaces.push('W');
      const t = rng.next();
      const h = Math.round((MAP.HEIGHT_MIN + (MAP.HEIGHT_MAX - MAP.HEIGHT_MIN) * Math.pow(t, 1.4)) * 2) / 2;
      buildings.push({
        ...leaf,
        id: buildings.length,
        h,
        color: rng.pick(BUILDING_COLORS),
        block: block.index,
        roadFaces,
        role: 'plain',
      });
    }
  }

  // --- restaurants: 3 buildings in well separated non-park blocks ---
  const restaurants: Restaurant[] = [];
  const chosenBlocks: Block[] = [];
  const candidateBlocks = rng.shuffle(blocks.filter((b) => !b.park));
  let minDist = MAP.RESTAURANT_MIN_BLOCK_DIST;
  while (chosenBlocks.length < RESTAURANT_DEFS.length) {
    chosenBlocks.length = 0;
    for (const b of candidateBlocks) {
      if (chosenBlocks.every((c) => Math.abs(c.i - b.i) + Math.abs(c.j - b.j) >= minDist)) chosenBlocks.push(b);
      if (chosenBlocks.length === RESTAURANT_DEFS.length) break;
    }
    if (chosenBlocks.length < RESTAURANT_DEFS.length) minDist--;
  }
  RESTAURANT_DEFS.forEach((def, idx) => {
    const block = chosenBlocks[idx]!;
    const cands = buildings.filter((b) => b.block === block.index && b.roadFaces.length > 0);
    // biggest footprint = most recognisable
    cands.sort((a, b) => b.w * b.d - a.w * a.d || a.id - b.id);
    const b = cands[0]!;
    const face = rng.pick(b.roadFaces);
    b.role = 'restaurant';
    b.roleId = `r${idx}`;
    b.color = def.color;
    b.h = Math.min(b.h, 14);
    restaurants.push({ id: `r${idx}`, name: def.name, nameEn: def.nameEn, food: def.food, color: def.color, buildingId: b.id, door: doorFor(block, b, face) });
  });

  // --- customers: 8 spread-out buildings, each with a front and a back door ---
  const customers: Customer[] = [];
  const houseNos = rng.shuffle(Array.from({ length: 24 }, (_, k) => k + 1));
  const names = rng.shuffle(CUSTOMER_NAMES);
  const plain = rng.shuffle(buildings.filter((b) => b.role === 'plain' && b.roadFaces.length >= 2 && b.w >= 12 && b.d >= 12));
  const doorPts = restaurants.map((r) => r.door);
  const customerCount = 8;
  let spacing = MAP.CUSTOMER_MIN_SPACING;
  let picked: { b: Building; front: Door; back: Door }[] = [];
  while (picked.length < customerCount) {
    picked = [];
    for (const b of plain) {
      if (picked.length >= customerCount) break;
      const block = blocks[b.block]!;
      // front: any road face; back: the opposite face when it's a road face, else an adjacent road face
      const frontFace = rng.pick(b.roadFaces);
      let backFace: Face | null = b.roadFaces.includes(OPPOSITE[frontFace]) ? OPPOSITE[frontFace] : null;
      if (!backFace) {
        const others = b.roadFaces.filter((f) => f !== frontFace);
        backFace = others.length ? rng.pick(others) : null;
      }
      if (!backFace) continue;
      const front = doorFor(block, b, frontFace);
      const back = doorFor(block, b, backFace);
      if (Math.sqrt(dist2(front.x, front.z, back.x, back.z)) < 12) continue;
      const tooClose = (d: Door) => doorPts.some((p) => dist2(p.x, p.z, d.x, d.z) < spacing * spacing) || picked.some((p) => dist2(p.front.x, p.front.z, d.x, d.z) < spacing * spacing || dist2(p.back.x, p.back.z, d.x, d.z) < spacing * spacing);
      if (tooClose(front) || tooClose(back)) continue;
      picked.push({ b, front, back });
      doorPts.push(front, back);
    }
    if (picked.length < customerCount) {
      // relax spacing and retry (deterministic: same rng stream, same result for the same seed)
      doorPts.length = restaurants.length;
      spacing -= 3;
      if (spacing < 6) throw new Error(`generateCity(${seed}): cannot place ${customerCount} customers`);
    }
  }
  picked.forEach((p, idx) => {
    p.b.role = 'customer';
    p.b.roleId = `c${idx}`;
    customers.push({
      id: `c${idx}`,
      name: `${houseNos[idx]}号楼 ${names[idx]!.zh}`,
      nameEn: `Bldg ${houseNos[idx]} · ${names[idx]!.en}`,
      houseNo: houseNos[idx]!,
      buildingId: p.b.id,
      front: p.front,
      back: p.back,
    });
  });

  // --- road segments (between intersections) for props ---
  const segments: Segment[] = [];
  for (let k = 0; k <= MAP.BLOCKS; k++) {
    for (let i = 0; i < MAP.BLOCKS; i++) {
      segments.push({ cx: blockCentre(i), cz: roadLine(k), axis: 'x' });
      segments.push({ cx: roadLine(k), cz: blockCentre(i), axis: 'z' });
    }
  }
  const allDoors: Door[] = [...restaurants.map((r) => r.door), ...customers.flatMap((c) => [c.front, c.back])];
  // Two columns x two rows on the road just north of the centre crossing, all facing +z: teammates start side by side
  // (player 2 a little behind player 1), so everybody sees everybody at the start.
  const spawnX = roadLine(2);
  const spawns: Spawn[] = [
    { x: spawnX - 3, z: roadLine(2) - 10, heading: 0 },
    { x: spawnX + 3, z: roadLine(2) - 18, heading: 0 },
    { x: spawnX + 3, z: roadLine(2) - 10, heading: 0 },
    { x: spawnX - 3, z: roadLine(2) - 18, heading: 0 },
  ];
  const clearOfDoors = (x: number, z: number, min: number) => allDoors.every((d) => dist2(d.x, d.z, x, z) >= min * min);
  const clearOfSpawns = (x: number, z: number, min: number) => spawns.every((s) => dist2(s.x, s.z, x, z) >= min * min);

  // --- ramps ---
  const ramps: Ramp[] = [];
  const rampTarget = rng.int(MAP.RAMP_COUNT[0], MAP.RAMP_COUNT[1]);
  for (const seg of rng.shuffle(segments)) {
    if (ramps.length >= rampTarget) break;
    const lane = rng.chance(0.5) ? 3 : -3;
    const along = rng.range(-8, 8);
    const x = seg.axis === 'x' ? seg.cx + along : seg.cx + lane;
    const z = seg.axis === 'x' ? seg.cz + lane : seg.cz + along;
    const dir = (seg.axis === 'x' ? (rng.chance(0.5) ? 0 : 2) : rng.chance(0.5) ? 1 : 3) as 0 | 1 | 2 | 3;
    if (!clearOfDoors(x, z, MAP.CLEARANCE_DOOR)) continue;
    if (!clearOfSpawns(x, z, 16)) continue;
    if (ramps.some((r) => dist2(r.x, r.z, x, z) < 22 * 22)) continue;
    ramps.push({ x, z, dir, len: MAP.RAMP_LEN, width: MAP.RAMP_WIDTH, height: MAP.RAMP_HEIGHT });
  }

  // --- speed bumps ---
  const bumps: Bump[] = [];
  const bumpTarget = rng.int(MAP.BUMP_COUNT[0], MAP.BUMP_COUNT[1]);
  for (const seg of rng.shuffle(segments)) {
    if (bumps.length >= bumpTarget) break;
    const along = rng.range(-10, 10);
    const x = seg.axis === 'x' ? seg.cx + along : seg.cx;
    const z = seg.axis === 'x' ? seg.cz : seg.cz + along;
    if (!clearOfDoors(x, z, MAP.CLEARANCE_DOOR - 2)) continue;
    if (!clearOfSpawns(x, z, 12)) continue;
    if (ramps.some((r) => dist2(r.x, r.z, x, z) < 15 * 15)) continue;
    if (bumps.some((b) => dist2(b.x, b.z, x, z) < 12 * 12)) continue;
    const w = seg.axis === 'x' ? MAP.BUMP_DEPTH : MAP.BUMP_WIDTH;
    const d = seg.axis === 'x' ? MAP.BUMP_WIDTH : MAP.BUMP_DEPTH;
    bumps.push({ x, z, w, d, h: MAP.BUMP_HEIGHT });
  }

  // --- obstacles: barriers across a lane, bins near the kerb ---
  const obstacles: Obstacle[] = [];
  const obstacleTarget = rng.int(MAP.OBSTACLE_COUNT[0], MAP.OBSTACLE_COUNT[1]);
  for (const seg of rng.shuffle(segments)) {
    if (obstacles.length >= obstacleTarget) break;
    const along = rng.range(-12, 12);
    const barrier = rng.chance(0.55);
    const off = barrier ? (rng.chance(0.5) ? 3 : -3) : rng.chance(0.5) ? 4.9 : -4.9;
    const x = seg.axis === 'x' ? seg.cx + along : seg.cx + off;
    const z = seg.axis === 'x' ? seg.cz + off : seg.cz + along;
    if (!clearOfDoors(x, z, MAP.CLEARANCE_DOOR - 3)) continue;
    if (!clearOfSpawns(x, z, 10)) continue;
    if (ramps.some((r) => dist2(r.x, r.z, x, z) < 12 * 12)) continue;
    if (bumps.some((b) => dist2(b.x, b.z, x, z) < 6 * 6)) continue;
    if (obstacles.some((o) => dist2(o.x, o.z, x, z) < 7 * 7)) continue;
    if (barrier) {
      const w = seg.axis === 'x' ? 0.7 : 3.2;
      const d = seg.axis === 'x' ? 3.2 : 0.7;
      obstacles.push({ x, z, w, d, h: 1.0, kind: 'barrier' });
    } else {
      obstacles.push({ x, z, w: 0.9, d: 0.9, h: 1.1, kind: 'bin' });
    }
  }

  // --- boundary walls (inner face at +-halfExtent) ---
  const t = MAP.WALL_THICK;
  const len = halfExtent * 2 + t * 2;
  const walls: WallBox[] = [
    { x: 0, z: -(halfExtent + t / 2), w: len, d: t, h: MAP.WALL_HEIGHT },
    { x: 0, z: halfExtent + t / 2, w: len, d: t, h: MAP.WALL_HEIGHT },
    { x: -(halfExtent + t / 2), z: 0, w: t, d: len, h: MAP.WALL_HEIGHT },
    { x: halfExtent + t / 2, z: 0, w: t, d: len, h: MAP.WALL_HEIGHT },
  ];

  // --- park dressing (passable trees and benches) ---
  const trees: Tree[] = [];
  const benches: Rect[] = [];
  const park = blocks[parkBlock]!;
  const treeTarget = rng.int(MAP.TREES[0], MAP.TREES[1]);
  for (let tries = 0; tries < 200 && trees.length < treeTarget; tries++) {
    const x = park.cx + rng.range(-15, 15);
    const z = park.cz + rng.range(-15, 15);
    if (trees.some((tr) => dist2(tr.x, tr.z, x, z) < 5 * 5)) continue;
    trees.push({ x, z, s: rng.range(0.8, 1.4) });
  }
  const benchCount = rng.int(3, 4);
  for (let k = 0; k < benchCount; k++) {
    const alongX = rng.chance(0.5);
    benches.push({
      x: park.cx + rng.range(-10, 10),
      z: park.cz + rng.range(-10, 10),
      w: alongX ? 2.2 : 0.7,
      d: alongX ? 0.7 : 2.2,
    });
  }

  return {
    seed,
    half: halfExtent,
    blocks,
    parkBlock,
    roads,
    buildings,
    restaurants,
    customers,
    ramps,
    bumps,
    obstacles,
    walls,
    trees,
    benches,
    spawns,
  };
}
