// In-game HUD (Simplified Chinese). Plain DOM; updated cheaply (text/width only when changed).
import { ORDERS } from '../../shared/constants';
import type { CityMap } from '../../shared/map';
import { FOOD_INFO, REQUEST_INFO, type Order } from '../../shared/orders';
import { starThresholds } from '../../shared/scoring';
import { foodIconURL } from '../icons';
import { Popups } from './popups';

export interface OrdersContext {
  map: CityMap;
  myId: string;
  nameOf: (playerId: string) => string;
}

interface Card {
  el: HTMLElement;
  badge: HTMLElement;
  bar: HTMLElement;
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

  constructor(parent: HTMLElement, debug: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="hud-tl panel">
        <div class="hud-time" data-k="time">4:00</div>
        <div class="hud-tips">团队小费 <b data-k="tips">¥0</b></div>
        <div class="stars"><div class="fill" data-k="starfill"></div></div>
      </div>
      <div class="hud-orders" data-k="orders"></div>
      <div class="hud-cargo panel">
        <div class="cargo-label"><img data-k="cicon" alt="" hidden /><span data-k="clabel">空手</span></div>
        <div class="cargo-bar"><i data-k="cfill"></i></div>
        <div class="cargo-hint" data-k="chint"></div>
      </div>
      <div class="hud-bl panel">
        <div><span class="kmh" data-k="kmh">0</span> km/h</div>
        <div class="keys" data-k="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 骑行 · <kbd>空格</kbd> 手刹 · <kbd>H</kbd> 喇叭 · <kbd>R</kbd> 扶正</div>
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
    // fade the key hints after a while
    setTimeout(() => (this.keysEl.style.opacity = '0.35'), 25000);
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
      if (o.status === 'carrying') return 1;
      if (o.status === 'waiting') return 2;
      return 3;
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
    const room = Math.max(1, Math.floor((window.innerHeight - 250) / 78));
    const visible = orderedIds.length <= room ? orderedIds.length : room - 1;
    orderedIds.forEach((id, i) => {
      const c = this.cards.get(id);
      if (c) c.el.hidden = i >= visible;
    });
    const hidden = orderedIds.length - visible;
    this.moreEl.hidden = hidden <= 0;
    this.moreEl.textContent = `还有 ${hidden} 单…`;
    this.ordersEl.append(this.moreEl);
  }

  private makeCard(o: Order, ctx: OrdersContext): Card {
    const r = ctx.map.restaurants.find((x) => x.id === o.restaurantId)!;
    const cu = ctx.map.customers.find((x) => x.id === o.customerId)!;
    const el = document.createElement('div');
    el.className = 'order panel';
    el.style.borderLeftColor = hex(r.color);
    const size = o.food === 'soup' ? '' : ` ×${o.size}`;
    const req = o.request ? `<div class="order-req ${o.request}">${REQUEST_INFO[o.request].icon} ${REQUEST_INFO[o.request].text}</div>` : '';
    el.innerHTML = `
      <div class="order-head">
        <img alt="" src="${foodIconURL(o.food)}" />
        <div class="order-route">${r.name} → ${cu.name}<small>${FOOD_INFO[o.food].name}${size}${o.request === 'backDoor' ? ' · 送后门' : ''}</small></div>
        <span class="order-badge"></span>
      </div>${req}
      <div class="order-bar"><i></i></div>`;
    return { el, badge: el.querySelector('.order-badge')!, bar: el.querySelector('.order-bar > i')!, order: o };
  }

  private paintCard(c: Card, ctx: OrdersContext): void {
    const o = c.order;
    const mine = o.status === 'carrying' && o.carrierId === ctx.myId;
    c.el.classList.toggle('mine', mine);
    c.el.classList.toggle('taken', o.status === 'carrying' && !mine);
    c.el.classList.toggle('ended', o.status === 'expired' || o.status === 'delivered');
    c.badge.className = `order-badge ${o.status === 'waiting' ? 'wait' : mine ? 'mine' : 'other'}`;
  }

  /** per-frame (throttled by caller): countdown bars + badge text */
  updateOrderBars(serverNow: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const c of this.cards.values()) {
      const o = c.order;
      let frac = 1;
      let cls = '';
      let badge = '';
      if (o.status === 'waiting') {
        const left = ORDERS.WAIT_EXPIRE - (serverNow - o.createdAt);
        frac = left / ORDERS.WAIT_EXPIRE;
        cls = frac < 0.25 ? 'late' : frac < 0.5 ? 'warn' : '';
        badge = '待取';
      } else if (o.status === 'carrying' && o.pickedAt !== null) {
        const left = o.timeLimit - (serverNow - o.pickedAt);
        frac = left / o.timeLimit;
        cls = left <= 0 ? 'late' : frac < 0.3 ? 'warn' : '';
        const who = o.carrierId === ctx.myId ? '你' : ctx.nameOf(o.carrierId ?? '');
        badge = left > 0 ? `配送中·${who} ${Math.ceil(left)}s` : `超时·${who}`;
      } else if (o.status === 'expired') {
        badge = '已过期';
        frac = 0;
      } else {
        badge = '已送达';
        frac = 1;
      }
      const w = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      if (c.bar.style.width !== w) c.bar.style.width = w;
      if (c.bar.className !== cls) c.bar.className = cls;
      if (c.badge.textContent !== badge) c.badge.textContent = badge;
    }
  }

  // ---------------------------------------------------------------- cargo / speed
  setCargo(c: { kind: 'soup' | 'pizza' | 'ice'; integrity: number; detail: string } | null, hint: string): void {
    if (!c) {
      this.cargoIcon.hidden = true;
      this.setText('clabel', this.cargoLabel, '空手');
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
    this.setText('kmh', this.kmhEl, String(Math.round(mps * 3.6)));
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
    d.style.transform = `translateX(-50%) rotate(${(-a.angle).toFixed(3)}rad)`;
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
