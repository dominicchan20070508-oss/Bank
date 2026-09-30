// Cargo models (DESIGN §5): soup slosh, pizza tower, melting ice cream.
// Pure logic: no three, no DOM, no cannon. Views render from `summary()`; the game turns the returned events
// into debris bodies / particles / stats.
//
// Inputs (all in the bike's local frame):  aLocal = (x: lateral accel toward the rider's RIGHT,
// y: vertical accel (smoothed, gravity excluded), z: forward accel), lean (+ = right), speed (m/s).
import { CARGO } from '../shared/constants';
import type { CargoSummary } from '../shared/protocol';
import type { FoodKind } from '../shared/map';

export type { CargoSummary };
export type { FoodKind };

export interface ALocal {
  x: number;
  y: number;
  z: number;
}

export type CargoEvent =
  /** soup left the bowl. dirX/dirZ: which way the surface was heaped (rider-right, forward). */
  | { type: 'spill'; amount: number; level: number; dirX: number; dirZ: number; crash: boolean }
  /** a pizza box flew off. index = its slot in the stack (0 = bottom). dirX/dirZ: tilt direction (rider-right, forward). */
  | { type: 'boxLost'; index: number; remaining: number; dirX: number; dirZ: number; crash: boolean }
  /** an ice-cream scoop fell off. index = its slot (0 = bottom). */
  | { type: 'scoopLost'; index: number; remaining: number; crash: boolean };

export const NO_EVENTS: readonly CargoEvent[] = Object.freeze([]) as readonly CargoEvent[];

export interface Cargo {
  readonly kind: FoodKind;
  /** how many units the order started with (1 for soup) */
  readonly size: number;
  /** 0..1 */
  readonly integrity: number;
  /** HUD text: "汤 68%", "披萨 3/4", "冰淇淋 2/3 · 融化 40%" */
  readonly detail: string;
  update(dt: number, aLocal: ALocal, lean: number, speed: number): readonly CargoEvent[];
  /** the bike crashed: apply the crash penalty and report what came off */
  onCrash(): readonly CargoEvent[];
  summary(): CargoSummary;
}

const MAX_SUB = 1 / 60;

function subSteps(dt: number): [number, number] {
  const n = Math.max(1, Math.ceil(dt / MAX_SUB));
  return [n, dt / n];
}

// ---------------------------------------------------------------------------------------------
export class SoupCargo implements Cargo {
  readonly kind = 'soup' as const;
  readonly size = 1;
  level = 1;
  sx = 0; // surface heaped toward rider-right when > 0
  sz = 0; // ... toward forward when > 0
  private vx = 0;
  private vz = 0;

  get integrity(): number {
    return this.level;
  }
  get detail(): string {
    return `汤 ${Math.round(this.level * 100)}%`;
  }

  update(dt: number, a: ALocal, lean: number, _speed: number): readonly CargoEvent[] {
    const C = CARGO.SOUP;
    if (this.level <= 0) {
      this.sx = this.sz = this.vx = this.vz = 0;
      return NO_EVENTS;
    }
    // leaning to the right lets the soup run to the right (gravity component), same as accelerating left
    const aX = a.x - C.LEAN_G * Math.sin(lean);
    const aZ = a.z;
    const bounce = C.GAIN_Y * Math.max(0, a.y - C.Y_FLOOR); // bumps / landings make the bowl rock fore-aft
    const [n, h] = subSteps(dt);
    let spilled = 0;
    for (let i = 0; i < n; i++) {
      this.vx += (-C.K * this.sx - C.C * this.vx - C.GAIN_X * aX) * h;
      this.vz += (-C.K * this.sz - C.C * this.vz - C.GAIN_Z * aZ - bounce) * h;
      this.sx += this.vx * h;
      this.sz += this.vz * h;
      const mag = Math.hypot(this.sx, this.sz);
      if (mag > C.MAX_S) {
        this.sx *= C.MAX_S / mag;
        this.sz *= C.MAX_S / mag;
      }
      const over = mag - C.SPILL_LIMIT;
      if (over > 0) {
        const amount = Math.min(this.level, over * C.SPILL_RATE * h);
        this.level -= amount;
        spilled += amount;
      }
    }
    if (this.level < 0.002) this.level = 0;
    if (spilled <= 0) return NO_EVENTS;
    return [{ type: 'spill', amount: spilled, level: this.level, dirX: this.sx, dirZ: this.sz, crash: false }];
  }

  onCrash(): readonly CargoEvent[] {
    const before = this.level;
    this.level *= CARGO.SOUP.CRASH_MULT;
    if (this.level < 0.002) this.level = 0;
    this.vx += 2.5; // big slosh
    const amount = before - this.level;
    if (amount <= 0) return NO_EVENTS;
    return [{ type: 'spill', amount, level: this.level, dirX: this.sx, dirZ: this.sz, crash: true }];
  }

  summary(): CargoSummary {
    return { kind: 'soup', a: this.level, b: this.sx, c: this.sz };
  }
}

// ---------------------------------------------------------------------------------------------
export class PizzaCargo implements Cargo {
  readonly kind = 'pizza' as const;
  readonly size: number;
  boxes: number;
  tx = 0;
  tz = 0;
  private vx = 0;
  private vz = 0;

  constructor(size: number) {
    this.size = Math.max(1, Math.round(size));
    this.boxes = this.size;
  }

  get integrity(): number {
    return this.boxes / this.size;
  }
  get detail(): string {
    return `披萨 ${this.boxes}/${this.size}`;
  }

