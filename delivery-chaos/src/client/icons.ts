// Little vector icons drawn with the canvas 2D API (no emoji font or image files needed for in-world / HUD art).
import type { FoodKind } from '../shared/map';

export function drawFoodIcon(ctx: CanvasRenderingContext2D, kind: FoodKind, size: number): void {
  const s = size / 64;
  ctx.save();
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#2b2a33';
  if (kind === 'soup') {
    // steam
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    for (const x of [22, 32, 42]) {
      ctx.beginPath();
      ctx.moveTo(x, 22);
      ctx.bezierCurveTo(x - 5, 16, x + 5, 12, x, 5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2b2a33';
    ctx.lineWidth = 3;
    // soup surface
    ctx.fillStyle = '#ffb84d';
    ctx.beginPath();
    ctx.ellipse(32, 28, 21, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // bowl
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.moveTo(11, 28);
    ctx.quadraticCurveTo(14, 56, 32, 56);
    ctx.quadraticCurveTo(50, 56, 53, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(21, 38, 3, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'pizza') {
    // slice
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath();
    ctx.moveTo(32, 58);
    ctx.lineTo(6, 16);
    ctx.quadraticCurveTo(32, 2, 58, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // crust
    ctx.strokeStyle = '#c9772b';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(8, 17);
    ctx.quadraticCurveTo(32, 5, 56, 17);
    ctx.stroke();
    ctx.strokeStyle = '#2b2a33';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#d63a2f';
    for (const [x, y, r] of [[26, 26, 5], [40, 25, 4.5], [33, 40, 4.5]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // cone
    ctx.fillStyle = '#e9b872';
    ctx.beginPath();
    ctx.moveTo(19, 30);
    ctx.lineTo(45, 30);
    ctx.lineTo(32, 60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, 33); ctx.lineTo(37, 47);
    ctx.moveTo(40, 33); ctx.lineTo(27, 47);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.fillStyle = '#ffd3e6';
    ctx.beginPath();
    ctx.arc(32, 21, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff7eb6';
    ctx.beginPath();
    ctx.arc(32, 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(32, 6, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const urlCache = new Map<string, string>();

/** data: URL of a food icon (cached). */
export function foodIconURL(kind: FoodKind, size = 64): string {
  const key = `${kind}:${size}`;
  let url = urlCache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    drawFoodIcon(c.getContext('2d')!, kind, size);
    url = c.toDataURL();
    urlCache.set(key, url);
  }
  return url;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const UI_FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC","WenQuanYi Zen Hei",system-ui,sans-serif';
