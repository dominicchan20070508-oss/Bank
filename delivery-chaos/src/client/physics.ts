// cannon-es world built from the city map: static colliders only (no three / DOM, so it runs in Node tests too).
import * as CANNON from 'cannon-es';
import { BIKE, VIEW } from '../shared/constants';
import type { CityMap, Ramp } from '../shared/map';

export const GROUP = { STATIC: 1, CAR: 2, DEBRIS: 4 } as const;

export interface PhysicsWorld {
  world: CANNON.World;
  carMaterial: CANNON.Material;
  debrisMaterial: CANNON.Material;
  staticMaterial: CANNON.Material;
}

/** Y rotation (radians) that maps a wedge's local +x (climb direction) onto the ramp's world direction. */
export function rampAngle(dir: Ramp['dir']): number {
  return [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir]!;
}

/** Ramp wedge in local space: centred on (0, 0, 0) horizontally, rising from y=0 at x=-L/2 to y=H at x=+L/2. */
export function rampGeometry(len: number, width: number, height: number): { vertices: CANNON.Vec3[]; faces: number[][] } {
  const L = len / 2;
  const W = width / 2;
  const H = height;
  const vertices = [
    new CANNON.Vec3(-L, 0, -W), // 0
    new CANNON.Vec3(L, 0, -W), // 1
    new CANNON.Vec3(L, H, -W), // 2
    new CANNON.Vec3(-L, 0, W), // 3
    new CANNON.Vec3(L, 0, W), // 4
    new CANNON.Vec3(L, H, W), // 5
  ];
  // all faces counter-clockwise seen from outside
  const faces = [
    [0, 1, 4, 3], // bottom
    [1, 2, 5, 4], // back (+x)
    [0, 2, 1], // side -z
    [3, 4, 5], // side +z
    [0, 3, 5, 2], // slope
  ];
  return { vertices, faces };
}

/** Speed bump: a low triangular ridge running along local x (W long), D deep, H high. Gentle 12 degree flanks. */
export function bumpGeometry(width: number, depth: number, height: number): { vertices: CANNON.Vec3[]; faces: number[][] } {
  const W = width / 2;
  const D = depth / 2;
  const vertices = [
    new CANNON.Vec3(-W, 0, -D), // 0
    new CANNON.Vec3(-W, 0, D), // 1
    new CANNON.Vec3(-W, height, 0), // 2
    new CANNON.Vec3(W, 0, -D), // 3
    new CANNON.Vec3(W, 0, D), // 4
    new CANNON.Vec3(W, height, 0), // 5
  ];
  const faces = [
    [0, 3, 4, 1], // bottom
    [0, 2, 5, 3], // flank facing -z
    [1, 4, 5, 2], // flank facing +z
    [0, 1, 2], // end -x
    [3, 5, 4], // end +x
  ];
  return { vertices, faces };
}

/** Flat triangle list (x,y,z,...) for rendering a convex polyhedron described by faces. */
export function polyToTriangles(g: { vertices: CANNON.Vec3[]; faces: number[][] }): number[] {
  const out: number[] = [];
  for (const f of g.faces) {
    for (let k = 1; k < f.length - 1; k++) {
      for (const idx of [f[0]!, f[k]!, f[k + 1]!]) {
        const v = g.vertices[idx]!;
        out.push(v.x, v.y, v.z);
      }
    }
  }
  return out;
}

export function createPhysics(map: CityMap): PhysicsWorld {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -BIKE.GRAVITY, 0) });
  world.allowSleep = false;
  (world.solver as CANNON.GSSolver).iterations = 12;

  const staticMaterial = new CANNON.Material('static');
  const carMaterial = new CANNON.Material('car');
  const debrisMaterial = new CANNON.Material('debris');
  world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, staticMaterial, { friction: 0, restitution: 0, contactEquationStiffness: 1e8, contactEquationRelaxation: 3 }));
  world.addContactMaterial(new CANNON.ContactMaterial(debrisMaterial, staticMaterial, { friction: 0.5, restitution: 0.3 }));

  const addStatic = (body: CANNON.Body) => {
    body.collisionFilterGroup = GROUP.STATIC;
    body.collisionFilterMask = GROUP.CAR | GROUP.DEBRIS;
    world.addBody(body);
  };

  // ground
  const ground = new CANNON.Body({ mass: 0, material: staticMaterial, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  addStatic(ground);

  const addBox = (x: number, z: number, w: number, d: number, h: number) => {
    const body = new CANNON.Body({ mass: 0, material: staticMaterial, shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)) });
    body.position.set(x, h / 2, z);
    addStatic(body);
  };

  for (const b of map.buildings) addBox(b.x, b.z, b.w, b.d, b.h);
  for (const w of map.walls) addBox(w.x, w.z, w.w, w.d, w.h);
  for (const o of map.obstacles) addBox(o.x, o.z, o.w, o.d, o.h);
  for (const b of map.bumps) {
    const alongX = b.w >= b.d;
    const g = bumpGeometry(alongX ? b.w : b.d, alongX ? b.d : b.w, b.h);
    const body = new CANNON.Body({ mass: 0, material: staticMaterial, shape: new CANNON.ConvexPolyhedron({ vertices: g.vertices, faces: g.faces }) });
    body.position.set(b.x, 0, b.z);
    if (!alongX) body.quaternion.setFromEuler(0, Math.PI / 2, 0);
    addStatic(body);
  }

  for (const r of map.ramps) {
    const g = rampGeometry(r.len, r.width, r.height);
    const body = new CANNON.Body({ mass: 0, material: staticMaterial, shape: new CANNON.ConvexPolyhedron({ vertices: g.vertices, faces: g.faces }) });
    body.position.set(r.x, 0, r.z);
    body.quaternion.setFromEuler(0, rampAngle(r.dir), 0);
    addStatic(body);
  }

  return { world, carMaterial, debrisMaterial, staticMaterial };
}

/** Fixed simulation step used everywhere (client, tests). */
export const FIXED_DT = 1 / VIEW.PHYSICS_HZ;
