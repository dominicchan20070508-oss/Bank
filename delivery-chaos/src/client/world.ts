// three.js scene built from the deterministic CityMap. Static geometry is merged / instanced for speed.
// (The matching cannon colliders live in physics.ts; both are built from the same map data.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP, VIEW } from '../shared/constants';
import { blockCentre, roadLine, type CityMap, type Door } from '../shared/map';
import { bumpGeometry, polyToTriangles, rampAngle, rampGeometry } from './physics';
import { makeCustomerSign, makeRestaurantSign, makeSmallTag, type LabelSprite } from './sprites';

const SKY = 0x8fd3ff;

// ------------------------------------------------------------------ helpers
class QuadBatch {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  add(x0: number, z0: number, x1: number, z1: number, y: number, color: number): void {
    const c = new THREE.Color(color);
    const p = [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0];
    for (let i = 0; i < 6; i++) {
      this.pos.push(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
      this.col.push(c.r, c.g, c.b);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const n: number[] = [];
    for (let i = 0; i < this.pos.length / 3; i++) n.push(0, 1, 0);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    return g;
  }
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#5f8fb5';
  ctx.fillRect(15, 14, 34, 34);
  ctx.fillStyle = '#9fd0ee';
  ctx.fillRect(17, 16, 14, 30);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 14, 34, 34);
  ctx.beginPath();
  ctx.moveTo(32, 14);
  ctx.lineTo(32, 48);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(12, 50, 40, 5); // sill shadow
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function stripeTexture(a: string, b: string, stripes = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b;
  const w = 64 / stripes;
  for (let i = -stripes; i < stripes * 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * w, 0);
    ctx.lineTo(i * w + w / 2, 0);
    ctx.lineTo(i * w + w / 2 + 64, 64);
    ctx.lineTo(i * w + 64, 64);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gradientAlphaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 128, 0, 0); // bottom (canvas y=128) -> top (y=0); uv.v=0 is the cylinder bottom
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#8a8a8a');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ target markers
export class TargetMarker {
  readonly group = new THREE.Group();
  private readonly pillar: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly mats: THREE.MeshBasicMaterial[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(color: number, alpha: THREE.Texture) {
    const mk = (opacity: number, map?: THREE.Texture) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      if (map) m.alphaMap = map;
      this.mats.push(m);
      return m;
    };
    const pg = new THREE.CylinderGeometry(1.3, 1.3, 55, 24, 1, true);
    pg.translate(0, 27.5, 0);
    this.geos.push(pg);
    this.pillar = new THREE.Mesh(pg, mk(0.55, alpha));
    const rg = new THREE.RingGeometry(4.55, 5.0, 64);
    rg.rotateX(-Math.PI / 2);
    this.geos.push(rg);
    this.ring = new THREE.Mesh(rg, mk(0.9));
    this.ring.position.y = 0.12;
    const dg = new THREE.CircleGeometry(4.55, 48);
    dg.rotateX(-Math.PI / 2);
    this.geos.push(dg);
    this.disc = new THREE.Mesh(dg, mk(0.16));
    this.disc.position.y = 0.1;
    this.group.add(this.pillar, this.ring, this.disc);
    this.group.visible = false;
  }

