// Lean / balance model (DESIGN §4). Pure logic: no three, no DOM, no cannon.
//
//   lean'' = G·sin(lean) − K(v)·(lean − leanTarget) − C·lean' + disturbance
//   leanTarget = steer · clamp(v/8, 0, 1) · 0.5        (lean > 0 = leaning to the rider's right; steer > 0 = right)
//   K(v) = 4 + 26·clamp(v/6, 0, 1); "feet down" (v < 1 and no throttle) => K = 40
//   disturbance = lateral acceleration + bumps / landings / wall hits (via kick()/extra); the low-speed wobble nudges leanTarget
import { BALANCE } from '../shared/constants';

export interface BalanceState {
  lean: number;
  leanVel: number;
  time: number;
  phaseA: number;
  phaseB: number;
}

export interface BalanceInput {
  dt: number;
  steer: number; // -1..1 (+ = right)
  speed: number; // |forward speed| m/s
  throttle: number; // 0..1
  aLat: number; // lateral acceleration toward the rider's right (m/s^2)
  extra?: number; // additional lean acceleration (rad/s^2)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createBalance(seed = 1): BalanceState {
  // two fixed, seed-dependent phases keep the wobble deterministic but different per bike
  const a = ((seed * 2654435761) >>> 0) / 4294967296;
  const b = ((seed * 40503 + 977) >>> 0) / 4294967296;
  return { lean: 0, leanVel: 0, time: 0, phaseA: a * Math.PI * 2, phaseB: b * Math.PI * 2 };
}

export function resetBalance(s: BalanceState): void {
  s.lean = 0;
  s.leanVel = 0;
}

export function isFeetDown(speed: number, throttle: number): boolean {
  return speed < BALANCE.FEET_SPEED && throttle < 0.05;
}

export function stiffness(speed: number, feetDown: boolean): number {
  if (feetDown) return BALANCE.K_FEET;
  return BALANCE.K_BASE + BALANCE.K_SPEED * clamp(speed / BALANCE.K_SPEED_REF, 0, 1);
}

export function leanTarget(steer: number, speed: number): number {
  return steer * clamp(speed / BALANCE.TARGET_SPEED_REF, 0, 1) * BALANCE.TARGET_MAX;
}

/** Instantaneous push on the lean velocity (wall hit, landing, bump). */
export function kick(s: BalanceState, dLeanVel: number): void {
  s.leanVel = clamp(s.leanVel + dLeanVel, -BALANCE.MAX_LEAN_VEL, BALANCE.MAX_LEAN_VEL);
}

export function isTipped(s: BalanceState): boolean {
  return Math.abs(s.lean) > BALANCE.CRASH_LEAN;
}

/**
 * Low-speed wobble as a lean-angle offset in rad (smooth, deterministic, strongest when creeping along). It is added to
 * the lean target rather than injected as a torque so the spring can never amplify it into a fall by itself.
 */
export function wobble(s: BalanceState, speed: number, feetDown: boolean): number {
  const fade = clamp(1 - speed / BALANCE.NOISE_SPEED, 0, 1) * (feetDown ? BALANCE.NOISE_FEET_MULT : 1);
  if (fade <= 0) return 0;
  const w = Math.sin(s.time * 2.3 + s.phaseA) + 0.6 * Math.sin(s.time * 5.7 + s.phaseB);
  return (BALANCE.NOISE_LEAN * fade * w) / 1.6;
}

const MAX_STEP = 1 / 120;

/** Advance the lean by dt (sub-stepped for stability). */
export function stepBalance(s: BalanceState, inp: BalanceInput): void {
  const steps = Math.max(1, Math.ceil(inp.dt / MAX_STEP));
  const h = inp.dt / steps;
  const feet = isFeetDown(inp.speed, inp.throttle);
  const K = stiffness(inp.speed, feet);
  const target = leanTarget(inp.steer, inp.speed);
  const extra = inp.extra ?? 0;
  for (let i = 0; i < steps; i++) {
    s.time += h;
    // inertia pushes the bike outward: lateral accel to the right tips it to the left
    const dist = -BALANCE.LAT_GAIN * inp.aLat + extra;
    const acc = BALANCE.G * Math.sin(s.lean) - K * (s.lean - (target + wobble(s, inp.speed, feet))) - BALANCE.C * s.leanVel + dist;
    s.leanVel = clamp(s.leanVel + acc * h, -BALANCE.MAX_LEAN_VEL, BALANCE.MAX_LEAN_VEL);
    s.lean += s.leanVel * h;
  }
}
