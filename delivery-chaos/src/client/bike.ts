// Local motorbike controller: "sphere car" (DESIGN §4). A cannon-es sphere carries the position; heading, lean and
// crash state are ours. No three / DOM imports so the controller is unit-testable in Node.
import * as CANNON from 'cannon-es';
import { BALANCE, BIKE } from '../shared/constants';
import { inBuilding, nearestRoadPoint, type CityMap } from '../shared/map';
import { createBalance, kick, resetBalance, stepBalance, type BalanceState } from '../sim/balance';
import type { ALocal } from '../sim/cargo';
import { GROUP, type PhysicsWorld } from './physics';

export interface BikeInput {
  throttle: number; // 0..1
  brake: number; // 0..1 (also reverse when stopped)
  steer: number; // -1..1, + = right
  handbrake: boolean;
}

export const NO_INPUT: BikeInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export type BikeEvent =
  | { type: 'crash'; cause: 'lean' | 'wall' | 'forced'; speed: number }
  | { type: 'recovered' }
  | { type: 'reset' }
  | { type: 'wallHit'; speed: number; nx: number; nz: number }
  | { type: 'bump'; strength: number }
  | { type: 'takeoff' }
  | { type: 'landed'; airTime: number; impact: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const moveToward = (v: number, target: number, maxDelta: number) => (v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta));

export class BikeController {
  readonly body: CANNON.Body;
  readonly balance: BalanceState;
  readonly events: BikeEvent[] = [];

  heading = 0;
  speedFwd = 0; // signed, along heading
  speedLat = 0; // signed, toward the rider's right
  steerSmooth = 0;
  lastInput: BikeInput = NO_INPUT;

  crashed = false;
  crashTime = 0;
  crashSide = 1; // which way the bike falls (visual)
  immunity = 0;
  resetCooldown = 0;

  grounded = false;
  airborne = false;
  airTime = 0;
  private sinceGround = 0;

  readonly aLocal: ALocal = { x: 0, y: 0, z: 0 };
  private readonly prevV = new CANNON.Vec3();
  private readonly preV = new CANNON.Vec3();
  private skipAccel = true;
  private wallFree = 99; // seconds since a wall was last touched
  private stuckTime = 0; // seconds spent on the throttle without moving
  private wallPrevFree = 99;
  private wallCooldown = 0;
  private bumpCooldown = 0;
  private kickToggle = 1;
  private handbrakePrev = false;

  // previous physics state, for render interpolation
  readonly prevPos = new CANNON.Vec3();
  prevHeading = 0;
  prevLean = 0;

  constructor(
    private readonly phys: PhysicsWorld,
    private readonly map: CityMap,
    seed = 1,
  ) {
    this.balance = createBalance(seed);
    this.body = new CANNON.Body({
      mass: BIKE.MASS,
      material: phys.carMaterial,
      shape: new CANNON.Sphere(BIKE.RADIUS),
      fixedRotation: true,
      linearDamping: 0,
      allowSleep: false,
    });
    this.body.collisionFilterGroup = GROUP.CAR;
    this.body.collisionFilterMask = GROUP.STATIC;
    phys.world.addBody(this.body);
  }

  get lean(): number {
    return this.balance.lean;
  }
  get pos(): CANNON.Vec3 {
    return this.body.position;
  }
  /** planar speed, always >= 0 */
  get speed(): number {
    return Math.hypot(this.body.velocity.x, this.body.velocity.z);
  }
  /** 0..1 progress through the crash animation */
  get crashProgress(): number {
    return this.crashed ? clamp(this.crashTime / BIKE.CRASH_TIME, 0, 1) : 0;
  }

  place(x: number, z: number, heading = this.heading): void {
    // never drop the bike into a wall: that makes the solver fling it out at crazy speed
    if (inBuilding(this.map, x, z, BIKE.RADIUS + 0.3)) [x, z] = nearestRoadPoint(this.map, x, z);
    this.body.position.set(x, BIKE.RADIUS + 0.02, z);
    this.body.velocity.set(0, 0, 0);
    this.heading = heading;
    this.speedFwd = this.speedLat = 0;
    this.steerSmooth = 0;
    resetBalance(this.balance);
    this.crashed = false;
    this.crashTime = 0;
    this.airborne = false;
    this.airTime = 0;
    this.sinceGround = 0;
    this.skipAccel = true;
    this.aLocal.x = this.aLocal.y = this.aLocal.z = 0;
    this.syncPrev();
  }

