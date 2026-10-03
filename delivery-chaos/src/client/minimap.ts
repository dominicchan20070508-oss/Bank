// 2D canvas minimap: roads, buildings, park, restaurants, customers, players, current target.
import type { CityMap } from '../shared/map';
import { MAP } from '../shared/constants';

export interface MinimapPlayer {
  x: number;
  z: number;
  heading: number;
  color: number;
  me: boolean;
  /** quick-chat flash: 0..1 progress of the expanding ring (undefined = none) */
  flash?: number;
}

export interface MinimapMarker {
  x: number;
  z: number;
  color: number;
  pulse?: boolean;
  /** salvage zones get a filled dot and a bigger ring so they stand out from the pickup rings */
  salvage?: boolean;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly scale: number;
  private readonly half: number;

  constructor(private readonly map: CityMap, readonly size = 176) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.half = map.half + 2;
    this.scale = (size * dpr) / (this.half * 2);
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.canvas.width;
    this.drawBase();
  }

  private sx(x: number): number {
    return (x + this.half) * this.scale;
  }
  private sz(z: number): number {
    return (z + this.half) * this.scale;
  }

  private drawBase(): void {
    const ctx = this.base.getContext('2d')!;
    const s = this.scale;
    ctx.fillStyle = '#7fbf6b';
    ctx.fillRect(0, 0, this.base.width, this.base.height);
    // roads
    ctx.fillStyle = '#4a4f59';
    for (const r of this.map.roads) ctx.fillRect(this.sx(r.x - r.w / 2), this.sz(r.z - r.d / 2), r.w * s, r.d * s);
    // park
    const park = this.map.blocks[this.map.parkBlock]!;
    ctx.fillStyle = '#8fe07a';
    ctx.fillRect(this.sx(park.cx - MAP.BLOCK / 2), this.sz(park.cz - MAP.BLOCK / 2), MAP.BLOCK * s, MAP.BLOCK * s);
    // buildings
    for (const b of this.map.buildings) {
      ctx.fillStyle = b.role === 'restaurant' ? hex(b.color) : '#cfc7b6';
      ctx.fillRect(this.sx(b.x - b.w / 2), this.sz(b.z - b.d / 2), b.w * s, b.d * s);
    }
    // block grid reference dots not needed; outline the city
    ctx.strokeStyle = '#2b2a33';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.base.width - 2, this.base.height - 2);
  }

  draw(players: MinimapPlayer[], restaurantsActive: Set<string>, targets: MinimapMarker[], t: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);

    // restaurants
    for (const r of this.map.restaurants) {
      const on = restaurantsActive.has(r.id);
      const x = this.sx(r.door.x);
      const y = this.sz(r.door.z);
      ctx.fillStyle = hex(r.color);
      ctx.strokeStyle = '#2b2a33';
      ctx.lineWidth = 2;
      const rr = (on ? 6.5 : 4.5) * (this.scale / 0.7);
      ctx.beginPath();
      ctx.rect(x - rr, y - rr, rr * 2, rr * 2);
      ctx.fill();
      ctx.stroke();
    }
    // customers
    for (const c of this.map.customers) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#2b2a33';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.sx(c.front.x), this.sz(c.front.z), 3.2 * (this.scale / 0.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // active targets (pulsing rings)
    for (const m of targets) {
      const pulse = m.pulse ? 1 + 0.25 * Math.sin(t * 6) : 1;
      ctx.strokeStyle = hex(m.color);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.sx(m.x), this.sz(m.z), (m.salvage ? 11 : 9) * pulse * (this.scale / 0.7), 0, Math.PI * 2);
      ctx.stroke();
      if (m.salvage) {
        ctx.fillStyle = hex(m.color);
        ctx.strokeStyle = '#2b2a33';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(this.sx(m.x), this.sz(m.z), 4.5 * (this.scale / 0.7), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    // players (me last)
    const sorted = [...players].sort((a, b) => Number(a.me) - Number(b.me));
    for (const p of sorted) {
      const x = this.sx(p.x);
      const y = this.sz(p.z);
      if (p.flash !== undefined && p.flash >= 0 && p.flash <= 1) {
        // quick-chat flash: a ring that expands and fades around the rider
        ctx.strokeStyle = hex(p.color);
        ctx.globalAlpha = 1 - p.flash;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, (8 + 26 * p.flash) * (s / 0.7), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-p.heading + Math.PI); // heading 0 = +z = down on the map
      ctx.fillStyle = hex(p.color);
      ctx.strokeStyle = p.me ? '#ffffff' : '#2b2a33';
      ctx.lineWidth = p.me ? 2.5 : 1.5;
      const r = (p.me ? 8 : 6.5) * (s / 0.7);
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.25);
      ctx.lineTo(r, r);
      ctx.lineTo(0, r * 0.4);
      ctx.lineTo(-r, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

