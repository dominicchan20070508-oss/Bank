// In-game HUD (text through i18n). Plain DOM; updated cheaply (text/width only when changed).
import { ORDERS, TOUCH } from '../../shared/constants';
import type { CityMap } from '../../shared/map';
import { REQUEST_INFO, type Order } from '../../shared/orders';
import { starThresholds } from '../../shared/scoring';
import { foodIconURL } from '../icons';
import { onLangChange, placeName, t } from '../i18n';
import { esc } from './dom';
import { Popups } from './popups';

export interface OrdersContext {
  map: CityMap;
  myId: string;
  nameOf: (playerId: string) => string;
  /** CSS colour of a rider (the claim chip wears it) */
  colorOf: (playerId: string) => string;
  /** the player tapped a waiting order card ("this one is mine" for the claim) */
  onSelect?: (orderId: string) => void;
  selectedId?: () => string | null;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** short screens (phones in landscape) get the compact HUD */
export const isCompactScreen = () => window.innerHeight <= TOUCH.COMPACT_HEIGHT;

interface Card {
  el: HTMLElement;
  badge: HTMLElement;
  bar: HTMLElement;
  claim: HTMLElement;
  claimShown: boolean;
  order: Order;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class Hud {
  readonly root: HTMLElement;
  readonly popups: Popups;
  private readonly timeEl: HTMLElement;
  private readonly tipsEl: HTMLElement;
  private readonly starFill: HTMLElement;
  private readonly starMarks: HTMLElement[] = [];
  private readonly ordersEl: HTMLElement;
  private readonly cargoLabel: HTMLElement;
  private readonly cargoIcon: HTMLImageElement;
  private readonly cargoFill: HTMLElement;
  private readonly cargoHint: HTMLElement;
  private readonly kmhEl: HTMLElement;
  private readonly kmh2El: HTMLElement;
  private readonly muteEl: HTMLElement;
  private readonly gearEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private chatKeys = false;
  private readonly keysEl: HTMLElement;
  private readonly resetFill: HTMLElement;
  private readonly arrowEl: HTMLElement;
  private readonly arrowDist: HTMLElement;
  private readonly zoneEl: HTMLElement;
  private readonly zoneFg: SVGCircleElement;
  private readonly zoneLbl: HTMLElement;
  private readonly mmEl: HTMLElement;
  private readonly dbgEl: HTMLElement | null;
  private cards = new Map<string, Card>();
  private lastOrder: string[] = [];
  private readonly moreEl: HTMLElement;
  private ctx: OrdersContext | null = null;
  private last = new Map<string, string>();
  private bottomLimit: () => number = () => Infinity;

  constructor(parent: HTMLElement, debug: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-tl panel">
        <div class="hud-time" data-k="time">4:00</div>
        <div class="hud-tips"><span data-t="hud.tips"></span> <b data-k="tips">¥0</b></div>
        <div class="stars"><div class="fill" data-k="starfill"></div></div>
        <div class="hud-spd"><span class="kmh" data-k="kmh2">0</span> <span data-t="hud.kmh"></span></div>
      </div>
      <div class="hud-mute" data-k="mute" role="button" tabindex="-1"></div>
      <div class="hud-gear" data-k="gear" role="button" tabindex="-1">⚙</div>
      <div class="hint" data-k="hint" hidden></div>
      <div class="hud-orders" data-k="orders"></div>
      <div class="hud-cargo panel">
        <div class="cargo-label"><img data-k="cicon" alt="" hidden /><span data-k="clabel"></span></div>
        <div class="cargo-bar"><i data-k="cfill"></i></div>
        <div class="cargo-hint" data-k="chint"></div>
      </div>
      <div class="hud-bl panel">
        <div><span class="kmh" data-k="kmh">0</span> <span data-t="hud.kmh"></span></div>
        <div class="keys" data-k="keys"></div>
        <div class="reset-cd"><i data-k="reset"></i></div>
      </div>
      <div class="hud-mm panel" data-k="mm"></div>
      <div class="arrow" data-k="arrow" hidden><div class="tri"></div><div class="dist" data-k="adist"></div></div>
      <div class="zone" data-k="zone" hidden>
        <svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="42"/><circle class="fg" cx="50" cy="50" r="42" stroke-dasharray="263.9" stroke-dashoffset="263.9"/></svg>
        <div class="lbl" data-k="zlbl"></div>
      </div>
    `;
    parent.append(this.root);
    const q = <T extends HTMLElement = HTMLElement>(k: string) => this.root.querySelector<T>(`[data-k="${k}"]`)!;
    this.timeEl = q('time');
    this.tipsEl = q('tips');
    this.starFill = q('starfill');
    this.ordersEl = q('orders');
    this.moreEl = document.createElement('div');
    this.moreEl.className = 'orders-more';
    this.moreEl.hidden = true;
    window.addEventListener('resize', () => this.fitCards(this.lastOrder));
    this.cargoLabel = q('clabel');
    this.cargoIcon = q<HTMLImageElement>('cicon');
    this.cargoFill = q('cfill');
    this.cargoHint = q('chint');
    this.kmhEl = q('kmh');
    this.kmh2El = q('kmh2');
    this.muteEl = q('mute');
    this.gearEl = q('gear');
    this.hintEl = q('hint');
    this.keysEl = q('keys');
    this.resetFill = q('reset');
    this.arrowEl = q('arrow');
    this.arrowDist = q('adist');
    this.zoneEl = q('zone');
    this.zoneFg = this.zoneEl.querySelector('.fg') as unknown as SVGCircleElement;
    this.zoneLbl = q('zlbl');
    this.mmEl = q('mm');
    for (let i = 0; i < 3; i++) {
      const m = document.createElement('div');
      m.className = 'mark';
      m.textContent = '★';
      this.root.querySelector('.stars')!.append(m);
      this.starMarks.push(m);
    }
    this.popups = new Popups(this.root);
    if (debug) {
      this.dbgEl = document.createElement('div');
      this.dbgEl.className = 'dbg';
      this.root.append(this.dbgEl);
    } else this.dbgEl = null;
    this.applyLang();
    onLangChange(() => this.applyLang());
    // fade the key hints after a while
    setTimeout(() => (this.keysEl.style.opacity = '0.35'), 25000);
  }

  /** (Re)write the static labels in the current language. */
  applyLang(): void {
    this.root.querySelectorAll<HTMLElement>('[data-t]').forEach((n) => {
      n.textContent = t(n.dataset.t as Parameters<typeof t>[0]);
    });
    this.keysEl.innerHTML =
      `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ${t('hud.keys.ride')} · <kbd>${t('hud.keys.space')}</kbd> ${t('hud.keys.handbrake')} · <kbd>H</kbd> ${t('hud.keys.horn')} · <kbd>R</kbd> ${t('hud.keys.reset')}` +
      (this.chatKeys ? ` · <kbd>1</kbd>-<kbd>6</kbd> ${t('hud.keys.chat')}` : '');
    this.gearEl.setAttribute('aria-label', t('settings.open'));
    this.last.delete('clabel');
  }

  /** y (px) above which the order cards must stay, e.g. the top of the touch buttons */
  setBottomLimit(fn: () => number): void {
    this.bottomLimit = fn;
  }

  /** the speaker button in the top-right corner */
  setMuteHandler(onToggle: () => void): void {
    this.muteEl.addEventListener('click', onToggle);
  }

  /** the settings gear in the top-right corner */
  setSettingsHandler(onOpen: () => void): void {
    this.gearEl.addEventListener('click', onOpen);
  }

  /** show the "1-6 quick chat" key hint (online rooms only) */
  setChatKeys(on: boolean): void {
    if (on === this.chatKeys) return;
    this.chatKeys = on;
    this.applyLang();
  }

  /** first-session hint bubble (null hides it) */
  setHint(text: string | null): void {
    this.hintEl.hidden = text === null;
    if (text !== null) this.hintEl.textContent = text;
  }

  setMuted(m: boolean): void {
    this.muteEl.textContent = m ? '🔇' : '🔊';
    this.muteEl.setAttribute('aria-label', t(m ? 'sound.unmute' : 'sound.mute'));
    this.muteEl.classList.toggle('off', m);
  }

  /** on-screen rectangles of the HUD panels (the target arrow avoids them) */
  rects(): ScreenRect[] {
    const out: ScreenRect[] = [];
    for (const sel of ['.hud-tl', '.hud-orders', '.hud-cargo', '.hud-bl', '.hud-mm', '.hud-mute', '.hud-gear', '.hint']) {
      const e = this.root.querySelector<HTMLElement>(sel);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
    return out;
  }

  /** write textContent only when it changed (cheap per-frame updates) */
  private setText(key: string, el: HTMLElement, text: string): void {
    if (this.last.get(key) !== text) {
      this.last.set(key, text);
      el.textContent = text;
    }
  }

  mountMinimap(canvas: HTMLCanvasElement): void {
    this.mmEl.replaceChildren(canvas);
  }

  setVisible(v: boolean): void {
    this.root.hidden = !v;
    if (!v) {
      this.popups.clear();
      this.hintEl.hidden = true;
      this.cards.forEach((c) => c.el.remove());
      this.cards.clear();
      this.last.clear();
    }
  }

  setTime(sec: number): void {
    const s = Math.max(0, Math.ceil(sec));
    this.setText('time', this.timeEl, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    this.timeEl.classList.toggle('low', s <= 30 && s > 0);
  }

  setTips(tips: number, playerCount: number): void {
    this.setText('tips', this.tipsEl, `¥${tips}`);
    const th = starThresholds(playerCount);
    const max = th[2]! * 1.05;
    this.starFill.style.width = `${Math.min(100, (tips / max) * 100)}%`;
    th.forEach((t, i) => {
      const m = this.starMarks[i]!;
      m.style.left = `${(t / max) * 100}%`;
      m.classList.toggle('on', tips >= t);
    });
  }

  // ---------------------------------------------------------------- orders
  setOrders(list: readonly Order[], ctx: OrdersContext): void {
    this.ctx = ctx;
    // what you need to see first: your own order, then who is carrying what, then what is still up for grabs
    const rank = (o: Order) => {
      if (o.status === 'carrying' && o.carrierId === ctx.myId) return 0;
      if (o.status === 'waiting' && o.claimedBy) return 1; // a teammate said "这单我来": keep it in sight (small screens show only 2 cards)
      if (o.status === 'carrying') return 2;
      if (o.status === 'waiting') return 3;
      return 4;
    };
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);
    const seen = new Set<string>();
    for (const o of sorted) {
      seen.add(o.id);
      let card = this.cards.get(o.id);
      if (!card) {
        card = this.makeCard(o, ctx);
        this.cards.set(o.id, card);
      }
      card.order = o;
      this.paintCard(card, ctx);
      this.ordersEl.append(card.el); // (re)append => keeps sorted order
    }
    for (const [id, c] of this.cards) {
      if (!seen.has(id)) {
        c.el.remove();
        this.cards.delete(id);
      }
    }
    this.fitCards(sorted.map((o) => o.id));
  }

  /** Show as many cards as fit under the top-right corner (most important first) and say how many are hidden. */
  private fitCards(orderedIds: string[]): void {
    this.lastOrder = orderedIds;
    const compact = isCompactScreen();
    const cards = orderedIds.map((id) => this.cards.get(id)).filter((c): c is Card => !!c);
    for (const c of cards) c.el.hidden = false;
    this.moreEl.hidden = true;
    this.ordersEl.append(this.moreEl);
    const top = compact ? 50 : 58;
    const avail = Math.min(window.innerHeight - top - (compact ? 10 : 236), this.bottomLimit() - top - 8);
    const maxCards = compact ? 2 : ORDERS.POOL_MAX;
    const fits = (budget: number): number => {
      let used = 0;
      let k = 0;
      for (const c of cards) {
        const h = c.el.offsetHeight + 6;
        if (k >= maxCards || used + h > budget) break;
        used += h;
        k++;
      }
      return k;
    };
    let visible = fits(avail);
    if (visible < cards.length) visible = Math.max(1, fits(avail - 26)); // leave room for the "N more" chip
    cards.forEach((c, i) => (c.el.hidden = i >= visible));
    const hidden = cards.length - visible;
    this.moreEl.hidden = hidden <= 0;
    this.moreEl.textContent = t('hud.more', { n: hidden });
  }

  private makeCard(o: Order, ctx: OrdersContext): Card {
    const r = ctx.map.restaurants.find((x) => x.id === o.restaurantId)!;
    const cu = ctx.map.customers.find((x) => x.id === o.customerId)!;
    const el = document.createElement('div');
    el.className = 'order panel';
    el.style.borderLeftColor = hex(r.color);
    const size = o.food === 'soup' ? '' : ` ×${o.size}`;
    const req = o.request ? `<div class="order-req ${o.request}">${REQUEST_INFO[o.request].icon} ${esc(t(`req.${o.request}.text`))}</div>` : '';
    el.innerHTML = `
      <div class="order-head">
        <img alt="" src="${foodIconURL(o.food)}" />
        <div class="order-route">
          <div class="order-name">${esc(placeName(r))} → ${esc(placeName(cu))}</div>
          <div class="order-meta"><small>${esc(t(`food.${o.food}`))}${size}${o.request === 'backDoor' ? ' · ' + esc(t('order.backDoor')) : ''}</small><span class="order-badge"></span></div>
        </div>
      </div>${req}
      <div class="order-claim" hidden></div>
      <div class="order-bar"><i></i></div>`;
    el.addEventListener('pointerdown', (e) => {
      if (this.cards.get(o.id)?.order.status !== 'waiting') return;
      e.stopPropagation();
      this.ctx?.onSelect?.(o.id);
    });
    return { el, badge: el.querySelector('.order-badge')!, bar: el.querySelector('.order-bar > i')!, claim: el.querySelector('.order-claim')!, claimShown: false, order: o };
  }

  private paintCard(c: Card, ctx: OrdersContext): void {
    const o = c.order;
    const mine = o.status === 'carrying' && o.carrierId === ctx.myId;
    c.el.classList.toggle('mine', mine);
    c.el.classList.toggle('taken', o.status === 'carrying' && !mine);
    c.el.classList.toggle('ended', o.status === 'expired' || o.status === 'delivered');
    c.badge.className = `order-badge ${o.status === 'waiting' ? 'wait' : mine ? 'mine' : 'other'}`;
    c.el.classList.toggle('pick', o.status === 'waiting');
  }

  /** per-frame (throttled by caller): countdown bars + badge text */
  updateOrderBars(serverNow: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let layoutChanged = false;
    const selected = ctx.selectedId?.() ?? null;
    for (const c of this.cards.values()) {
      const o = c.order;
      c.el.classList.toggle('sel', o.status === 'waiting' && o.id === selected);
      // "🙋 <rider> has this": informational, shown while the claim is alive (the server also clears it on pickup / expiry)
      const claimed = o.status === 'waiting' && !!o.claimedBy && o.claimUntil !== null && serverNow < o.claimUntil;
      if (claimed) {
        const text = `🙋 ${t('ping.claimBy', { who: ctx.nameOf(o.claimedBy!) })}`;
        if (c.claim.textContent !== text) c.claim.textContent = text;
        c.claim.style.setProperty('--pc', ctx.colorOf(o.claimedBy!));
        c.claim.dataset.by = o.claimedBy!;
      }
      if (claimed !== c.claimShown) {
        c.claimShown = claimed;
        c.claim.hidden = !claimed;
        layoutChanged = true;
      }
      let frac = 1;
      let cls = '';
      let badge = '';
      if (o.status === 'waiting') {
        const left = ORDERS.WAIT_EXPIRE - (serverNow - o.createdAt);
        frac = left / ORDERS.WAIT_EXPIRE;
        cls = frac < 0.25 ? 'late' : frac < 0.5 ? 'warn' : '';
        badge = t('order.wait');
      } else if (o.status === 'carrying' && o.pickedAt !== null) {
        const left = o.timeLimit - (serverNow - o.pickedAt);
        frac = left / o.timeLimit;
        cls = left <= 0 ? 'late' : frac < 0.3 ? 'warn' : '';
        const who = o.carrierId === ctx.myId ? t('order.you') : ctx.nameOf(o.carrierId ?? '');
        badge = left > 0 ? t('order.carrying', { who, s: Math.ceil(left) }) : t('order.late', { who });
      } else if (o.status === 'expired') {
        badge = t('order.expired');
        frac = 0;
      } else {
        badge = t('order.delivered');
        frac = 1;
      }
      const w = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      if (c.bar.style.width !== w) c.bar.style.width = w;
      if (c.bar.className !== cls) c.bar.className = cls;
      if (c.badge.textContent !== badge) c.badge.textContent = badge;
    }
    if (layoutChanged) this.fitCards(this.lastOrder);
  }

  // ---------------------------------------------------------------- cargo / speed
  setCargo(c: { kind: 'soup' | 'pizza' | 'ice'; integrity: number; detail: string } | null, hint: string): void {
    if (!c) {
      this.cargoIcon.hidden = true;
      this.setText('clabel', this.cargoLabel, t('hud.empty'));
      this.cargoFill.style.width = '0%';
      this.cargoFill.className = '';
    } else {
      if (this.cargoIcon.hidden || this.last.get('cicon') !== c.kind) {
        this.cargoIcon.src = foodIconURL(c.kind);
        this.last.set('cicon', c.kind);
      }
      this.cargoIcon.hidden = false;
      this.setText('clabel', this.cargoLabel, c.detail);
      this.cargoFill.style.width = `${Math.round(c.integrity * 100)}%`;
      this.cargoFill.className = c.integrity < 0.3 ? 'low' : c.integrity < 0.6 ? 'mid' : '';
    }
    this.setText('chint', this.cargoHint, hint);
  }

  setSpeed(mps: number, resetFrac: number): void {
    const kmh = String(Math.round(mps * 3.6));
    this.setText('kmh', this.kmhEl, kmh);
    this.setText('kmh2', this.kmh2El, kmh);
    const w = `${Math.round((1 - resetFrac) * 100)}%`;
    if (this.resetFill.style.width !== w) this.resetFill.style.width = w;
  }

  // ---------------------------------------------------------------- guidance
  /** angle in radians (0 = up, clockwise) at screen position x,y; null hides the arrow */
  setArrow(a: { x: number; y: number; angle: number; color: string; dist: number } | null): void {
    if (!a) {
      this.arrowEl.hidden = true;
      return;
    }
    this.arrowEl.hidden = false;
    this.arrowEl.style.transform = `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px) rotate(${a.angle.toFixed(3)}rad)`;
    this.arrowEl.style.setProperty('--arrow', a.color);
    const d = this.arrowDist;
    // The label sits on the far side of the arrow (towards the screen centre). When the arrow was nudged along the border
    // away from the target's direction (to dodge a panel / the hint) that side can point off screen: shift the label back in.
    const th = a.angle;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = a.x - 50 * Math.sin(th);
    const cy = a.y + 50 * Math.cos(th);
    const padX = 26;
    const padY = 14;
    const sx = Math.min(0, Math.max(-1e4, W - padX - cx)) + Math.max(0, padX - cx);
    const sy = Math.min(0, Math.max(-1e4, H - padY - cy)) + Math.max(0, padY - cy);
    const lx = sx * Math.cos(th) + sy * Math.sin(th);
    const ly = -sx * Math.sin(th) + sy * Math.cos(th);
    d.style.transform = `translate(calc(-50% + ${lx.toFixed(1)}px), ${ly.toFixed(1)}px) rotate(${(-th).toFixed(3)}rad)`;
    this.setText('adist', d, `${Math.round(a.dist)}m`);
  }

  setZone(z: { x: number; y: number; progress: number; label: string } | null): void {
    if (!z) {
      this.zoneEl.hidden = true;
      return;
    }
    this.zoneEl.hidden = false;
    this.zoneEl.style.transform = `translate(${z.x.toFixed(0)}px, ${z.y.toFixed(0)}px)`;
    this.zoneFg.style.strokeDashoffset = String(263.9 * (1 - Math.min(1, z.progress)));
    this.setText('zlbl', this.zoneLbl, z.label);
  }

  setDebug(text: string): void {
    if (this.dbgEl) this.dbgEl.textContent = text;
  }

  dispose(): void {
    this.root.remove();
  }
}
