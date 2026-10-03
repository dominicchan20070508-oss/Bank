// Off-screen direction cues (DESIGN §14.2): when a teammate honks or calls out from outside the screen (or a salvage zone is
// out of view) a small chip with the icon appears on the screen edge pointing their way. Pure DOM; the game feeds positions.
import { el } from './dom';

export interface EdgeResult {
  onScreen: boolean;
  x: number;
  y: number;
  angle: number; // radians, 0 = up, clockwise
}

interface Cue {
  key: string;
  node: HTMLElement;
  tri: HTMLElement;
  world: () => [number, number, number] | null;
  until: number; // performance.now() ms, Infinity = until removed
}

export class EdgeCues {
  readonly root = el('div', 'cues');
  private cues = new Map<string, Cue>();

  constructor(parent: HTMLElement) {
    parent.append(this.root);
  }

  get count(): number {
    return this.cues.size;
  }

  /** add or refresh a cue. ms = lifetime (Infinity = persistent until remove()) */
  add(key: string, icon: string, color: string, world: () => [number, number, number] | null, ms: number, label?: string): void {
    let c = this.cues.get(key);
    if (!c) {
      const node = el('div', 'cue');
      node.innerHTML = `<span class="cue-ic"></span><i class="cue-tri"></i>`;
      this.root.append(node);
      c = { key, node, tri: node.querySelector('.cue-tri')!, world, until: 0 };
      this.cues.set(key, c);
    }
    c.world = world;
    c.until = ms === Infinity ? Infinity : performance.now() + ms;
    c.node.style.setProperty('--c', color);
    c.node.dataset.label = label ?? '';
    (c.node.querySelector('.cue-ic') as HTMLElement).textContent = icon;
    c.node.hidden = true;
  }

  remove(key: string): void {
    this.cues.get(key)?.node.remove();
    this.cues.delete(key);
  }

  clear(): void {
    this.root.replaceChildren();
    this.cues.clear();
  }

  /** edge(world) tells where the point is on screen; avoid() nudges the chip off HUD panels / touch buttons */
  update(edge: (w: [number, number, number]) => EdgeResult, avoid: (x: number, y: number) => [number, number]): void {
    const now = performance.now();
    for (const c of [...this.cues.values()]) {
      if (now > c.until) {
        this.remove(c.key);
        continue;
      }
      const w = c.world();
      if (!w) {
        c.node.hidden = true;
        continue;
      }
      const e = edge(w);
      if (e.onScreen) {
        c.node.hidden = true;
        continue;
      }
      const [x, y] = avoid(e.x, e.y);
      c.node.hidden = false;
      c.node.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      c.tri.style.transform = `rotate(${e.angle.toFixed(3)}rad) translateY(-27px)`;
    }
  }
}
