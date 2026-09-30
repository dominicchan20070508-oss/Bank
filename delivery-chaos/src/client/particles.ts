// A single pooled THREE.Points cloud for cheap juice: spill droplets, melt drips, dust, sparks, confetti.
import * as THREE from 'three';
import { VIEW } from '../shared/constants';

export class Particles {
  readonly points: THREE.Points;
  private readonly n = VIEW.PARTICLE_MAX;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grav: Float32Array;
  private readonly baseCol: Float32Array;
  private cursor = 0;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.PointsMaterial;
  private readonly tex: THREE.CanvasTexture;

  constructor() {
    const n = this.n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n);
    this.baseCol = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -1000;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    this.tex = new THREE.CanvasTexture(c);
    this.mat = new THREE.PointsMaterial({ size: 0.3, map: this.tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05 });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  /**
   * Emit `count` particles at (x,y,z). dir = mean velocity, spread = random velocity range, gravity in m/s^2 (positive = falls).
   */
  burst(x: number, y: number, z: number, count: number, color: number, opts: { life?: number; spread?: number; dir?: [number, number, number]; gravity?: number; speed?: number } = {}): void {
    const c = new THREE.Color(color);
    const life = opts.life ?? 0.8;
    const spread = opts.spread ?? 3;
    const dir = opts.dir ?? [0, 0, 0];
    const g = opts.gravity ?? 12;
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = dir[0] + (Math.random() - 0.5) * spread * 2;
      this.vel[i * 3 + 1] = dir[1] + Math.random() * spread;
      this.vel[i * 3 + 2] = dir[2] + (Math.random() - 0.5) * spread * 2;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
      this.grav[i] = g;
      this.baseCol[i * 3] = c.r;
      this.baseCol[i * 3 + 1] = c.g;
      this.baseCol[i * 3 + 2] = c.b;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i] = this.life[i]! - dt;
      const i3 = i * 3;
      if (this.life[i]! <= 0) {
        this.pos[i3 + 1] = -1000;
        continue;
      }
      this.vel[i3 + 1] = this.vel[i3 + 1]! - this.grav[i]! * dt;
      this.pos[i3] = this.pos[i3]! + this.vel[i3]! * dt;
      this.pos[i3 + 1] = this.pos[i3 + 1]! + this.vel[i3 + 1]! * dt;
      this.pos[i3 + 2] = this.pos[i3 + 2]! + this.vel[i3 + 2]! * dt;
      if (this.pos[i3 + 1]! < 0.05) {
        this.pos[i3 + 1] = 0.05;
        this.vel[i3 + 1] = 0;
        this.vel[i3] = this.vel[i3]! * 0.5;
        this.vel[i3 + 2] = this.vel[i3 + 2]! * 0.5;
      }
      const f = Math.min(1, (this.life[i]! / this.maxLife[i]!) * 2); // fade out over the last half of life
      this.col[i * 4] = this.baseCol[i3]!;
      this.col[i * 4 + 1] = this.baseCol[i3 + 1]!;
      this.col[i * 4 + 2] = this.baseCol[i3 + 2]!;
      this.col[i * 4 + 3] = f;
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.color!.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
    this.points.removeFromParent();
  }
}
