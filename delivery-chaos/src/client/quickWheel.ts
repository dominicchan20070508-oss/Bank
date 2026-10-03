// Quick-chat wheel maths + the sender-side throttle (DESIGN §14.3). Pure.
import { PING_IDS, type PingId } from '../shared/pings';
import { QUICK } from '../shared/constants';

export const WHEEL_SLICES = PING_IDS.length; // 6
export const WHEEL_DEADZONE = 26; // px from the start point: inside this a release cancels

/** Slice under the pointer. Slice 0 is centred on "up", the others follow clockwise every 60 degrees. null = centre (cancel). */
export function wheelIndex(dx: number, dy: number, deadzone = WHEEL_DEADZONE): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) < deadzone) return null;
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360; // 0 = up, clockwise
  return Math.round(deg / (360 / WHEEL_SLICES)) % WHEEL_SLICES;
}

/** Centre direction (unit x/y, y down) of slice i */
export function sliceDir(i: number): { x: number; y: number } {
  const a = (i * 2 * Math.PI) / WHEEL_SLICES;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/** Arrow-key navigation on the wheel: no selection starts at the top slice */
export function stepIndex(cur: number | null, dir: 1 | -1): number {
  if (cur === null) return dir === 1 ? 0 : WHEEL_SLICES - 1;
  return (cur + dir + WHEEL_SLICES) % WHEEL_SLICES;
}

/** keyboard digit 1..6 -> preset */
export function pingForDigit(code: string): PingId | null {
  const m = /^(?:Digit|Numpad)([1-6])$/.exec(code);
  return m ? PING_IDS[Number(m[1]) - 1]! : null;
}

/** Sender-side cooldown (the server enforces the same 1.5 s). `now` in ms. */
export class QuickGate {
  private last = -Infinity;
  ready(now: number): boolean {
    return now - this.last >= QUICK.COOLDOWN * 1000;
  }
  /** true = allowed (and recorded) */
  take(now: number): boolean {
    if (!this.ready(now)) return false;
    this.last = now;
    return true;
  }
  reset(): void {
    this.last = -Infinity;
  }
}
