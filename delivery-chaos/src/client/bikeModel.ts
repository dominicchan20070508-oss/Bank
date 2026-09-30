// Low-poly motorbike + rider built from primitives. Faces local +z. Used for the local bike and remote bikes.
import * as THREE from 'three';
import type { FoodKind } from '../shared/map';
import { makeNameTag, type LabelSprite } from './sprites';

export interface BikePose {
  x: number;
  y: number; // ground contact height under the bike
  z: number;
  heading: number;
  lean: number;
  speedFwd: number;
  steer: number;
  crashT: number; // 0 = fine, (0,1] = crash animation progress
  crashSide: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class BikeModel {
  readonly root = new THREE.Group();
  readonly leanGroup = new THREE.Group();
  readonly cargoMount = new THREE.Group();
  private readonly rider = new THREE.Group();
  private readonly fork = new THREE.Group();
  private readonly wheels: THREE.Object3D[] = [];
  private spin = 0;
  private detached = false;
  private crashLean0 = 0;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private tag: LabelSprite | null = null;
  private readonly tagBase = new THREE.Vector2(1, 1);

  constructor(readonly color: number, name?: string) {
    this.root.rotation.order = 'YXZ';
    this.leanGroup.rotation.order = 'ZXY';
    this.root.add(this.leanGroup);

    const body = this.mat(color);
    const dark = this.mat(0x2b2a33);
    const metal = this.mat(0x9aa3ad);
    const skin = this.mat(0xf2c4a0);
    const jacket = this.mat(new THREE.Color(color).multiplyScalar(0.75).getHex());
    const helmet = this.mat(0xffffff);
    const tire = this.mat(0x1e1e24);

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.leanGroup) => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.geos.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // wheels (with a spoke bar so the spin is visible)
    const wheelR = 0.36;
    const makeWheel = (z: number, parent: THREE.Object3D) => {
      const wg = new THREE.Group();
      wg.position.set(0, wheelR, z);
      const cg = new THREE.CylinderGeometry(wheelR, wheelR, 0.16, 18);
      cg.rotateZ(Math.PI / 2);
      this.geos.push(cg);
      const tyre = new THREE.Mesh(cg, tire);
      tyre.castShadow = true;
      wg.add(tyre);
      const hubG = new THREE.CylinderGeometry(0.17, 0.17, 0.2, 10);
      hubG.rotateZ(Math.PI / 2);
      this.geos.push(hubG);
      wg.add(new THREE.Mesh(hubG, metal));
      const spokeG = new THREE.BoxGeometry(0.22, 0.06, wheelR * 1.7);
      this.geos.push(spokeG);
      wg.add(new THREE.Mesh(spokeG, metal));
      parent.add(wg);
      this.wheels.push(wg);
    };
    makeWheel(-0.66, this.leanGroup);

    // frame, engine, seat, tank, rear fender
    box(0.2, 0.22, 1.15, dark, 0, 0.58, 0);
    box(0.3, 0.3, 0.42, metal, 0, 0.5, 0.05);
    box(0.34, 0.1, 0.62, dark, 0, 0.86, -0.28);
    box(0.34, 0.24, 0.36, body, 0, 0.84, 0.16);
    box(0.3, 0.05, 0.5, body, 0, 0.62, -0.72);
    // rear rack for the cargo
    box(0.62, 0.06, 0.62, dark, 0, 0.93, -0.74);
    box(0.06, 0.28, 0.06, dark, 0.26, 0.78, -0.95);
    box(0.06, 0.28, 0.06, dark, -0.26, 0.78, -0.95);
    // tail light
    box(0.2, 0.08, 0.05, this.mat(0xff3b30), 0, 0.88, -1.06);

    // front fork + wheel + handlebar (steers)
    this.fork.position.set(0, 0.36, 0.66);
    this.leanGroup.add(this.fork);
    const forkBar = box(0.07, 0.7, 0.07, metal, 0, 0.33, -0.03, this.fork);
    forkBar.rotation.x = -0.25;
    makeWheel(0, this.fork);
    this.wheels[1]!.position.set(0, 0, 0);
    box(0.78, 0.06, 0.06, dark, 0, 0.72, -0.13, this.fork);
    box(0.34, 0.26, 0.4, body, 0, 0.5, 0.0, this.fork); // front fairing
    box(0.16, 0.12, 0.05, this.mat(0xfff6b0), 0, 0.53, 0.21, this.fork); // headlight

    // rider (a child of leanGroup, so it leans with the bike)
    this.leanGroup.add(this.rider);
    box(0.42, 0.56, 0.26, jacket, 0, 1.28, -0.12, this.rider).rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), helmet);
    this.geos.push(head.geometry);
    head.position.set(0, 1.7, 0.03);
    head.castShadow = true;
    this.rider.add(head);
    const visor = box(0.3, 0.1, 0.1, dark, 0, 1.7, 0.2, this.rider);
    visor.rotation.x = 0.1;
    box(0.4, 0.06, 0.4, body, 0, 1.86, 0.02, this.rider).scale.set(0.9, 1, 0.9); // helmet stripe/top in player colour
    for (const sx of [-1, 1]) {
      const arm = box(0.11, 0.11, 0.62, jacket, sx * 0.3, 1.13, 0.22, this.rider);
      arm.rotation.x = 0.35;
      box(0.13, 0.13, 0.13, skin, sx * 0.3, 1.02, 0.5, this.rider);
      const leg = box(0.14, 0.5, 0.16, dark, sx * 0.24, 0.72, -0.05, this.rider);
      leg.rotation.x = -0.2;
      box(0.15, 0.1, 0.28, dark, sx * 0.26, 0.44, 0.05, this.rider);
    }

    this.cargoMount.position.set(0, 0.96, -0.74);
    this.leanGroup.add(this.cargoMount);

    if (name) this.setName(name);
  }

  private mat(color: number | THREE.Color): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color });
    this.mats.push(m);
    return m;
  }

  setName(name: string, carrying: FoodKind | null = null): void {
    this.tag?.dispose();
    if (this.tag) this.root.remove(this.tag.sprite);
    this.tag = makeNameTag(name, this.color, carrying);
    this.tag.sprite.center.set(0.5, 0); // anchored at the pointer tip, so the tag grows upward when scaled
    this.tag.sprite.position.set(0, 2.85, 0);
    this.tagBase.set(this.tag.sprite.scale.x, this.tag.sprite.scale.y);
    this.root.add(this.tag.sprite);
  }

  setTagScale(k: number): void {
    if (this.tag) this.tag.sprite.scale.set(this.tagBase.x * k, this.tagBase.y * k, 1);
  }

  update(p: BikePose, dt: number): void {
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = p.heading;
    this.leanGroup.rotation.z = p.lean;
    this.fork.rotation.y = -p.steer * 0.45;
    this.spin += (p.speedFwd * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x = this.spin;

    // crash: the rider is thrown off in an arc, lies on the road ahead of the bike, then hops back on
    const t = p.crashT;
    if (t > 0) {
      if (!this.detached) {
        this.detached = true;
        this.crashLean0 = p.lean;
        this.root.add(this.rider); // leave the leaning frame: the rider flies on his own
      }
      const e = smooth(0, 0.16, t) * (1 - smooth(0.8, 0.98, t)); // 0 -> 1 -> 0
      const lie = smooth(0.05, 0.3, t) * (1 - smooth(0.8, 0.98, t));
      const arc = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) * 1.7 : 0;
      this.rider.position.set(-p.crashSide * 0.9 * e, arc + 0.12 * lie, 1.9 * e);
      const spin = t < 0.3 ? (t / 0.3) * Math.PI * 2 : 0;
      this.rider.rotation.set(spin * 0.5, 0, this.crashLean0 * (1 - lie) + p.crashSide * 1.5 * lie);
    } else {
      if (this.detached) {
        this.detached = false;
        this.leanGroup.add(this.rider);
      }
      this.rider.position.set(0, 0, 0);
      this.rider.rotation.set(0, 0, 0);
    }
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  dispose(): void {
    this.tag?.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
  }
}
