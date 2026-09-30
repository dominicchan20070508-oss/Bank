// Single-player transport: runs the very same GameRoom that the server runs, inside the browser.
import { GameRoom } from '../../shared/rules';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import type { MessageHandler, Transport } from './transport';

export class LocalTransport implements Transport {
  readonly kind = 'local' as const;
  readonly myId = 'p1';
  readonly room: GameRoom;
  private readonly handlers = new Set<MessageHandler>();
  private readonly queue: ServerMsg[] = [];
  private flushing = false;
  private connected = false;

  constructor(private readonly clock: () => number = () => performance.now() / 1000) {
    this.room = new GameRoom({
      code: 'SOLO',
      send: (_id, msg) => this.enqueue(msg),
      broadcast: (msg) => this.enqueue(msg),
      allowDebug: true,
      allowStartOverrides: true,
      seedSource: () => Math.floor(Math.random() * 0x7fffffff),
    });
  }

  async connect(name: string): Promise<void> {
    this.enqueue({ type: 'welcome', id: this.myId });
    this.room.addPlayer(this.myId, name);
    this.connected = true;
    this.flush();
  }

  send(msg: ClientMsg): void {
    if (!this.connected) return;
    // createRoom / joinRoom are meaningless locally (we're already in our private room)
    this.room.handle(this.myId, msg, this.clock());
    this.flush();
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  update(): void {
    if (!this.connected) return;
    this.room.tick(this.clock());
    this.flush();
  }

  serverNow(): number {
    return this.clock();
  }

  /** test hook: end the round right now */
  debugEndNow(): void {
    if (this.room.phase === 'playing') {
      this.room.endsAt = this.clock();
      this.update();
    }
  }

  close(): void {
    this.connected = false;
    this.handlers.clear();
    this.queue.length = 0;
  }

  private enqueue(msg: ServerMsg): void {
    this.queue.push(msg);
  }

  /** Deliver queued messages in order; re-entrant sends from handlers are appended and delivered by the outer loop. */
  private flush(): void {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const msg = this.queue.shift()!;
        for (const h of [...this.handlers]) h(msg);
      }
    } finally {
      this.flushing = false;
    }
  }
}
