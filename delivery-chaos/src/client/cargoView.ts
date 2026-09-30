// Visuals for the three cargo types, driven purely by a CargoSummary (so remote players' cargo renders the same).
// Local axes: three.js +x is the rider's LEFT, so "rider-right" offsets/tilts are negated when applied.
import * as THREE from 'three';
import type { CargoSummary } from '../shared/protocol';
import type { FoodKind } from '../shared/map';
import { CARGO } from '../shared/constants';

export const SCOOP_COLORS = [0xff8fb8, 0x8fe3c0, 0xfff1c9, 0xc9a7ff];
export const SOUP_COLOR = 0xffa63d;
export const PIZZA_BOX_COLORS = [0xe3b071, 0xd39a58];

const BOX_W = 0.66;
const BOX_H = 0.13;

export class CargoView {
  readonly group = new THREE.Group();
  private kind: FoodKind | null = null;
  private size = 1;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  // soup
  private bowl: THREE.Group | null = null;
  private liquid: THREE.Mesh | null = null;
  // pizza
  private boxes: THREE.Mesh[] = [];
  // ice
  private cone: THREE.Mesh | null = null;
  private scoops: THREE.Mesh[] = [];
  private scoopGroup: THREE.Group | null = null;

  private lastSummary: CargoSummary | null = null;

  /** Build the meshes for a new order. */
  setKind(kind: FoodKind, size: number): void {
    this.clear();
    this.kind = kind;
    this.size = size;
    if (kind === 'soup') this.buildSoup();
    else if (kind === 'pizza') this.buildPizza(size);
    else this.buildIce(size);
  }

  clear(): void {
    for (const c of [...this.group.children]) this.group.remove(c);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geos.length = 0;
    this.mats.length = 0;
    this.bowl = this.liquid = this.cone = this.scoopGroup = null;
    this.boxes = [];
    this.scoops = [];
    this.kind = null;
    this.lastSummary = null;
  }

  private mat(color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, ...extra });
    this.mats.push(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  // ---------------------------------------------------------------- soup
  private buildSoup(): void {
    this.bowl = new THREE.Group();
    const pts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.22, 0.0),
      new THREE.Vector2(0.3, 0.05),
      new THREE.Vector2(0.4, 0.2),
      new THREE.Vector2(0.44, 0.34),
      new THREE.Vector2(0.4, 0.34),
      new THREE.Vector2(0.36, 0.2),
      new THREE.Vector2(0.27, 0.08),
      new THREE.Vector2(0.0, 0.06),
    ];
    const lathe = this.geo(new THREE.LatheGeometry(pts, 20));
    const bowlMesh = new THREE.Mesh(lathe, this.mat(0xe63946, { side: THREE.DoubleSide }));
    bowlMesh.castShadow = true;
    this.bowl.add(bowlMesh);
    const rim = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.42, 0.025, 6, 24)), this.mat(0xfff6e6));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.34;
    this.bowl.add(rim);
    this.liquid = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.385, 0.385, 0.03, 24)), this.mat(SOUP_COLOR));
    this.bowl.add(this.liquid);
    this.group.add(this.bowl);
  }

  private updateSoup(s: CargoSummary): void {
    const liq = this.liquid!;
    liq.visible = s.a > 0.01;
    const fill = 0.07 + 0.24 * s.a;
    // heaped toward rider-right (b > 0) => surface tilts so its right side is higher
    const k = 0.55 / CARGO.SOUP.SPILL_LIMIT;
    liq.rotation.set(-s.c * 0.5 * (k * 0.5), 0, -s.b * 0.5 * (k * 0.5));
    // the heaped side climbs up the bowl
    liq.position.set(-s.b * 0.06, fill + Math.hypot(s.b, s.c) * 0.05, s.c * 0.06);
    const r = Math.min(1, 0.85 + 0.15 * (fill / 0.31));
    liq.scale.set(r, 1, r);
  }

  // ---------------------------------------------------------------- pizza
  private buildPizza(n: number): void {
    const boxGeo = this.geo(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_W));
    const stickerGeo = this.geo(new THREE.CircleGeometry(0.2, 16));
    const stickerMat = this.mat(0xd63a2f);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(boxGeo, this.mat(PIZZA_BOX_COLORS[i % 2]!));
      m.castShadow = true;
      const sticker = new THREE.Mesh(stickerGeo, stickerMat);
      sticker.rotation.x = -Math.PI / 2;
      sticker.position.y = BOX_H / 2 + 0.002;
      m.add(sticker);
      this.group.add(m);
      this.boxes.push(m);
    }
  }

  private updatePizza(s: CargoSummary): void {
    const left = Math.round(s.a);
    for (let i = 0; i < this.boxes.length; i++) {
      const m = this.boxes[i]!;
      m.visible = i < left;
      const h = BOX_H * (i + 0.5); // height of this layer above the base
      const bend = 1.4; // how far higher layers shift per unit tilt
      m.position.set(-s.b * h * bend, h, s.c * h * bend);
      m.rotation.set(s.c * 0.9, 0, s.b * 0.9);
    }
  }

  // ---------------------------------------------------------------- ice cream
  private buildIce(n: number): void {
    this.cone = new THREE.Mesh(this.geo(new THREE.ConeGeometry(0.2, 0.55, 14)), this.mat(0xe3ad6a));
    this.cone.rotation.x = Math.PI;
    this.cone.position.y = 0.28;
    this.cone.castShadow = true;
    this.group.add(this.cone);
    this.scoopGroup = new THREE.Group();
    this.group.add(this.scoopGroup);
    const g = this.geo(new THREE.SphereGeometry(0.23, 16, 12));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, this.mat(SCOOP_COLORS[i % SCOOP_COLORS.length]!));
      m.castShadow = true;
      this.scoopGroup.add(m);
      this.scoops.push(m);
    }
  }

  private updateIce(s: CargoSummary): void {
    const left = Math.round(s.a);
    const melt = s.b;
    const wobble = s.c;
    const squash = 1 - 0.38 * melt;
    for (let i = 0; i < this.scoops.length; i++) {
      const m = this.scoops[i]!;
      m.visible = i < left;
      const y = 0.66 + i * 0.36 * (1 - 0.25 * melt);
      const h = y; // sway grows with height
      m.position.set(-wobble * h * 0.9, y, 0);
      m.scale.set(1 + 0.18 * melt, squash, 1 + 0.18 * melt);
    }
    if (this.scoopGroup) this.scoopGroup.rotation.z = wobble * 0.5;
  }

  // ---------------------------------------------------------------- shared
  apply(s: CargoSummary | null): void {
    if (!s || s.kind !== this.kind) return;
    this.lastSummary = s;
    if (s.kind === 'soup') this.updateSoup(s);
    else if (s.kind === 'pizza') this.updatePizza(s);
    else this.updateIce(s);
  }

  /** world position of a cargo slot (for spawning debris right where the item was) */
  slotWorldPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    let obj: THREE.Object3D | undefined;
    if (this.kind === 'pizza') obj = this.boxes[index];
    else if (this.kind === 'ice') obj = this.scoops[index];
    else obj = this.liquid ?? undefined;
    if (obj) obj.getWorldPosition(out);
    else this.group.getWorldPosition(out);
    return out;
  }

  /** world position of the soup surface / bowl rim */
  get summary(): CargoSummary | null {
    return this.lastSummary;
  }
  get currentKind(): FoodKind | null {
    return this.kind;
  }
  get currentSize(): number {
    return this.size;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
