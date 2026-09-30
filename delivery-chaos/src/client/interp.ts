// Snapshot interpolation for remote riders: keep ~1 s of timestamped states and sample them 100 ms in the past.
// Pure (no three / DOM) so it is unit-tested.
import type { CargoSummary, PlayerStateMsg } from '../shared/protocol';

export interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  h: number;
  l: number;
  v: number;
  crashed: boolean;
  cargo: CargoSummary | null;
}

export const INTERP_DELAY = 0.1; // s
const KEEP = 1.5; // s of history
const MAX_EXTRAPOLATE = 0.2; // s; beyond that the rider just stands still at the last known state

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export function toSample(t: number, s: PlayerStateMsg): Sample {
  return { t, x: s.p[0], y: s.p[1], z: s.p[2], h: s.h, l: s.l, v: s.v, crashed: s.crashed, cargo: s.cargo };
}

export class InterpBuffer {
  private samples: Sample[] = [];

  get length(): number {
    return this.samples.length;
  }

  push(s: Sample): void {
    const last = this.samples[this.samples.length - 1];
    if (last && s.t <= last.t) {
      if (s.t === last.t) this.samples[this.samples.length - 1] = s;
      return; // out-of-order packet: drop
    }
    this.samples.push(s);
    while (this.samples.length > 2 && this.samples[0]!.t < s.t - KEEP) this.samples.shift();
  }

  /** State at `time` (same clock as the pushed samples), or null if nothing was received yet. */
  sample(time: number): Sample | null {
    const a = this.samples;
    if (a.length === 0) return null;
    if (time <= a[0]!.t) return a[0]!;
    const last = a[a.length - 1]!;
    if (time >= last.t) {
      // brief dead-reckoning along the last known heading, then freeze
      const dt = Math.min(time - last.t, MAX_EXTRAPOLATE);
      if (dt <= 0 || last.crashed || last.v < 0.1) return last;
      return { ...last, x: last.x + Math.sin(last.h) * last.v * dt, z: last.z + Math.cos(last.h) * last.v * dt };
    }
    let i = 1;
    while (a[i]!.t < time) i++;
    const p = a[i - 1]!;
    const n = a[i]!;
    const k = (time - p.t) / (n.t - p.t);
    return {
      t: time,
      x: lerp(p.x, n.x, k),
      y: lerp(p.y, n.y, k),
      z: lerp(p.z, n.z, k),
      h: lerpAngle(p.h, n.h, k),
      l: lerp(p.l, n.l, k),
      v: lerp(p.v, n.v, k),
      crashed: k < 0.5 ? p.crashed : n.crashed,
      cargo: n.cargo && p.cargo && n.cargo.kind === p.cargo.kind ? { kind: n.cargo.kind, a: n.cargo.a, b: lerp(p.cargo.b, n.cargo.b, k), c: lerp(p.cargo.c, n.cargo.c, k) } : n.cargo,
    };
  }
}
