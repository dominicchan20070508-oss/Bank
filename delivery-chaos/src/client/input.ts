// Keyboard input + the __game.debug.setInput override.
import type { BikeInput } from './bike';
import { mergeInput, type InputSource } from './inputMerge';

export type InputOverride = Partial<{ throttle: number; brake: number; steer: number; handbrake: boolean }>;

export class Input {
  private readonly keys = new Set<string>();
  private override: InputOverride | null = null;
  private honkQueued = false;
  private resetQueued = false;
  private touch: InputSource | null = null;
  /** the input the bike received on the last read() (debug / QA) */
  last: BikeInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  enabled = true;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'KeyH') this.honkQueued = true;
      if (e.code === 'KeyR') this.resetQueued = true;
    }
    this.keys.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private readonly onBlur = () => this.keys.clear();

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
  }

  /** debug.setInput: merge fields into the override; null clears it (keyboard control again). */
  setOverride(p: InputOverride | null): void {
    this.override = p === null ? null : { ...(this.override ?? {}), ...p };
  }

  /** plug in the on-screen touch controls; they are merged with the keyboard, never replace it */
  setTouchSource(src: InputSource | null): void {
    this.touch = src;
  }

  read(): BikeInput {
    const k = this.keys;
    const down = (...codes: string[]) => codes.some((c) => k.has(c));
    const keyboard: BikeInput = {
      throttle: down('KeyW', 'ArrowUp') ? 1 : 0,
      brake: down('KeyS', 'ArrowDown') ? 1 : 0,
      steer: (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0),
      handbrake: down('Space'),
    };
    const out = mergeInput(keyboard, this.touch?.read());
    if (this.override) Object.assign(out, this.override);
    if (!this.enabled) return { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.last = out;
    return out;
  }

  consumeHonk(): boolean {
    const v = this.honkQueued;
    this.honkQueued = false;
    const tv = this.touch?.consumeHonk() ?? false; // always drain both queues
    return (v || tv) && this.enabled;
  }
  consumeReset(): boolean {
    const v = this.resetQueued;
    this.resetQueued = false;
    const tv = this.touch?.consumeReset() ?? false;
    return (v || tv) && this.enabled;
  }
}