  forceCrash(cause: 'forced' | 'lean' | 'wall' = 'forced', speed = 0): void {
    if (this.crashed) return;
    this.crashed = true;
    this.crashTime = 0;
    this.crashSide = this.balance.lean !== 0 ? Math.sign(this.balance.lean) : this.kickToggle;
    this.kickToggle *= -1;
    this.body.velocity.y = Math.max(this.body.velocity.y, 2.5); // little hop for drama
    this.events.push({ type: 'crash', cause, speed });
  }

  /** R key. Returns false while on cooldown. */
  reset(): boolean {
    if (this.resetCooldown > 0) return false;
    this.resetCooldown = BIKE.RESET_COOLDOWN;
    if (this.crashed) {
      this.recover();
    } else {
      resetBalance(this.balance);
      this.body.velocity.x *= 0.4;
      this.body.velocity.z *= 0.4;
      this.speedFwd *= 0.4;
      this.speedLat = 0;
    }
    this.events.push({ type: 'reset' });
    return true;
  }

  private recover(): void {
    this.crashed = false;
    this.crashTime = 0;
    this.immunity = BIKE.CRASH_IMMUNITY;
    resetBalance(this.balance);
    this.speedFwd = this.speedLat = 0;
    this.body.velocity.x = 0;
    this.body.velocity.z = 0;
    // stuck inside a building (e.g. after a teleport) or outside the walls: move to the nearest road
    const p = this.body.position;
    const lim = this.map.half - 1;
    if (inBuilding(this.map, p.x, p.z, 0) || Math.abs(p.x) > lim || Math.abs(p.z) > lim || p.y < -2) {
      const [x, z] = nearestRoadPoint(this.map, p.x, p.z);
      this.body.position.set(x, BIKE.RADIUS + 0.02, z);
      this.body.velocity.y = 0;
    }
    this.events.push({ type: 'recovered' });
  }

  // ------------------------------------------------------------------ per-tick

  /** Apply controls; call right before world.step(). */
  preStep(dt: number, input: BikeInput): void {
    this.lastInput = input;
    this.resetCooldown = Math.max(0, this.resetCooldown - dt);
    this.immunity = Math.max(0, this.immunity - dt);
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    this.steerSmooth += (clamp(input.steer, -1, 1) - this.steerSmooth) * (1 - Math.exp(-dt / 0.06));

    const v = this.body.velocity;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);

    // "high-side": letting go of the handbrake while sliding hard makes the tyres bite and snaps the bike over
    if (this.handbrakePrev && !input.handbrake && !this.crashed && Math.abs(this.speedLat) > BIKE.HIGHSIDE_MIN) {
      kick(this.balance, -Math.sign(this.speedLat) * (Math.abs(this.speedLat) - BIKE.HIGHSIDE_MIN) * BIKE.HIGHSIDE_KICK);
    }
    this.handbrakePrev = input.handbrake;

