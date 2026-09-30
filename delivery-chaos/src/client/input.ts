// Keyboard input + the __game.debug.setInput override.
import type { BikeInput } from './bike';

export type InputOverride = Partial<{ throttle: number; brake: number; steer: number; handbrake: boolean }>;

export class Input {
  private readonly keys = new Set<string>();
  private override: InputOverride | null = null;
  private honkQueued = false;
  private resetQueued = false;
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

  read(): BikeInput {
    const k = this.keys;
    const down = (...codes: string[]) => codes.some((c) => k.has(c));
    const out: BikeInput = {
      throttle: down('KeyW', 'ArrowUp') ? 1 : 0,
      brake: down('KeyS', 'ArrowDown') ? 1 : 0,
      steer: (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0),
      handbrake: down('Space'),
    };
    if (this.override) Object.assign(out, this.override);
    if (!this.enabled) return { throttle: 0, brake: 0, steer: 0, handbrake: false };
    return out;
  }

  consumeHonk(): boolean {
    const v = this.honkQueued;
    this.honkQueued = false;
    return v && this.enabled;
  }
  consumeReset(): boolean {
    const v = this.resetQueued;
    this.resetQueued = false;
    return v && this.enabled;
  }
}
