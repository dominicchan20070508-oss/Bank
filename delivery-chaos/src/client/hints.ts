// First-session contextual hints (DESIGN §14.1): each hint is shown once per device, in the order things happen.
// Logic only (storage + queue); the DOM bubble is drawn by the Hud. The clock is injected so it is unit-tested.
import { safeStorage, type KeyValueStore } from './storage';

export type HintId = 'start' | 'approach' | 'cargo' | 'crash' | 'salvage';
export const HINT_IDS: readonly HintId[] = ['start', 'approach', 'cargo', 'crash', 'salvage'];
export const HINTS_KEY = 'dc.hints';
export const HINT_MS = 5200;
const GAP_MS = 350;

export class HintStore {
  private seen: Set<string>;
  constructor(private readonly store: KeyValueStore = safeStorage) {
    this.seen = new Set(this.load());
  }
  private load(): string[] {
    try {
      const v: unknown = JSON.parse(this.store.getItem(HINTS_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  has(id: HintId): boolean {
    return this.seen.has(id);
  }
  add(id: HintId): void {
    this.seen.add(id);
    this.store.setItem(HINTS_KEY, JSON.stringify([...this.seen]));
  }
  list(): string[] {
    return [...this.seen];
  }
}

export interface ActiveHint {
  id: HintId;
  until: number;
}

/**
 * Shows at most one hint at a time. `request(id)` queues a hint that has never been shown on this device;
 * `update(now)` (called every frame) starts the next one when the current one is over. A hint is recorded as seen when it
 * is actually displayed, so a reload never repeats it.
 */
export class HintManager {
  private queue: HintId[] = [];
  private active: ActiveHint | null = null;
  private freeAt = 0;

  constructor(
    private readonly seen: HintStore,
    private readonly show: (id: HintId) => void,
    private readonly hide: (id: HintId) => void,
  ) {}

  get current(): HintId | null {
    return this.active?.id ?? null;
  }

  request(id: HintId): void {
    if (this.seen.has(id) || this.queue.includes(id) || this.active?.id === id) return;
    this.queue.push(id);
  }

  /** drop everything that is waiting or on screen (the round ended) */
  clear(): void {
    this.queue = [];
    if (this.active) this.hide(this.active.id);
    this.active = null;
  }

  update(now: number): void {
    if (this.active && now >= this.active.until) {
      this.hide(this.active.id);
      this.active = null;
      this.freeAt = now + GAP_MS;
    }
    if (!this.active && now >= this.freeAt) {
      const id = this.queue.shift();
      if (id) {
        this.seen.add(id);
        this.active = { id, until: now + HINT_MS };
        this.show(id);
      }
    }
  }
}