    if (this.crashed) {
      // out of control: skid to a stop
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0) {
        const ns = Math.max(0, hs - BIKE.CRASH_DRAG * dt);
        v.x *= ns / hs;
        v.z *= ns / hs;
      }
    } else if (this.sinceGround < 0.08) {
      // ---- grounded arcade control ----
      const vF0 = v.x * fx + v.z * fz;
      let vF = vF0;
      const brake = clamp(input.brake, 0, 1);
      const throttle = clamp(input.throttle, 0, 1);
      if (brake > 0.01) {
        if (vF > 0.2) vF = Math.max(0, vF - BIKE.BRAKE * brake * dt);
        else vF = Math.max(-BIKE.REVERSE_MAX, vF - BIKE.ACCEL * brake * dt);
      } else if (throttle > 0.01) {
        const target = BIKE.VMAX * throttle;
        if (vF < 0) vF = Math.min(0, vF + BIKE.BRAKE * dt); // stop reversing first
        else if (vF < target) vF = Math.min(target, vF + BIKE.ACCEL * dt);
        else vF = Math.max(target, vF - BIKE.COAST_DECEL * dt);
      } else {
        vF = moveToward(vF, 0, BIKE.COAST_DECEL * dt);
      }
      if (input.handbrake) vF = moveToward(vF, 0, BIKE.HANDBRAKE_DECEL * dt);

      // steering: no turning in place, tighter at low speed; reversing flips the direction
      const absV = Math.abs(vF);
      const rate = lerp(BIKE.STEER_LOW, BIKE.STEER_HIGH, clamp(absV / BIKE.VMAX, 0, 1)) * clamp(absV / BIKE.STEER_MIN_SPEED, 0, 1);
      const dir = vF >= 0 ? 1 : -1;
      this.heading -= this.steerSmooth * rate * dir * dt * (input.handbrake ? 1.25 : 1);

      // The world velocity does NOT rotate with the heading: whatever ends up sideways relative to the new heading
      // is slip, which the tyres then kill at GRIP /s (handbrake = slide). This is where the centripetal force comes from.
      const nfx = Math.sin(this.heading);
      const nfz = Math.cos(this.heading);
      const nrx = -Math.cos(this.heading);
      const nrz = Math.sin(this.heading);
      const vFn = v.x * nfx + v.z * nfz + (vF - vF0);
      let vL = v.x * nrx + v.z * nrz;
      vL *= Math.exp(-(input.handbrake ? BIKE.GRIP_HANDBRAKE : BIKE.GRIP) * dt);
      v.x = nfx * vFn + nrx * vL;
      v.z = nfz * vFn + nrz * vL;
      this.speedFwd = vFn;
      this.speedLat = vL;
    } else {
      // ---- airborne: momentum is kept, tiny yaw authority ----
      const vF = v.x * fx + v.z * fz;
      const rate = lerp(BIKE.STEER_LOW, BIKE.STEER_HIGH, clamp(Math.abs(vF) / BIKE.VMAX, 0, 1));
      this.heading -= this.steerSmooth * rate * BIKE.AIR_STEER * dt;
    }
    this.preV.copy(v);
  }

  /** Read back the physics result; call right after world.step(). */
  postStep(dt: number): void {
    const v = this.body.velocity;
    const p = this.body.position;

    // --- contacts: ground + walls ---
    let ground = false;
    let wallNx = 0;
    let wallNz = 0;
    let wallSpeed = 0;
    let wall = false;
    for (const c of this.phys.world.contacts) {
      let nx: number, ny: number, nz: number;
      if (c.bi === this.body) {
        nx = c.ni.x; ny = c.ni.y; nz = c.ni.z;
      } else if (c.bj === this.body) {
        nx = -c.ni.x; ny = -c.ni.y; nz = -c.ni.z;
      } else continue;
      // (nx, ny, nz): normal pointing out of the bike, toward the thing it touches
      if (ny < -0.35) ground = true;
      else if (Math.abs(ny) < 0.3) {
        const hl = Math.hypot(nx, nz) || 1;
        const hx = nx / hl;
        const hz = nz / hl;
        const into = this.preV.x * hx + this.preV.z * hz;
        if (into > wallSpeed) {
          wallSpeed = into;
          wallNx = hx;
          wallNz = hz;
        }
        wall = true;
      }
    }

    // --- airborne / landing ---
    const wasAirborne = this.airborne;
    if (ground) {
      this.sinceGround = 0;
      this.grounded = true;
    } else {
      this.sinceGround += dt;
      this.grounded = false;
    }
    this.airborne = this.sinceGround > BIKE.GROUND_GRACE;
    if (this.airborne) {
      this.airTime += dt;
      if (!wasAirborne && !this.crashed) this.events.push({ type: 'takeoff' });
    } else if (wasAirborne) {
      const impact = Math.max(0, -this.preV.y);
      if (this.airTime >= BIKE.AIRBORNE_MIN_LAND && !this.crashed) {
        this.events.push({ type: 'landed', airTime: this.airTime, impact });
        if (!this.crashed) kick(this.balance, this.kickSign() * impact * BIKE.LAND_KICK);
      }
      this.airTime = 0;
    }

    // --- acceleration in the bike frame (smoothed) ---
    if (this.skipAccel) {
      this.skipAccel = false;
    } else {
      const inv = 1 / dt;
      const ax = clamp((v.x - this.prevV.x) * inv, -BIKE.ACC_CLAMP, BIKE.ACC_CLAMP);
      const ay = clamp((v.y - this.prevV.y) * inv, -BIKE.ACC_CLAMP, BIKE.ACC_CLAMP);
      const az = clamp((v.z - this.prevV.z) * inv, -BIKE.ACC_CLAMP, BIKE.ACC_CLAMP);
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const rx = -Math.cos(this.heading);
      const rz = Math.sin(this.heading);
      const aR = ax * rx + az * rz;
      const aF = ax * fx + az * fz;
      const kXZ = 1 - Math.exp(-dt / BIKE.ACC_TAU_XZ);
      const kY = 1 - Math.exp(-dt / BIKE.ACC_TAU_Y);
      this.aLocal.x += (aR - this.aLocal.x) * kXZ;
      this.aLocal.z += (aF - this.aLocal.z) * kXZ;
      this.aLocal.y += (ay - this.aLocal.y) * kY;
    }
    this.prevV.copy(v);

    // --- bumps: a sharp vertical spike kicks the lean ---
    if (!this.crashed && this.aLocal.y > BIKE.BUMP_KICK_MIN && this.bumpCooldown <= 0) {
      this.bumpCooldown = 0.25;
      const strength = this.aLocal.y - BIKE.BUMP_KICK_MIN;
      kick(this.balance, this.kickSign() * Math.min(3, strength * BIKE.BUMP_KICK_GAIN));
      this.events.push({ type: 'bump', strength: this.aLocal.y });
    }

    // --- walls ---
    // A *new* impact (nothing touched for a moment) can kick the lean or crash the bike. Scraping along a wall you are
    // already touching only hurts when it is really violent, otherwise riding along a wall would keep flipping you.
    if (wall) this.wallFree = 0;
    else this.wallFree += dt;
    const newHit = wall && this.wallPrevFree > BIKE.WALL_REHIT_GAP;
    this.wallPrevFree = this.wallFree;
    const scrape = wall && !newHit;
    if (wall && !this.crashed && wallSpeed > (scrape ? BIKE.WALL_SCRAPE_MIN : BIKE.WALL_KICK_MIN) && this.wallCooldown <= 0) {
      this.wallCooldown = BIKE.WALL_KICK_COOLDOWN;
      const crashSpeed = newHit ? BIKE.WALL_CRASH_SPEED : BIKE.WALL_SCRAPE_CRASH;
      this.events.push({ type: 'wallHit', speed: wallSpeed, nx: wallNx, nz: wallNz });
      if (wallSpeed > crashSpeed && this.immunity <= 0) {
        this.forceCrash('wall', wallSpeed);
      } else {
        // wall on the right pushes the bike over to the left and vice versa
        const rx = -Math.cos(this.heading);
        const rz = Math.sin(this.heading);
        const side = wallNx * rx + wallNz * rz;
        const sign = Math.abs(side) > 0.2 ? -Math.sign(side) : this.kickSign();
        kick(this.balance, sign * (wallSpeed - BIKE.WALL_KICK_MIN) * BIKE.WALL_KICK_GAIN);
      }
    }

    // --- balance ---
    if (this.crashed) {
      this.crashTime += dt;
      // fall over on its side
      this.balance.lean += (this.crashSide * 1.45 - this.balance.lean) * (1 - Math.exp(-dt / 0.15));
      this.balance.leanVel = 0;
      if (this.crashTime >= BIKE.CRASH_TIME) this.recover();
    } else {
      // pinned against something with the throttle held: the rider puts a foot down instead of standing on the gas
      // (contacts flicker while pressing into a wall, so also detect it by behaviour: throttle held, going nowhere)
      if (this.lastInput.throttle > 0.3 && this.speed < 0.6 && this.sinceGround < 0.1) this.stuckTime += dt;
      else this.stuckTime = 0;
      const blocked = (this.wallFree < 0.3 && this.speed < BALANCE.FEET_SPEED) || this.stuckTime > 0.2;
      stepBalance(this.balance, {
        dt,
        steer: this.steerSmooth,
        speed: Math.abs(this.speedFwd),
        throttle: blocked ? 0 : this.lastInput.throttle,
        aLat: this.aLocal.x,
      });
      if (Math.abs(this.balance.lean) > BALANCE.CRASH_LEAN && this.immunity <= 0) {
        this.forceCrash('lean', this.speed);
      } else if (this.immunity > 0) {
        // right after standing the bike up we don't allow an instant re-flip
        this.balance.lean = clamp(this.balance.lean, -BALANCE.CRASH_LEAN * 0.95, BALANCE.CRASH_LEAN * 0.95);
      }
    }

    // --- safety net: fell out of the world / left the walls ---
    const lim = this.map.half + 1;
    if (p.y < -3 || Math.abs(p.x) > lim || Math.abs(p.z) > lim) {
      const [x, z] = nearestRoadPoint(this.map, p.x, p.z);
      p.set(x, BIKE.RADIUS + 0.02, z);
      v.set(0, 0, 0);
      this.skipAccel = true;
    }
  }

  /** alternating sign so random-ish kicks are deterministic and don't always push the same way */
  private kickSign(): number {
    this.kickToggle *= -1;
    return this.kickToggle;
  }

  syncPrev(): void {
    this.prevPos.copy(this.body.position);
    this.prevHeading = this.heading;
    this.prevLean = this.balance.lean;
  }

  /** One full fixed tick (controls -> physics -> readback). */
  step(dt: number, input: BikeInput): void {
    this.syncPrev();
    this.preStep(dt, input);
    this.phys.world.step(dt);
    this.postStep(dt);
  }

  drainEvents(): BikeEvent[] {
    if (this.events.length === 0) return this.events;
    return this.events.splice(0, this.events.length);
  }
}