  setColor(color: number): void {
    for (const m of this.mats) m.color.setHex(color);
  }
  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }
  setVisible(v: boolean): void {
    this.group.visible = v;
  }
  update(t: number): void {
    if (!this.group.visible) return;
    const pulse = 1 + 0.12 * Math.sin(t * 4);
    this.pillar.scale.set(pulse, 1, pulse);
    const rp = 1 + 0.025 * Math.sin(t * 5);
    this.ring.scale.set(rp, 1, rp);
  }
  dispose(): void {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------------ world
export class World {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly restaurantMarkers: TargetMarker[] = [];
  readonly customerMarker: TargetMarker;
  private readonly backDoorTags: Map<string, LabelSprite> = new Map();
  private readonly disposers: (() => void)[] = [];
  private readonly fading: { sprite: THREE.Sprite; near: number }[] = [];
  private readonly sunOffset = new THREE.Vector3(38, 70, 26);

  constructor(
    readonly map: CityMap,
    opts: { shadows: boolean },
  ) {
    const scene = this.scene;
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 110, 360);

    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x9aa070, 2.0);
    scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    this.sun.castShadow = opts.shadows;
    const sc = this.sun.shadow.camera;
    sc.left = -VIEW.SHADOW_RANGE;
    sc.right = VIEW.SHADOW_RANGE;
    sc.top = VIEW.SHADOW_RANGE;
    sc.bottom = -VIEW.SHADOW_RANGE;
    sc.near = 5;
    sc.far = 180;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.sun.position.copy(this.sunOffset);
    scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildBuildings();
    this.buildProps();
    this.buildPark();
    this.buildLandmarks();

    const alpha = gradientAlphaTexture();
    this.disposers.push(() => alpha.dispose());
    for (const r of map.restaurants) {
      const m = new TargetMarker(r.color, alpha);
      m.setPosition(r.door.x, r.door.z);
      scene.add(m.group);
      this.restaurantMarkers.push(m);
    }
    this.customerMarker = new TargetMarker(0xffffff, alpha);
    scene.add(this.customerMarker.group);
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(o: T): T {
    this.disposers.push(() => o.dispose());
    return o;
  }

  private buildGround(): void {
    const { map, scene } = this;
    // endless grass
    const grass = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1400, 1400)), this.track(new THREE.MeshLambertMaterial({ color: 0x86c96f })));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    scene.add(grass);

