// The only thing the game knows about "the network". LocalTransport (single player) runs the shared GameRoom in
// the browser; the Phase B wsTransport speaks JSON to server/index.ts. Both deliver identical ServerMsg streams.
import type { ClientMsg, ServerMsg } from '../../shared/protocol';

export type MessageHandler = (msg: ServerMsg) => void;

export interface Transport {
  readonly kind: 'local' | 'ws';
  /** player id, valid after connect() resolved (assigned by the `welcome` message) */
  readonly myId: string;
  /** Open the connection / create the room and introduce ourselves. Resolves once we are welcomed. */
  connect(name: string): Promise<void>;
  send(msg: ClientMsg): void;
  /** Register a handler; returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void;
  /** The connection dropped without us asking (sockets only; the local transport never fires this). Returns an unsubscribe. */
  onClose(handler: (reason: string) => void): () => void;
  /** Called every frame: lets time-driven transports (local room) tick. No-op for sockets. */
  update(): void;
  /** Current time (seconds) on the clock the room uses for order timers etc. */
  serverNow(): number;
  close(): void;
}
