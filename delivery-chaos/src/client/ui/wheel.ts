// The quick-chat wheel (DESIGN §14.3): six slices around the screen centre. Opened by holding the horn (touch) or H
// (keyboard); the pointer / thumb direction picks a slice, letting go sends it, sliding back to the centre cancels.
import { PING_IDS, PING_ICONS, type PingId } from '../../shared/pings';
import { t } from '../i18n';
import { sliceDir, wheelIndex } from '../quickWheel';
import { el } from './dom';

export class QuickWheel {
  readonly root = el('div', 'qwheel');
  private readonly chips: HTMLElement[] = [];
  private readonly knob = el('i', 'qw-knob');
  private readonly hintEl = el('div', 'qw-hint');
  private readonly centerEl = el('div', 'qw-center');
  private sel: number | null = null;
  private mode: 'touch' | 'keys' = 'touch';

  constructor(parent: HTMLElement) {
    this.root.hidden = true;
    const ring = el('div', 'qw-ring');
    PING_IDS.forEach((id, i) => {
      const chip = el('div', 'qw-chip');
      chip.dataset.id = id;
      chip.dataset.i = String(i);
      const d = sliceDir(i);
      chip.style.setProperty('--dx', String(d.x));
      chip.style.setProperty('--dy', String(d.y));
      ring.append(chip);
      this.chips.push(chip);
    });
    this.centerEl.append(el('span', 'qw-x'), this.knob);
    ring.append(this.centerEl);
    this.root.append(this.hintEl, ring);
    parent.append(this.root);
    this.applyLang();
  }

  applyLang(): void {
    PING_IDS.forEach((id, i) => {
      this.chips[i]!.innerHTML = `<span class="qw-n">${i + 1}</span><span class="qw-ic">${PING_ICONS[id]}</span><span class="qw-tx">${t(`ping.${id}`)}</span>`;
    });
    this.hintEl.textContent = t(this.mode === 'touch' ? 'ping.wheelHint.touch' : 'ping.wheelHint.keys');
    this.centerEl.querySelector('.qw-x')!.textContent = t('ping.cancel');
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }
  get selected(): number | null {
    return this.sel;
  }
  get selectedId(): PingId | null {
    return this.sel === null ? null : PING_IDS[this.sel]!;
  }

  open(mode: 'touch' | 'keys'): void {
    this.mode = mode;
    this.root.classList.toggle('keys', mode === 'keys');
    this.applyLang();
    this.setIndex(null);
    this.root.hidden = false;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  /** pointer vector from the start point (touch) or from the wheel centre (mouse) */
  setVector(dx: number, dy: number): void {
    this.setIndex(wheelIndex(dx, dy));
    const r = 34;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / 60) * r;
    this.knob.style.transform = `translate(calc(-50% + ${((dx / len) * k).toFixed(1)}px), calc(-50% + ${((dy / len) * k).toFixed(1)}px))`;
  }

  setIndex(i: number | null): void {
    this.sel = i;
    this.chips.forEach((c, k) => c.classList.toggle('on', k === i));
    this.centerEl.classList.toggle('on', i === null);
    if (i !== null) {
      const d = sliceDir(i);
      this.knob.style.transform = `translate(calc(-50% + ${(d.x * 30).toFixed(1)}px), calc(-50% + ${(d.y * 30).toFixed(1)}px))`;
    }
  }

  /** hide the wheel; returns the picked slice (null = cancelled) */
  close(): number | null {
    const s = this.sel;
    this.root.hidden = true;
    this.sel = null;
    return s;
  }

  /** screen rectangle of the wheel (QA) */
  rect(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!this.isOpen) return null;
    const r = this.root.querySelector('.qw-ring')!.getBoundingClientRect();
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
  }
}
