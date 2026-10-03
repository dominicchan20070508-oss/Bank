// Floating text, customer speech bubbles, the tip card, toasts and the crash flash (all DOM, pointer-events: none).
export type Projector = (x: number, y: number, z: number) => { x: number; y: number; visible: boolean };

interface Bubble {
  el: HTMLElement;
  world: [number, number, number];
  /** keeps the bubble glued to a moving rider */
  follow?: () => [number, number, number] | null;
  expires: number;
  fading: boolean;
}

export class Popups {
  readonly root: HTMLElement;
  project: Projector | null = null;
  private bubbles: Bubble[] = [];
  private readonly flashEl: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'floaters';
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'flash';
    parent.append(this.flashEl, this.root);
  }

  private place(el: HTMLElement, world?: [number, number, number]): void {
    let x = window.innerWidth / 2;
    let y = window.innerHeight * 0.55;
    if (world && this.project) {
      const p = this.project(world[0], world[1], world[2]);
      if (p.visible) {
        x = p.x;
        y = p.y;
      }
    }
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  /** big cartoon text that pops and floats up. world = anchor in the 3D scene (defaults to screen centre). */
  floatText(text: string, opts: { world?: [number, number, number]; color?: string; size?: 'small' | 'big' | 'normal'; jitter?: number } = {}): void {
    const el = document.createElement('div');
    el.className = `float ${opts.size ?? 'normal'}`;
    el.textContent = text;
    if (opts.color) el.style.setProperty('--c', opts.color);
    this.place(el, opts.world);
    const j = opts.jitter ?? 40;
    el.style.left = `${parseFloat(el.style.left) + (Math.random() - 0.5) * j * 2}px`;
    this.root.append(el);
    setTimeout(() => el.remove(), 2300);
    while (this.root.querySelectorAll('.float').length > 14) this.root.querySelector('.float')?.remove();
  }

  /** customer speech bubble anchored to a world position for `ms` */
  bubble(text: string, world: [number, number, number], who: string, ms = 3000): void {
    const el = document.createElement('div');
    el.className = 'bubble';
    const w = document.createElement('span');
    w.className = 'who';
    w.textContent = who;
    el.append(w, document.createTextNode(text));
    this.root.append(el);
    const b: Bubble = { el, world, expires: performance.now() + ms, fading: false };
    this.bubbles.push(b);
    this.place(el, world);
  }

  /**
   * A rider's speech bubble that follows them (quick chat, teammate honks). `cls` styles it (e.g. 'ping', 'honk');
   * `color` outlines it in the rider's colour. At most one bubble per `key` (a new one replaces the old).
   */
  followBubble(key: string, text: string, who: string, follow: () => [number, number, number] | null, ms: number, opts: { cls?: string; color?: string } = {}): void {
    this.bubbles = this.bubbles.filter((b) => {
      if (b.el.dataset.key !== key) return true;
      b.el.remove();
      return false;
    });
    const el = document.createElement('div');
    el.className = `bubble follow ${opts.cls ?? ''}`.trim();
    el.dataset.key = key;
    if (opts.color) el.style.setProperty('--pc', opts.color);
    const w = document.createElement('span');
    w.className = 'who';
    w.textContent = who;
    el.append(w, document.createTextNode(text));
    this.root.append(el);
    const start = follow() ?? [0, 0, 0];
    const b: Bubble = { el, world: start, follow, expires: performance.now() + ms, fading: false };
    this.bubbles.push(b);
    this.place(el, start);
  }

  tip(amount: number, parts: string, who: string): void {
    this.root.querySelector('.tipcard')?.remove();
    const el = document.createElement('div');
    el.className = 'tipcard panel';
    el.innerHTML = `<div class="who"></div><div class="amount"></div><div class="parts"></div>`;
    (el.querySelector('.who') as HTMLElement).textContent = who;
    (el.querySelector('.amount') as HTMLElement).textContent = `+¥${amount}`;
    (el.querySelector('.parts') as HTMLElement).textContent = parts;
    this.root.append(el);
    setTimeout(() => el.remove(), 3500);
  }

  toast(text: string): void {
    this.root.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    this.root.append(el);
    setTimeout(() => el.remove(), 2700);
  }

  flash(): void {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  /** call once per frame: keeps bubbles glued to their world position and expires them */
  update(): void {
    const now = performance.now();
    for (const b of this.bubbles) {
      if (!b.fading && now > b.expires - 400) {
        b.fading = true;
        b.el.classList.add('fade');
      }
      if (b.follow) {
        const w = b.follow();
        if (w) b.world = w;
      }
      if (this.project) {
        const p = this.project(b.world[0], b.world[1], b.world[2]);
        b.el.style.display = p.visible ? '' : 'none';
        if (p.visible) {
          b.el.style.left = `${Math.round(p.x)}px`;
          b.el.style.top = `${Math.round(p.y)}px`;
        }
      }
    }
    if (this.bubbles.some((b) => now > b.expires)) {
      for (const b of this.bubbles) if (now > b.expires) b.el.remove();
      this.bubbles = this.bubbles.filter((b) => now <= b.expires);
    }
  }

  clear(): void {
    this.root.replaceChildren();
    this.bubbles = [];
  }
}
