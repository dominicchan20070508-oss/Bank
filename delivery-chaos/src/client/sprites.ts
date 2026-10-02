// Canvas-textured billboards: player name tags, restaurant signs, customer door labels.
import * as THREE from 'three';
import type { Customer, FoodKind, Restaurant } from '../shared/map';
import { UI_FONT, drawFoodIcon, roundRect } from './icons';
import { placeName } from './i18n';

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

/** Player name above the bike, with a little pointer in the player's colour so teammates can be spotted from afar. */
export function makeNameTag(name: string, color: number, food: FoodKind | null = null): LabelSprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  const hex = '#' + color.toString(16).padStart(6, '0');
  ctx.font = `bold 34px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const iconW = food ? 44 : 0; // carrying something? show what, so teammates' cargo is readable from afar
  const w = Math.min(244, ctx.measureText(name).width + 34 + iconW);
  ctx.fillStyle = 'rgba(30,28,40,0.78)';
  roundRect(ctx, 128 - w / 2, 8, w, 48, 20);
  ctx.fill();
  ctx.strokeStyle = hex;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(name, 128 + iconW / 2, 33, 230 - iconW);
  if (food) {
    ctx.save();
    ctx.translate(128 - w / 2 + 8, 12);
    drawFoodIcon(ctx, food, 40);
    ctx.restore();
  }
  // pointer
  ctx.beginPath();
  ctx.moveTo(108, 62);
  ctx.lineTo(148, 62);
  ctx.lineTo(128, 90);
  ctx.closePath();
  ctx.fillStyle = hex;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2b2a33';
  ctx.stroke();
  return toSprite(c, 0.8);
}

/** set ctx.font so that `text` fits in maxW pixels (shrinking from `size`, never below 55%) */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: string): void {
  ctx.font = `${weight} ${size}px ${UI_FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = `${weight} ${Math.max(size * 0.55, (size * maxW) / w)}px ${UI_FONT}`;
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
  const label = placeName(r);
  fitFont(ctx, label, 300, 62, '900'); // long English names get a smaller font instead of being squashed
  ctx.strokeText(label, 316, 92, 300);
  ctx.fillText(label, 316, 92, 300);
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
  const label = placeName(cu);
  fitFont(ctx, label, 350, 44, 'bold');
  ctx.fillText(label, 192, 58, 350);
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
