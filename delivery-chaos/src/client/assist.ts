// Driving assists (DESIGN §14.1) as one pure function, so they are unit-tested without a browser.
//
//  * Auto-gas (touch default): the bike rolls at a gentle cruise speed on its own. The GAS button becomes BOOST
//    (full throttle). BRAKE slows and stops the bike; once it has stood still, BRAKE must be held for REVERSE_HOLD
//    seconds before the bike reverses, so a short tap never rolls it backwards.
//  * Auto-slow in the target circle (everybody, auto-gas on or off): when the bike is inside the circle of the zone it
//    can pick up / deliver / salvage in, it stops accelerating and brakes gently below the stopping speed, so the
//    player only has to aim. Holding gas (keyboard W, or the touch GAS / BOOST button) overrides it completely, so it
//    can never trap a rider who wants to drive through a circle.
//  * None of this touches rewards.
import { ASSIST, BIKE } from '../shared/constants';
import type { BikeInput } from './bike';

export interface AssistState {
  /** seconds BRAKE has been held while the bike stands still / reverses */
  brakeHeld: number;
}

export const newAssistState = (): AssistState => ({ brakeHeld: 0 });

export interface AssistContext {
  /** auto-gas setting */
  autoGas: boolean;
  /** signed speed along the heading (m/s) */
  speedFwd: number;
  /** the bike is inside (or within the margin of) a circle it could stop in */
  inZone: boolean;
  /** distance (m) from the bike to the centre of that circle; lets the auto-slow brake harder when you arrive fast */
  zoneDist?: number;
  crashed: boolean;
  dt: number;
}

export function applyAssist(state: AssistState, raw: BikeInput, c: AssistContext): BikeInput {
  const out: BikeInput = { ...raw };
  const gasHeld = raw.throttle > ASSIST.HOLD_GAS_ABOVE;
  const brakeHeld = raw.brake > ASSIST.HOLD_GAS_ABOVE;

  if (c.autoGas) {
    if (brakeHeld && c.speedFwd < ASSIST.STOPPED_SPEED) {
      state.brakeHeld += c.dt;
      // stopped (or crawling) and the press is still short: do not reverse yet
      if (state.brakeHeld < ASSIST.REVERSE_HOLD && c.speedFwd > -0.2) out.brake = 0;
    } else if (!brakeHeld) state.brakeHeld = 0;

    if (brakeHeld) out.throttle = 0;
    else out.throttle = gasHeld ? 1 : ASSIST.CRUISE_THROTTLE;
  } else state.brakeHeld = 0;

  // gentle auto-slow in the target circle; holding gas (or braking yourself) overrides it
  if (c.inZone && !c.crashed && !gasHeld && !brakeHeld) {
    out.throttle = 0;
    if (c.speedFwd > ASSIST.ZONE_TARGET_SPEED) {
      // deceleration that reaches the stopping speed by the circle's centre, never gentler than ZONE_BRAKE nor harder than ZONE_BRAKE_MAX
      const need = c.zoneDist === undefined ? 0 : (c.speedFwd * c.speedFwd - ASSIST.ZONE_TARGET_SPEED ** 2) / (2 * Math.max(c.zoneDist, 2));
      out.brake = Math.max(out.brake, Math.min(ASSIST.ZONE_BRAKE_MAX, Math.max(ASSIST.ZONE_BRAKE, need / BIKE.BRAKE)));
    }
  }
  return out;
}

/** "Steadier rack": scale the accelerations / lean that drive the cargo wobble. */
export function steadyDrive<T extends { x: number; y: number; z: number }>(a: T, lean: number, on: boolean, out: T): { a: T; lean: number } {
  if (!on) return { a, lean };
  const k = ASSIST.STEADY_RACK_GAIN;
  out.x = a.x * k;
  out.y = a.y * k;
  out.z = a.z * k;
  return { a: out, lean: lean * k };
}
