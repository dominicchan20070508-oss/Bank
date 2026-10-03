// On-screen touch controls (DESIGN §13.3): an analog steering pad on the left, throttle / brake / handbrake / horn /
// reset buttons on the right. True multi-touch: every control tracks its own pointerId, so steering with one thumb
// and holding the throttle with the other work at the same time.
import { QUICK, TOUCH } from '../shared/constants';
import type { BikeInput } from './bike';
import { t } from './i18n';
import type { InputSource } from './inputMerge';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** True on phones / tablets (coarse primary pointer or a touch screen without a mouse). `?touch` forces it elsewhere. */
export function detectTouchDevice(win: Window = window): boolean {
  try {
    const mq = (q: string) => !!win.matchMedia?.(q).matches;
    if (mq('(pointer: coarse)')) return true;
    const hasTouch = (win.navigator?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in win;
    // a touch-screen laptop has a fine primary pointer: it keeps the keyboard UI until the first real touch (see App)
    return hasTouch && !mq('(pointer: fine)');
  } catch {
    return false;
  }
}

type HoldKey = 'throttle' | 'brake' | 'handbrake';
type TapKey = 'reset';

/** What the horn button talks to when it is held long enough to open the quick-chat wheel (DESIGN §14.3). */
export interface QuickHost {
  /** false in solo / outside a round: the horn then honks at once on press, exactly like v0.2 */
  enabled(): boolean;
  open(): void;
  /** thumb offset from where the press started */
  move(dx: number, dy: number): void;
  /** commit = send the slice under the thumb (a release); false = abort */
  close(commit: boolean): void;
}

export class TouchControls implements InputSource {
  readonly root: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly buttons = new Map<string, HTMLElement>();
  private readonly cdFill: HTMLElement;

  private steerPointer: number | null = null;
  private originX = 0;
  private originY = 0;
  private steer = 0;
  private readonly held: Record<HoldKey, Set<number>> = { throttle: new Set(), brake: new Set(), handbrake: new Set() };
  private honkQueued = false;
  private resetQueued = false;
  private visible = false;
  private quick: QuickHost | null = null;
  private hornPress: { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; open: boolean } | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="tc-steer" data-k="steer">
        <div class="tc-hint"><span>&#9664;</span><span>&#9654;</span></div>
        <div class="tc-base" hidden><div class="tc-knob"></div></div>
      </div>
      <div class="tc-right">
        <div class="tc-btn tc-reset tc-small" data-k="reset"><i></i><span class="ic">&#8634;</span><span class="lb" data-t="touch.reset"></span></div>
        <div class="tc-btn tc-horn tc-small" data-k="horn"><span class="ic">&#128239;</span><span class="lb" data-t="touch.horn"></span></div>
        <div class="tc-btn tc-hb tc-small" data-k="handbrake"><span class="ic">&#9888;</span><span class="lb" data-t="touch.handbrake"></span></div>
        <div class="tc-btn tc-brake" data-k="brake"><span class="ic">&#9632;</span><span class="lb" data-t="touch.brake"></span></div>
        <div class="tc-btn tc-gas" data-k="throttle"><span class="ic">&#9650;</span><span class="lb" data-t="touch.throttle"></span></div>
      </div>`;
    parent.append(this.root);
    this.zone = this.root.querySelector('.tc-steer')!;
    this.hint = this.root.querySelector('.tc-hint')!;
    this.base = this.root.querySelector('.tc-base')!;
    this.knob = this.root.querySelector('.tc-knob')!;
    this.cdFill = this.root.querySelector('.tc-reset i')!;
    this.root.querySelectorAll<HTMLElement>('.tc-btn').forEach((b) => this.buttons.set(b.dataset.k!, b));
    this.applyLang();
    this.wireSteer();
    for (const k of ['throttle', 'brake', 'handbrake'] as const) this.wireHold(k);
    this.wireHorn();
    this.wireTap('reset');

    // never let a finger get "stuck": any interruption releases everything
    const release = () => this.releaseAll();
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    window.addEventListener('orientationchange', release);
    this.cleanups.push(() => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
      window.removeEventListener('orientationchange', release);
    });
    // no long-press menu, no text selection, no iOS pinch gestures on the controls
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('selectstart', (e) => e.preventDefault());
    this.root.addEventListener('dragstart', (e) => e.preventDefault());
  }

  applyLang(): void {
    this.root.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
      el.textContent = t(el.dataset.t as Parameters<typeof t>[0]);
    });
  }

  // ---------------------------------------------------------------- wiring
  private wireSteer(): void {
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      if (this.steerPointer !== null) return;
      e.preventDefault();
      this.steerPointer = e.pointerId;
      try {
        z.setPointerCapture(e.pointerId);
      } catch {
        /* implicit capture on touch is enough */
      }
      this.originX = e.clientX;
      this.originY = e.clientY;
      this.steer = 0;
      this.base.hidden = false;
      this.hint.hidden = true;
      this.placeKnob(0, 0);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerPointer) return;
      e.preventDefault();
      const dx = e.clientX - this.originX;
      const dy = e.clientY - this.originY;
      this.steer = clamp(dx / TOUCH.STEER_RADIUS, -1, 1);
      this.placeKnob(clamp(dx, -TOUCH.STEER_RADIUS, TOUCH.STEER_RADIUS), clamp(dy, -TOUCH.STEER_RADIUS * 0.35, TOUCH.STEER_RADIUS * 0.35));
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointer) return;
      this.endSteer();
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  private placeKnob(dx: number, dy: number): void {
    const r = this.zone.getBoundingClientRect();
    this.base.style.left = `${this.originX - r.left}px`;
    this.base.style.top = `${this.originY - r.top}px`;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private endSteer(): void {
    this.steerPointer = null;
    this.steer = 0;
    this.base.hidden = true;
    this.hint.hidden = false;
  }

  private wireHold(key: HoldKey): void {
    const el = this.buttons.get(key)!;
    const set = this.held[key];
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      set.add(e.pointerId);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.classList.add('down');
    });
    const up = (e: PointerEvent) => {
      set.delete(e.pointerId);
      if (set.size === 0) el.classList.remove('down');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  /**
   * The horn button: a short tap honks (on release, so a hold can become the wheel instead), holding it ~0.35 s opens the
   * quick-chat wheel under the thumb. With no wheel available (solo) it honks on press, as in v0.2.
   */
  private wireHorn(): void {
    const el = this.buttons.get('horn')!;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('down');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!this.quick?.enabled()) {
        this.honkQueued = true;
        return;
      }
      if (this.hornPress) return; // a second finger on the horn: ignore
      const press = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: null as ReturnType<typeof setTimeout> | null, open: false };
      press.timer = setTimeout(() => {
        press.timer = null;
        if (this.hornPress !== press || !this.quick?.enabled()) return;
        press.open = true;
        this.quick.open();
      }, QUICK.HOLD_MS);
      this.hornPress = press;
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.hornPress;
      if (!p || p.id !== e.pointerId || !p.open) return;
      e.preventDefault();
      this.quick?.move(e.clientX - p.x, e.clientY - p.y);
    });
    const end = (commit: boolean) => (e: PointerEvent) => {
      el.classList.remove('down');
      const p = this.hornPress;
      if (!p || p.id !== e.pointerId) return;
      this.hornPress = null;
      if (p.timer) clearTimeout(p.timer);
      if (p.open) this.quick?.close(commit);
      else if (commit) this.honkQueued = true; // a short press = one honk
    };
    el.addEventListener('pointerup', end(true));
    el.addEventListener('pointercancel', end(false));
    el.addEventListener('lostpointercapture', end(false));
  }

  private wireTap(key: TapKey): void {
    const el = this.buttons.get(key)!;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.resetQueued = true;
      el.classList.add('down');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  // ---------------------------------------------------------------- InputSource
  read(): BikeInput {
    if (!this.visible) return { throttle: 0, brake: 0, steer: 0, handbrake: false };
    return {
      throttle: this.held.throttle.size ? 1 : 0,
      brake: this.held.brake.size ? 1 : 0,
      steer: this.steer,
      handbrake: this.held.handbrake.size > 0,
    };
  }

  consumeHonk(): boolean {
    const v = this.honkQueued;
    this.honkQueued = false;
    return v;
  }

  consumeReset(): boolean {
    const v = this.resetQueued;
    this.resetQueued = false;
    return v;
  }

  /** hook up the quick-chat wheel */
  setQuickHost(h: QuickHost | null): void {
    this.quick = h;
  }

  /** auto-gas on: the GAS button becomes BOOST */
  setAutoGas(on: boolean): void {
    const lb = this.root.querySelector<HTMLElement>('.tc-gas .lb')!;
    lb.dataset.t = on ? 'touch.boost' : 'touch.throttle';
    lb.textContent = t(on ? 'touch.boost' : 'touch.throttle');
    this.root.classList.toggle('autogas', on);
  }

  // ---------------------------------------------------------------- UI state
  setVisible(v: boolean): void {
    this.visible = v;
    this.root.hidden = !v;
    if (!v) this.releaseAll();
  }

  /** 0..1 of the reset cooldown that has passed (draws the little fill on the reset button) */
  setResetReady(frac: number): void {
    const h = `${Math.round((1 - clamp(frac, 0, 1)) * 100)}%`;
    if (this.cdFill.style.height !== h) this.cdFill.style.height = h;
  }

  releaseAll(): void {
    if (this.hornPress) {
      const p = this.hornPress;
      this.hornPress = null;
      if (p.timer) clearTimeout(p.timer);
      if (p.open) this.quick?.close(false);
    }
    this.endSteer();
    for (const s of Object.values(this.held)) s.clear();
    this.honkQueued = false;
    this.resetQueued = false;
    this.root.querySelectorAll('.down').forEach((n) => n.classList.remove('down'));
  }

  /** screen rectangles that HUD elements must stay out of (the buttons and the idle steering hint) */
  rects(): { x0: number; y0: number; x1: number; y1: number }[] {
    if (!this.visible) return [];
    const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const b of this.buttons.values()) {
      const r = b.getBoundingClientRect();
      out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
    if (!this.hint.hidden) {
      const r = this.hint.getBoundingClientRect(); // the idle steering-pad hint: keep the target arrow off it too
      out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
    return out;
  }

  dispose(): void {
    this.cleanups.forEach((f) => f());
    this.root.remove();
  }
}
