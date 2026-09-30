// Canvas-textured billboards: player name tags, restaurant signs, customer door labels.
import * as THREE from 'three';
import type { Customer, Restaurant } from '../shared/map';
import { UI_FONT, drawFoodIcon, roundRect } from './icons';

export interface LabelSprite {
  sprite: THREE.Sprite;
  dispose(): void;
}

function toSprite(canvas: HTMLCanvasElement, worldHeight: number): LabelSprite {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
  return {
    sprite,
    dispose() {
      tex.dispose();
      mat.dispose();
    },
  };
}

/** Player name above the bike. */
export function makeNameTag(name: string, color: number): LabelSprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = `bold 34px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(244, ctx.measureText(name).width + 34);
  ctx.fillStyle = 'rgba(30,28,40,0.72)';
  roundRect(ctx, 128 - w / 2, 8, w, 48, 20);
  ctx.fill();
  ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 128, 33, 230);
  return toSprite(c, 0.55);
}

export function makeRestaurantSign(r: Restaurant): LabelSprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 176;
  const ctx = c.getContext('2d')!;
  const hex = '#' + r.color.toString(16).padStart(6, '0');
  ctx.fillStyle = hex;
  roundRect(ctx, 6, 6, 500, 164, 34);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#2b2a33';
  ctx.stroke();
  // icon plate
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(96, 88, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(96 - 44, 88 - 44);
  drawFoodIcon(ctx, r.food, 88);
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#2b2a33';
  ctx.lineWidth = 9;
  ctx.font = `900 62px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeText(r.name, 316, 92, 300);
  ctx.fillText(r.name, 316, 92, 300);
  return toSprite(c, 5.2);
}

export function makeCustomerSign(cu: Customer): LabelSprite {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 112;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fffaf0';
  roundRect(ctx, 6, 6, 372, 100, 26);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#2b2a33';
  ctx.stroke();
  ctx.fillStyle = '#2b2a33';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 44px ${UI_FONT}`;
  ctx.fillText(cu.name, 192, 58, 350);
  return toSprite(c, 1.7);
}

export function makeSmallTag(text: string, bg = '#2b2a33'): LabelSprite {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  roundRect(ctx, 4, 6, 152, 52, 20);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 34px ${UI_FONT}`;
  ctx.fillText(text, 80, 33, 140);
  return toSprite(c, 0.7);
}