  update(dt: number, a: ALocal, lean: number, _speed: number): readonly CargoEvent[] {
    const P = CARGO.PIZZA;
    if (this.boxes <= 0) {
      this.tx = this.tz = this.vx = this.vz = 0;
      return NO_EVENTS;
    }
    const aX = a.x - P.LEAN_G * Math.sin(lean);
    const aZ = a.z;
    const [n, h] = subSteps(dt);
    let events: CargoEvent[] | null = null;
    for (let i = 0; i < n && this.boxes > 0; i++) {
      // inverted pendulum: taller stacks (n/3) are pushed around more by the same acceleration
      const drive = P.DRIVE * (this.boxes / 3);
      this.vx += (-P.K * this.tx - P.C * this.vx + P.G * this.tx - aX * drive) * h;
      this.vz += (-P.K * this.tz - P.C * this.vz + P.G * this.tz - aZ * drive) * h;
      this.tx += this.vx * h;
      this.tz += this.vz * h;
      const mag = Math.hypot(this.tx, this.tz);
      if (mag > P.MAX_T) {
        this.tx *= P.MAX_T / mag;
        this.tz *= P.MAX_T / mag;
      }
      if (mag > P.TIP_LIMIT) {
        const dirX = this.tx / mag;
        const dirZ = this.tz / mag;
        this.boxes--;
        (events ??= []).push({ type: 'boxLost', index: this.boxes, remaining: this.boxes, dirX, dirZ, crash: false });
        this.tx = dirX * P.RESET;
        this.tz = dirZ * P.RESET;
        this.vx = 0;
        this.vz = 0;
      }
    }
    return events ?? NO_EVENTS;
  }

  onCrash(): readonly CargoEvent[] {
    if (this.boxes <= 0) return NO_EVENTS;
    const dirX = this.tx === 0 && this.tz === 0 ? 0 : this.tx / Math.hypot(this.tx, this.tz);
    const dirZ = this.tx === 0 && this.tz === 0 ? 1 : this.tz / Math.hypot(this.tx, this.tz);
    const events: CargoEvent[] = [];
    while (this.boxes > 0) {
      this.boxes--;
      events.push({ type: 'boxLost', index: this.boxes, remaining: this.boxes, dirX, dirZ, crash: true });
    }
    this.tx = this.tz = this.vx = this.vz = 0;
    return events;
  }

  summary(): CargoSummary {
    return { kind: 'pizza', a: this.boxes, b: this.tx, c: this.tz };
  }
}

// ---------------------------------------------------------------------------------------------
export class IceCargo implements Cargo {
  readonly kind = 'ice' as const;
  readonly size: number;
  scoops: number;
  melt = 0; // 0..1
  wobble = 0;
  private wv = 0;
  private cooldown = 0;

  constructor(size: number) {
    this.size = Math.max(1, Math.round(size));
    this.scoops = this.size;
  }

  get integrity(): number {
    return (this.scoops / this.size) * (1 - CARGO.ICE.MELT_PENALTY * this.melt);
  }
  get detail(): string {
    return `冰淇淋 ${this.scoops}/${this.size} · 融化 ${Math.round(this.melt * 100)}%`;
  }

  update(dt: number, a: ALocal, lean: number, speed: number): readonly CargoEvent[] {
    const I = CARGO.ICE;
    this.melt = Math.min(1, this.melt + (dt / I.MELT_TIME) * (speed < I.STILL_SPEED ? I.STILL_MULT : 1));
    this.cooldown = Math.max(0, this.cooldown - dt);
    const [n, h] = subSteps(dt);
    const aX = a.x - I.LEAN_G * Math.sin(lean);
    for (let i = 0; i < n; i++) {
      this.wv += (-I.WOBBLE_K * this.wobble - I.WOBBLE_C * this.wv - I.WOBBLE_GAIN * aX) * h;
      this.wobble += this.wv * h;
    }
    if (this.scoops > 0 && a.y > I.IMPACT && this.cooldown <= 0) {
      this.scoops--;
      this.cooldown = I.DROP_COOLDOWN;
      return [{ type: 'scoopLost', index: this.scoops, remaining: this.scoops, crash: false }];
    }
    return NO_EVENTS;
  }

  onCrash(): readonly CargoEvent[] {
    this.wv += 2;
    if (this.scoops <= 0) return NO_EVENTS;
    this.scoops--;
    this.cooldown = CARGO.ICE.DROP_COOLDOWN;
    return [{ type: 'scoopLost', index: this.scoops, remaining: this.scoops, crash: true }];
  }

  summary(): CargoSummary {
    return { kind: 'ice', a: this.scoops, b: this.melt, c: this.wobble };
  }
}

// ---------------------------------------------------------------------------------------------
export function createCargo(kind: FoodKind, size: number): Cargo {
  switch (kind) {
    case 'soup':
      return new SoupCargo();
    case 'pizza':
      return new PizzaCargo(size);
    case 'ice':
      return new IceCargo(size);
  }
}

/** Integrity from a network summary (for remote players' HUD-less rendering / sanity checks). */
export function integrityOfSummary(s: CargoSummary, size: number): number {
  switch (s.kind) {
    case 'soup':
      return s.a;
    case 'pizza':
      return s.a / Math.max(1, size);
    case 'ice':
      return (s.a / Math.max(1, size)) * (1 - CARGO.ICE.MELT_PENALTY * s.b);
  }
}