    const flat = new QuadBatch();
    // block plots
    for (const b of map.blocks) {
      const h = MAP.BLOCK / 2;
      flat.add(b.cx - h, b.cz - h, b.cx + h, b.cz + h, 0.02, b.park ? 0x7bd160 : 0xd8d2c4);
    }
    // roads
    for (const r of map.roads) flat.add(r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2, 0.04, 0x40454f);
    // centre dashes + crosswalks
    const yellow = 0xf6d55c;
    const white = 0xf2f2f2;
    for (let k = 0; k <= MAP.BLOCKS; k++) {
      const L = roadLine(k);
      for (let i = 0; i < MAP.BLOCKS; i++) {
        const c = blockCentre(i);
        for (let d = -16; d < 16; d += 6) {
          flat.add(c + d, L - 0.15, c + d + 3, L + 0.15, 0.06, yellow); // along x
          flat.add(L - 0.15, c + d, L + 0.15, c + d + 3, 0.06, yellow); // along z
        }
      }
    }
    for (let a = 0; a <= MAP.BLOCKS; a++) {
      for (let b = 0; b <= MAP.BLOCKS; b++) {
        const cx = roadLine(a);
        const cz = roadLine(b);
        const e = MAP.BLOCK / 2 + 1.2;
        for (let s = -4.5; s <= 4.5; s += 1.5) {
          flat.add(cx + s - 0.4, cz - e - 2, cx + s + 0.4, cz - e, 0.062, white);
          flat.add(cx + s - 0.4, cz + e, cx + s + 0.4, cz + e + 2, 0.062, white);
          flat.add(cx - e - 2, cz + s - 0.4, cx - e, cz + s + 0.4, 0.062, white);
          flat.add(cx + e, cz + s - 0.4, cx + e + 2, cz + s + 0.4, 0.062, white);
        }
      }
    }
    const flatMesh = new THREE.Mesh(this.track(flat.build()), this.track(new THREE.MeshLambertMaterial({ vertexColors: true })));
    flatMesh.receiveShadow = true;
    scene.add(flatMesh);
  }

  private buildBuildings(): void {
    const { map, scene } = this;
    const geos: THREE.BufferGeometry[] = [];
    const tile = { u: 3.6, v: 3.4 };
    for (const b of map.buildings) {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      g.translate(b.x, b.h / 2, b.z);
      const pos = g.attributes.position!;
      const nor = g.attributes.normal!;
      const uv = g.attributes.uv!;
      const col: number[] = [];
      const c = new THREE.Color(b.color);
      for (let i = 0; i < pos.count; i++) {
        const nx = Math.abs(nor.getX(i));
        const nz = Math.abs(nor.getZ(i));
        if (nx > 0.5) uv.setXY(i, pos.getZ(i) / tile.u, (pos.getY(i) - 0.6) / tile.v);
        else if (nz > 0.5) uv.setXY(i, pos.getX(i) / tile.u, (pos.getY(i) - 0.6) / tile.v);
        else uv.setXY(i, 0.03, 0.03); // roof / underside: plain (white) part of the texture
        // slightly darker at the base for depth
        const shade = nx > 0.5 || nz > 0.5 ? 0.92 + 0.08 * Math.min(1, pos.getY(i) / 12) : 1.05;
        col.push(c.r * shade, c.g * shade, c.b * shade);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false)!;
    geos.forEach((g) => g.dispose());
    const tex = this.track(windowTexture());
    const mesh = new THREE.Mesh(this.track(merged), this.track(new THREE.MeshLambertMaterial({ vertexColors: true, map: tex })));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // roof caps (a darker slab) so tall buildings read as boxes with a lid
    const caps: THREE.BufferGeometry[] = [];
    for (const b of map.buildings) {
      const g = new THREE.BoxGeometry(b.w + 0.6, 0.45, b.d + 0.6);
      g.translate(b.x, b.h + 0.22, b.z);
      const col: number[] = [];
      const c = new THREE.Color(b.color).multiplyScalar(0.72);
      for (let i = 0; i < g.attributes.position!.count; i++) col.push(c.r, c.g, c.b);
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      caps.push(g);
    }
    const capMesh = new THREE.Mesh(this.track(mergeGeometries(caps, false)!), this.track(new THREE.MeshLambertMaterial({ vertexColors: true })));
    caps.forEach((g) => g.dispose());
    capMesh.castShadow = true;
    scene.add(capMesh);

    // boundary walls
    const wallMat = this.track(new THREE.MeshLambertMaterial({ color: 0xb98763 }));
    for (const w of map.walls) {
      const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(w.w, w.h, w.d)), wallMat);
      m.position.set(w.x, w.h / 2, w.z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  private buildProps(): void {
    const { map, scene } = this;

    // ramps
    const rampMat = this.track(new THREE.MeshLambertMaterial({ color: 0xf2a900, flatShading: true }));
    const chevron = this.track(stripeTexture('#ffd23f', '#2b2a33', 5));
    for (const r of map.ramps) {
      const gd = rampGeometry(r.len, r.width, r.height);
      const tri = polyToTriangles(gd);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
      g.computeVertexNormals();
      this.track(g);
      const grp = new THREE.Group();
      const body = new THREE.Mesh(g, rampMat);
      body.castShadow = true;
      body.receiveShadow = true;
      grp.add(body);
      // hazard stripes on the slope
      const slopeLen = Math.hypot(r.len, r.height);
      const sg = this.track(new THREE.PlaneGeometry(slopeLen, r.width * 0.9));
      const tex = chevron.clone();
      tex.needsUpdate = true;
      tex.repeat.set(slopeLen / 1.6, 1);
      this.disposers.push(() => tex.dispose());
      const stripes = new THREE.Mesh(sg, this.track(new THREE.MeshLambertMaterial({ map: tex })));
      const slope = new THREE.Group();
      slope.rotation.z = Math.atan2(r.height, r.len);
      slope.position.set(0, r.height / 2, 0);
      stripes.rotation.x = -Math.PI / 2;
      stripes.position.y = 0.03;
      stripes.receiveShadow = true;
      slope.add(stripes);
      grp.add(slope);
      grp.position.set(r.x, 0, r.z);
      grp.rotation.y = rampAngle(r.dir);
      scene.add(grp);
    }

    // speed bumps: striped triangular ridges (same shape as the collider)
    const bumpTex = this.track(stripeTexture('#ffd23f', '#2b2a33', 4));
    for (const b of map.bumps) {
      const alongX = b.w >= b.d;
      const length = alongX ? b.w : b.d;
      const gd = bumpGeometry(length, alongX ? b.d : b.w, b.h);
      const g = new THREE.BufferGeometry();
      const pos = polyToTriangles(gd);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const uv: number[] = [];
      for (let i = 0; i < pos.length; i += 3) uv.push(pos[i]! / 1.2, pos[i + 2]! / 1.2);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      this.track(g);
      const m = new THREE.Mesh(g, this.track(new THREE.MeshLambertMaterial({ map: bumpTex })));
      m.position.set(b.x, 0, b.z);
      if (!alongX) m.rotation.y = Math.PI / 2;
      m.receiveShadow = true;
      m.castShadow = true;
      scene.add(m);
    }

    // obstacles
    const barrierTex = this.track(stripeTexture('#ffffff', '#e63946', 5));
    const binMat = this.track(new THREE.MeshLambertMaterial({ color: 0x2f9e5b }));
    const lidMat = this.track(new THREE.MeshLambertMaterial({ color: 0x1f6f40 }));
    const binGeo = this.track(new THREE.CylinderGeometry(0.45, 0.4, 1.1, 14));
    const lidGeo = this.track(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 14));
    for (const o of map.obstacles) {
      if (o.kind === 'barrier') {
        const along = Math.max(o.w, o.d);
        const g = this.track(new THREE.BoxGeometry(along, o.h, Math.min(o.w, o.d)));
        const tex = barrierTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(along / 1.2, 1);
        this.disposers.push(() => tex.dispose());
        const m = new THREE.Mesh(g, this.track(new THREE.MeshLambertMaterial({ map: tex })));
        m.position.set(o.x, o.h / 2, o.z);
        if (o.d > o.w) m.rotation.y = Math.PI / 2;
        m.castShadow = true;
        scene.add(m);
      } else {
        const m = new THREE.Mesh(binGeo, binMat);
        m.position.set(o.x, 0.55, o.z);
        m.castShadow = true;
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.set(o.x, 1.14, o.z);
        scene.add(m, lid);
      }
    }
  }

  private buildPark(): void {
    const { map, scene } = this;
    if (map.trees.length) {
      const trunkG = this.track(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 8));
      trunkG.translate(0, 0.9, 0);
      const leafG = this.track(new THREE.ConeGeometry(1.7, 3.4, 9));
      leafG.translate(0, 3.2, 0);
      const leafG2 = this.track(new THREE.ConeGeometry(1.3, 2.6, 9));
      leafG2.translate(0, 4.6, 0);
      const trunks = new THREE.InstancedMesh(trunkG, this.track(new THREE.MeshLambertMaterial({ color: 0x8a5a3a })), map.trees.length);
      const leaves = new THREE.InstancedMesh(leafG, this.track(new THREE.MeshLambertMaterial({ color: 0xffffff })), map.trees.length);
      const leaves2 = new THREE.InstancedMesh(leafG2, this.track(new THREE.MeshLambertMaterial({ color: 0xffffff })), map.trees.length);
      const m = new THREE.Matrix4();
      const col = new THREE.Color();
      map.trees.forEach((t, i) => {
        m.makeScale(t.s, t.s, t.s).setPosition(t.x, 0, t.z);
        trunks.setMatrixAt(i, m);
        leaves.setMatrixAt(i, m);
        leaves2.setMatrixAt(i, m);
        col.setHSL(0.3 + ((i * 37) % 10) / 100, 0.55, 0.38 + ((i * 13) % 10) / 100);
        leaves.setColorAt(i, col);
        leaves2.setColorAt(i, col);
      });
      for (const im of [trunks, leaves, leaves2]) {
        im.castShadow = true;
        im.instanceMatrix.needsUpdate = true;
        scene.add(im);
      }
    }
    if (map.benches.length) {
      const geos: THREE.BufferGeometry[] = [];
      for (const b of map.benches) {
        const seat = new THREE.BoxGeometry(b.w, 0.12, b.d);
        seat.translate(b.x, 0.5, b.z);
        const legs = new THREE.BoxGeometry(b.w * 0.9, 0.5, b.d * 0.6);
        legs.translate(b.x, 0.25, b.z);
        geos.push(seat, legs);
      }
      const bench = new THREE.Mesh(this.track(mergeGeometries(geos, false)!), this.track(new THREE.MeshLambertMaterial({ color: 0x9c6b3f })));
      geos.forEach((g) => g.dispose());
      bench.castShadow = true;
      scene.add(bench);
    }
  }

  private doorMesh(door: Door, color: number, awning?: number): void {
    const alongX = door.face === 'N' || door.face === 'S';
    const w = alongX ? 1.9 : 0.28;
    const d = alongX ? 0.28 : 1.9;
    const m = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, 2.7, d)), this.track(new THREE.MeshLambertMaterial({ color })));
    m.position.set(door.wallX + door.nx * 0.14, 1.35, door.wallZ + door.nz * 0.14);
    this.scene.add(m);
    if (awning !== undefined) {
      const aw = new THREE.Mesh(this.track(new THREE.BoxGeometry(alongX ? 5.5 : 2.2, 0.3, alongX ? 2.2 : 5.5)), this.track(new THREE.MeshLambertMaterial({ color: awning })));
      aw.position.set(door.wallX + door.nx * 1.1, 3.4, door.wallZ + door.nz * 1.1);
      aw.castShadow = true;
      this.scene.add(aw);
    }
  }

  /** `fadeNear`: the sign is fully faded out at half this distance from the camera (so it never fills the screen) */
  private addSprite(ls: LabelSprite, x: number, y: number, z: number, fadeNear = 0): void {
    ls.sprite.position.set(x, y, z);
    this.scene.add(ls.sprite);
    this.disposers.push(() => ls.dispose());
    if (fadeNear > 0) this.fading.push({ sprite: ls.sprite, near: fadeNear });
  }

  private buildLandmarks(): void {
    const { map } = this;
    for (const r of map.restaurants) {
      const b = map.buildings[r.buildingId]!;
      this.doorMesh(r.door, 0xfff3d6, r.color);
      this.addSprite(makeRestaurantSign(r), b.x, b.h + 3.4, b.z, 34);
      // a shorter sign right above the entrance, visible from street level
      const doorSign = makeRestaurantSign(r);
      doorSign.sprite.scale.multiplyScalar(0.42);
      this.addSprite(doorSign, r.door.wallX + r.door.nx * 1.5, 5.4, r.door.wallZ + r.door.nz * 1.5, 16);
    }
    for (const c of map.customers) {
      this.doorMesh(c.front, 0x7a4a2b);
      this.doorMesh(c.back, 0x51606b);
      this.addSprite(makeCustomerSign(c), c.front.wallX + c.front.nx * 0.6, 4.6, c.front.wallZ + c.front.nz * 0.6, 24);
      const tag = makeSmallTag('后门', '#51606b');
      this.addSprite(tag, c.back.wallX + c.back.nx * 0.6, 3.6, c.back.wallZ + c.back.nz * 0.6, 16);
      this.backDoorTags.set(c.id, tag);
    }
  }

  // ------------------------------------------------------------------ per-frame
  followSun(focus: THREE.Vector3): void {
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
  }

  update(t: number, cam?: THREE.Vector3): void {
    for (const m of this.restaurantMarkers) m.update(t);
    this.customerMarker.update(t);
    if (cam) {
      for (const f of this.fading) {
        const d = f.sprite.position.distanceTo(cam);
        const a = Math.min(1, Math.max(0, (d - f.near * 0.5) / (f.near * 0.5)));
        f.sprite.material.opacity = a;
        f.sprite.visible = a > 0.02;
      }
    }
  }

  dispose(): void {
    this.restaurantMarkers.forEach((m) => m.dispose());
    this.customerMarker.dispose();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.scene.clear();
  }
}
