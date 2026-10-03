// Server wake-up (DESIGN §14.1). The free Render host sleeps when idle and needs up to a minute to boot, so the page
// asks /healthz the moment it loads (that request itself wakes the host) and shows a status dot in the menu.
export type HealthState = 'checking' | 'up';

export interface HealthOptions {
  fetchFn?: (url: string, init?: { cache?: string; signal?: AbortSignal }) => Promise<{ ok: boolean }>;
  now?: () => number; // ms
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  url?: string;
  retryMs?: number;
  timeoutMs?: number;
}

export class HealthMonitor {
  state: HealthState = 'checking';
  private startedAt = 0;
  private upAt = 0;
  private timer: unknown = null;
  private running = false;
  private attempts = 0;
  private readonly listeners = new Set<(s: HealthState) => void>();
  private readonly o: Required<HealthOptions>;

  constructor(opts: HealthOptions = {}) {
    this.o = {
      fetchFn: opts.fetchFn ?? ((url, init) => fetch(url, init as RequestInit)),
      now: opts.now ?? (() => Date.now()),
      setTimer: opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      url: opts.url ?? '/healthz',
      retryMs: opts.retryMs ?? 2000,
      timeoutMs: opts.timeoutMs ?? 6000,
    };
  }

  get up(): boolean {
    return this.state === 'up';
  }
  /** whole seconds since the first request (while waking) */
  waitedSeconds(): number {
    return Math.max(0, Math.floor(((this.up ? this.upAt : this.o.now()) - this.startedAt) / 1000));
  }
  get tries(): number {
    return this.attempts;
  }

  onChange(fn: (s: HealthState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(): void {
    if (this.running || this.up) return;
    this.running = true;
    this.startedAt = this.o.now();
    void this.attempt();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
  }

  private async attempt(): Promise<void> {
    if (!this.running) return;
    this.attempts++;
    let ok = false;
    let abort: AbortController | null = null;
    let to: unknown = null;
    try {
      abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (abort) to = this.o.setTimer(() => abort!.abort(), this.o.timeoutMs);
      const res = await this.o.fetchFn(this.o.url, { cache: 'no-store', signal: abort?.signal });
      ok = !!res && res.ok;
    } catch {
      ok = false;
    } finally {
      if (to !== null) this.o.clearTimer(to);
    }
    if (!this.running) return;
    if (ok) {
      this.upAt = this.o.now();
      this.state = 'up';
      this.running = false;
      this.listeners.forEach((f) => f('up'));
      return;
    }
    this.timer = this.o.setTimer(() => void this.attempt(), this.o.retryMs);
  }
}
