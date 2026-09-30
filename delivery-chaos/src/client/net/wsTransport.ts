// Online transport: JSON over a WebSocket to the same origin at /ws (wss when the page is https), plus a small
// ping/pong clock sync so every client's serverNow() agrees with the server clock to within a few tens of ms.
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { MessageHandler, Transport } from './transport';

export function defaultWsUrl(): string {
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

interface SyncSample {
  rtt: number;
  offset: number;
}

export class WsTransport implements Transport {
  readonly kind = 'ws' as const;
  myId = '';
  private ws: WebSocket | null = null;
  private readonly handlers = new Set<MessageHandler>();
  private readonly closeHandlers = new Set<(reason: string) => void>();
  private offset = 0; // serverNow = clock() + offset
  private samples: SyncSample[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private opened = false;

  constructor(
    private readonly url: string = defaultWsUrl(),
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {}

  connect(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (err) reject(err);
        else resolve();
      };
      const timeout = setTimeout(() => {
        settle(new Error('连接超时'));
        this.ws?.close();
      }, 8000);

      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch {
        settle(new Error('无法连接服务器'));
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        this.opened = true;
        this.send({ type: 'hello', name });
      };
      ws.onmessage = (e) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(typeof e.data === 'string' ? e.data : '') as ServerMsg;
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
        if (msg.type === 'pong') {
          this.onPong(msg.t, msg.s);
          settle(); // first clock sample: we're ready
          return;
        }
        if (msg.type === 'welcome') {
          this.myId = msg.id;
          this.startSync();
          // give the first pong a moment, but don't hold the UI hostage
          setTimeout(() => settle(), 1200);
        }
        for (const h of [...this.handlers]) {
          try {
            h(msg);
          } catch (err) {
            console.error('message handler failed', err);
          }
        }
      };
      ws.onerror = () => {
        if (!this.opened) settle(new Error('无法连接服务器'));
      };
      ws.onclose = () => {
        this.stopSync();
        if (!this.opened) settle(new Error('无法连接服务器'));
        if (this.intentionalClose) return;
        for (const h of [...this.closeHandlers]) h('连接断开');
      };
    });
  }

  send(msg: ClientMsg): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return; // dropped connections are reported once via onClose, not per message
    ws.send(JSON.stringify(msg));
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onClose(handler: (reason: string) => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  update(): void {
    /* event driven */
  }

  serverNow(): number {
    return this.clock() + this.offset;
  }

  close(): void {
    this.intentionalClose = true;
    this.stopSync();
    this.handlers.clear();
    this.closeHandlers.clear();
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }

  // ------------------------------------------------------------------ clock sync
  private startSync(): void {
    this.stopSync();
    const ping = () => this.send({ type: 'ping', t: this.clock() });
    // a quick burst to converge, then a slow heartbeat that also tracks drift
    for (let i = 0; i < 5; i++) setTimeout(ping, i * 80);
    this.pingTimer = setInterval(ping, 2000);
  }

  private stopSync(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private onPong(t0: number, serverTime: number): void {
    const t1 = this.clock();
    const rtt = t1 - t0;
    if (!(rtt >= 0) || rtt > 5 || !Number.isFinite(serverTime)) return;
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - t1 });
    if (this.samples.length > 8) this.samples.shift();
    // the sample with the smallest round trip has the least asymmetric-delay error
    let best = this.samples[0]!;
    for (const s of this.samples) if (s.rtt < best.rtt) best = s;
    if (this.samples.length === 1 || Math.abs(best.offset - this.offset) > 0.25) this.offset = best.offset;
    else this.offset += (best.offset - this.offset) * 0.3; // slew: never make timers jump
  }

  /** for tests / debugging */
  get syncInfo(): { offset: number; rtt: number; samples: number } {
    return { offset: this.offset, rtt: Math.min(...this.samples.map((s) => s.rtt), Infinity), samples: this.samples.length };
  }
}
