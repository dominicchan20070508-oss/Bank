// Keyboard input + the __game.debug.setInput override.
import type { BikeInput } from './bike';
import { QUICK } from '../shared/constants';
import { mergeInput, type InputSource } from './inputMerge';
import { pingForDigit } from './quickWheel';
import { PING_IDS } from '../shared/pings';

/** Keyboard side of the quick-chat wheel: digits 1-6 send at once, holding H opens the wheel (DESIGN §14.3). */
export interface KeyQuickHost {
  /** false in solo / outside a round: H then honks on press and digits do nothing (v0.2) */
  enabled(): boolean;
  isOpen(): boolean;
  open(): void;
  /** commit = send the highlighted slice (H released) */
  close(commit: boolean): void;
  step(dir: 1 | -1): void;
  send(index: number): void;
}

export type InputOverride = Partial<{ throttle: number; brake: number; steer: number; handbrake: boolean }>;

export class Input {
  private readonly keys = new Set<string>();
  private override: InputOverride | null = null;
  private honkQueued = false;
  private resetQueued = false;
  private touch: InputSource | null = null;
  private quick: KeyQuickHost | null = null;
  private hHold: { timer: ReturnType<typeof setTimeout> | null } | null = null;
  /** the input the bike received on the last read() (debug / QA) */
  last: BikeInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  enabled = true;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    const q = this.quick;
    if (!e.repeat) {
      if (e.code === 'KeyH') {
        if (q?.enabled()) this.startHold(q);
        else this.honkQueued = true;
      }
      if (e.code === 'KeyR') this.resetQueued = true;
      if (q?.enabled() && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const id = pingForDigit(e.code);
        if (id) q.send(PING_IDS.indexOf(id));
      }
      if (q?.isOpen()) {
        if (e.code === 'ArrowRight') q.step(1);
        if (e.code === 'ArrowLeft') q.step(-1);
      }
    }
    this.keys.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyH') this.endHold(true);
  };
  private readonly onBlur = () => {
    this.keys.clear();
    this.endHold(false);
  };

  /** H went down with a wheel available: a short press honks (on release), holding opens the wheel */
  private startHold(q: KeyQuickHost): void {
    if (this.hHold) return;
    const hold: { timer: ReturnType<typeof setTimeout> | null } = { timer: null };
    hold.timer = setTimeout(() => {
      hold.timer = null;
      if (this.hHold === hold && q.enabled()) q.open();
    }, QUICK.HOLD_MS);
    this.hHold = hold;
  }

  private endHold(commit: boolean): void {
    const h = this.hHold;
    if (!h) return;
    this.hHold = null;
    if (h.timer) {
      clearTimeout(h.timer);
      if (commit) this.honkQueued = true;
    } else if (this.quick?.isOpen()) this.quick.close(commit);
  }

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

  /** plug in the quick-chat wheel (keyboard side) */
  setQuickHost(h: KeyQuickHost | null): void {
    this.quick = h;
  }

  /** a debug.setInput override is active (QA): the driving assists then stay out of the way */
  get hasOverride(): boolean {
    return this.override !== null;
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
