// 3D look of a salvage zone (DESIGN §14.3): an orange light pillar + ground ring (same language as the pickup zones),
// a countdown ring that shrinks over the 20 s, and the food icon floating above it.
import * as THREE from 'three';
import { SALVAGE } from '../shared/constants';
import type { FoodKind } from '../shared/map';
import { UI_FONT, drawFoodIcon, roundRect } from './icons';
import { TargetMarker } from './world';

export const SALVAGE_COLOR = 0xff7a3d;

function iconSprite(food: FoodKind): { sprite: THREE.Sprite; dispose(): void } {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff8ea';
  ctx.strokeStyle = '#2b2a33';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(80, 80, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(80 - 38, 80 - 38);
  drawFoodIcon(ctx, food, 76);
  ctx.restore();
  // little SOS badge
  ctx.fillStyle = '#e63946';
  roundRect(ctx, 96, 6, 58, 34, 14);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `900 24px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SOS', 125, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 3.2, 1);
  return {
    sprite,
    dispose() {
      tex.dispose();
      mat.dispose();
    },
  };
}

export class SalvageView {
  readonly group = new THREE.Group();
  private readonly marker: TargetMarker;
  private readonly count: THREE.Mesh;
  private readonly countGeo: THREE.RingGeometry;
  private readonly countMat: THREE.MeshBasicMaterial;
  private readonly icon: { sprite: THREE.Sprite; dispose(): void };

  constructor(
    scene: THREE.Scene,
    alpha: THREE.Texture,
    readonly id: string,
    x: number,
    z: number,
    food: FoodKind,
    private readonly expiresAt: number,
  ) {
    this.marker = new TargetMarker(SALVAGE_COLOR, alpha);
    this.marker.setPosition(0, 0);
    this.marker.setVisible(true);
    this.countGeo = new THREE.RingGeometry(3.7, 4.2, 64);
    this.countGeo.rotateX(-Math.PI / 2);
    this.countMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.count = new THREE.Mesh(this.countGeo, this.countMat);
    this.count.position.y = 0.16;
    this.icon = iconSprite(food);
    this.icon.sprite.position.y = 4.2;
    this.group.add(this.marker.group, this.count, this.icon.sprite);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  /** remaining fraction of the lifetime */
  update(serverNow: number, t: number): void {
    const left = Math.max(0, this.expiresAt - serverNow);
    const f = Math.min(1, left / SALVAGE.TTL);
    this.count.scale.set(Math.max(0.02, f), 1, Math.max(0.02, f));
    // the last 5 s blink so it is clear the window is closing
    this.countMat.opacity = left < 5 ? 0.5 + 0.45 * Math.sin(t * 14) : 0.95;
    this.marker.update(t);
    this.icon.sprite.position.y = 4.2 + 0.25 * Math.sin(t * 3);
  }

  dispose(): void {
    this.marker.dispose();
    this.countGeo.dispose();
    this.countMat.dispose();
    this.icon.dispose();
    this.group.removeFromParent();
  }
}
