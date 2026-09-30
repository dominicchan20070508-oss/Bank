// Real cannon-es rigid bodies for stuff that came off a bike (pizza boxes, ice-cream scoops, soup blobs).
// They live 8 s, collide with the world (not with bikes), and the total count is capped.
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { CARGO_VIEW, VIEW } from '../shared/constants';
import type { DebrisKind } from '../shared/protocol';
import { PIZZA_BOX_COLORS, SCOOP_COLORS, SOUP_COLOR } from './cargoView';
import { GROUP, type PhysicsWorld } from './physics';

interface Piece {
  body: CANNON.Body;
  mesh: THREE.Mesh;
  age: number;
}

export class DebrisManager {
  private readonly pieces: Piece[] = [];
  private readonly geos = {
    pizza: new THREE.BoxGeometry(0.66 * CARGO_VIEW.SCALE, 0.13 * CARGO_VIEW.SCALE, 0.66 * CARGO_VIEW.SCALE),
    scoop: new THREE.SphereGeometry(0.23 * CARGO_VIEW.SCALE, 12, 9),
    drop: new THREE.SphereGeometry(0.1, 8, 6),
  };
  private readonly mats = {
    pizza: PIZZA_BOX_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c })),
    scoop: SCOOP_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c })),
    drop: new THREE.MeshLambertMaterial({ color: SOUP_COLOR }),
  };
  private colorCursor = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly phys: PhysicsWorld,
  ) {}

  get count(): number {
    return this.pieces.length;
  }

  spawn(kind: DebrisKind, p: [number, number, number], v: [number, number, number], spin = 6): void {
    // (remote debris comes off the network: ignore anything that isn't a plain, finite, bounded number)
    if (!p || !v || p.length !== 3 || v.length !== 3 || !p.every(Number.isFinite) || !v.every(Number.isFinite)) return;
    if (Math.hypot(p[0], p[1], p[2]) > 5000) return;
    if (kind !== 'pizza' && kind !== 'scoop' && kind !== 'drop') return;
    const speed = Math.hypot(v[0], v[1], v[2]);
    if (speed > 60) v = [(v[0] * 60) / speed, (v[1] * 60) / speed, (v[2] * 60) / speed];
    if (this.pieces.length >= VIEW.DEBRIS_MAX) this.remove(0); // drop the oldest
    let shape: CANNON.Shape;
    let mass: number;
    let mat: THREE.Material;
    if (kind === 'pizza') {
      shape = new CANNON.Box(new CANNON.Vec3(0.33 * CARGO_VIEW.SCALE, 0.065 * CARGO_VIEW.SCALE, 0.33 * CARGO_VIEW.SCALE));
      mass = 0.5;
      mat = this.mats.pizza[this.colorCursor++ % 2]!;
    } else if (kind === 'scoop') {
      shape = new CANNON.Sphere(0.23 * CARGO_VIEW.SCALE);
      mass = 0.35;
      mat = this.mats.scoop[this.colorCursor++ % this.mats.scoop.length]!;
    } else {
      shape = new CANNON.Sphere(0.1);
      mass = 0.05;
      mat = this.mats.drop;
    }
    const body = new CANNON.Body({ mass, shape, material: this.phys.debrisMaterial, linearDamping: 0.05, angularDamping: 0.2 });
    body.position.set(p[0], p[1], p[2]);
    body.velocity.set(v[0], v[1], v[2]);
    body.angularVelocity.set((Math.random() - 0.5) * spin * 2, (Math.random() - 0.5) * spin * 2, (Math.random() - 0.5) * spin * 2);
    body.collisionFilterGroup = GROUP.DEBRIS;
    body.collisionFilterMask = GROUP.STATIC; // bikes and other debris are ghosts to it
    this.phys.world.addBody(body);
    const mesh = new THREE.Mesh(this.geos[kind], mat);
    mesh.castShadow = true;
    mesh.position.copy(body.position as unknown as THREE.Vector3);
    this.scene.add(mesh);
    this.pieces.push({ body, mesh, age: 0 });
  }

  private remove(i: number): void {
    const [piece] = this.pieces.splice(i, 1);
    if (!piece) return;
    this.phys.world.removeBody(piece.body);
    this.scene.remove(piece.mesh);
  }

  update(dt: number): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i]!;
      pc.age += dt;
      if (pc.age >= VIEW.DEBRIS_LIFETIME || pc.body.position.y < -10) {
        this.remove(i);
        continue;
      }
      pc.mesh.position.set(pc.body.position.x, pc.body.position.y, pc.body.position.z);
      pc.mesh.quaternion.set(pc.body.quaternion.x, pc.body.quaternion.y, pc.body.quaternion.z, pc.body.quaternion.w);
      const fade = VIEW.DEBRIS_LIFETIME - pc.age;
      pc.mesh.scale.setScalar(fade < 0.6 ? Math.max(0.01, fade / 0.6) : 1); // shrink away at the end
    }
  }

  dispose(): void {
    while (this.pieces.length) this.remove(0);
    Object.values(this.geos).forEach((g) => g.dispose());
    this.mats.pizza.forEach((m) => m.dispose());
    this.mats.scoop.forEach((m) => m.dispose());
    this.mats.drop.dispose();
  }
}
