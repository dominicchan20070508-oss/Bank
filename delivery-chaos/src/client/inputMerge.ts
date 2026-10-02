// How keyboard and touch controls combine into one BikeInput. Pure (no DOM) so it is unit-tested.
import type { BikeInput } from './bike';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Both sources are live at the same time (a laptop with a touch screen, or a tester with a keyboard and a phone):
 * the strongest throttle / brake wins, steering adds up (clamped), the handbrake is on if either asks for it.
 */
export function mergeInput(a: BikeInput, b: BikeInput | null | undefined): BikeInput {
  if (!b) return { ...a };
  return {
    throttle: clamp(Math.max(a.throttle, b.throttle), 0, 1),
    brake: clamp(Math.max(a.brake, b.brake), 0, 1),
    steer: clamp(a.steer + b.steer, -1, 1),
    handbrake: a.handbrake || b.handbrake,
  };
}

/** Anything that can feed the Input class besides the keyboard (the on-screen touch controls). */
export interface InputSource {
  read(): BikeInput;
  consumeHonk(): boolean;
  consumeReset(): boolean;
}
