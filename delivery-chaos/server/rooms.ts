// Room registry + per-connection session handling. Knows nothing about sockets: a `Conn` is anything that can send a
// ServerMsg and be closed, so this is easy to test and the ws wiring stays in app.ts. All game rules live in GameRoom.
import { GameRoom } from '../src/shared/rules';
import { GAME } from '../src/shared/constants';
import type { ErrorCode, ServerMsg } from '../src/shared/protocol';
import { formatRoundSummary } from '../src/shared/summary';
import { TokenBucket, parseClientMsg } from '../src/shared/validate';

export interface Conn {
  send(msg: ServerMsg): void;
  close(): void;
}

export interface RoomManagerOptions {
  /** DC_DEBUG: honour `debugGive` and the host's seed / duration overrides */
  debug: boolean;
  /** seconds on the server clock */
  now: () => number;
  maxRooms?: number;
  log?: (line: string) => void;
  /** one anonymous JSON line per finished round (DESIGN §14.4); no names, no ids, no IPs */
  roundLog?: (line: string) => void;
}

interface Session {
  id: string;
  name: string;
  conn: Conn;
  room: RoomEntry | null;
  limiter: TokenBucket;
  dropped: number;
  warnedDebug: boolean;
  closed: boolean;
}

interface RoomEntry {
  code: string;
  game: GameRoom;
  sessions: Map<string, Session>;
}

// no I and O: they look like 1 and 0
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Error codes sent to clients; each client shows its own language's text for them. */
export const ERR = {
  notFound: 'notFound',
  playing: 'playing',
  full: 'full',
  inRoom: 'inRoom',
  noRoom: 'noRoom',
  busy: 'busy',
  debugOff: 'debugOff',
} as const satisfies Record<ErrorCode, ErrorCode>;

export class RoomManager {
  private readonly rooms = new Map<string, RoomEntry>();
  private readonly sessions = new Set<Session>();
  private nextId = 1;
  private readonly maxRooms: number;

  constructor(private readonly opts: RoomManagerOptions) {
    this.maxRooms = opts.maxRooms ?? 200;
  }

  get roomCount(): number {
    return this.rooms.size;
  }
  get sessionCount(): number {
    return this.sessions.size;
  }
  hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  private log(line: string): void {
    this.opts.log?.(line);
  }

  // ------------------------------------------------------------------ connections

  /** A new socket connected. Returns the handle the socket layer feeds with raw messages. */
  connect(conn: Conn): { receive(raw: string): void; disconnect(): void } {
    const s: Session = {
      id: `p${this.nextId++}`,
      name: '',
      conn,
      room: null,
      limiter: new TokenBucket(150, 300), // a client normally sends ~25 messages/s
      dropped: 0,
      warnedDebug: false,
      closed: false,
    };
    this.sessions.add(s);
    this.send(s, { type: 'welcome', id: s.id });
    return {
      receive: (raw) => this.receive(s, raw),
      disconnect: () => this.disconnect(s),
    };
  }

  private send(s: Session, msg: ServerMsg): void {
    if (s.closed) return;
    try {
      s.conn.send(msg);
    } catch (err) {
      this.log(`send to ${s.id} failed: ${String(err)}`);
    }
  }

  private error(s: Session, code: ErrorCode): void {
    this.send(s, { type: 'error', code });
  }

  private receive(s: Session, raw: string): void {
    if (s.closed) return;
    try {
      if (!s.limiter.take(this.opts.now())) {
        if (++s.dropped > 2000) {
          this.log(`${s.id} flooding, closing`);
          s.conn.close();
        }
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return; // not JSON: drop
      }
      const msg = parseClientMsg(parsed);
      if (!msg) return; // unknown type / malformed: drop
      const now = this.opts.now();

      switch (msg.type) {
        case 'ping':
          this.send(s, { type: 'pong', t: msg.t, s: now });
          return;
        case 'hello':
          s.name = msg.name;
          if (s.room) s.room.game.handle(s.id, msg, now);
          return;
        case 'createRoom':
          this.createRoom(s);
          return;
        case 'joinRoom':
          this.joinRoom(s, msg.code);
          return;
        default:
          break;
      }
      const room = s.room;
      if (!room) {
        // state messages racing with a leave are harmless; anything else deserves an answer
        if (msg.type !== 'state' && msg.type !== 'stat' && msg.type !== 'debris' && msg.type !== 'caps' && msg.type !== 'salvage') this.error(s, ERR.noRoom);
        return;
      }
      if (msg.type === 'debugGive' && !this.opts.debug) {
        if (!s.warnedDebug) {
          s.warnedDebug = true;
          this.error(s, ERR.debugOff);
        }
        return;
      }
      room.game.handle(s.id, msg, now);
    } catch (err) {
      // nothing a client sends may take the server down
      this.log(`error handling message from ${s.id}: ${err instanceof Error ? err.stack : String(err)}`);
    }
  }

  private disconnect(s: Session): void {
    if (s.closed) return;
    s.closed = true;
    this.sessions.delete(s);
    const room = s.room;
    if (!room) return;
    s.room = null;
    room.sessions.delete(s.id);
    try {
      room.game.removePlayer(s.id, this.opts.now());
    } catch (err) {
      this.log(`removePlayer failed: ${String(err)}`);
    }
    if (room.sessions.size === 0) {
      this.rooms.delete(room.code);
      this.log(`room ${room.code} closed (empty)`);
    }
  }

  // ------------------------------------------------------------------ rooms

  private newCode(): string {
    for (let tries = 0; tries < 200; tries++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('no free room code');
  }

  private createRoom(s: Session): void {
    if (s.room) return this.error(s, ERR.inRoom);
    if (this.rooms.size >= this.maxRooms) return this.error(s, ERR.busy);
    const code = this.newCode();
    const entry: RoomEntry = {
      code,
      sessions: new Map(),
      game: new GameRoom({
        code,
        allowDebug: this.opts.debug,
        allowStartOverrides: this.opts.debug,
        send: (id, msg) => {
          const t = entry.sessions.get(id);
          if (t) this.send(t, msg);
        },
        broadcast: (msg, except) => {
          for (const t of entry.sessions.values()) if (t.id !== except) this.send(t, msg);
        },
        seedSource: () => Math.floor(Math.random() * 0x7fffffff),
        onRoundEnd: (summary) => this.opts.roundLog?.(formatRoundSummary(summary)),
      }),
    };
    this.rooms.set(code, entry);
    this.enter(s, entry);
    this.log(`room ${code} created by ${s.id}`);
  }

  private joinRoom(s: Session, code: string): void {
    if (s.room) return this.error(s, ERR.inRoom);
    const entry = this.rooms.get(code);
    if (!entry) return this.error(s, ERR.notFound);
    if (entry.game.phase === 'playing') return this.error(s, ERR.playing);
    if (entry.sessions.size >= GAME.MAX_PLAYERS) return this.error(s, ERR.full);
    this.enter(s, entry);
  }

  /** put the session into the room (it must be registered before addPlayer so it receives the room broadcast) */
  private enter(s: Session, entry: RoomEntry): void {
    entry.sessions.set(s.id, s);
    s.room = entry;
    if (!entry.game.addPlayer(s.id, s.name)) {
      entry.sessions.delete(s.id);
      s.room = null;
      if (entry.sessions.size === 0) this.rooms.delete(entry.code);
      this.error(s, entry.game.phase === 'playing' ? ERR.playing : ERR.full);
    }
  }

  // ------------------------------------------------------------------ clock

  /** advance every room; a failing room never stops the others */
  tick(): void {
    const now = this.opts.now();
    for (const entry of this.rooms.values()) {
      try {
        entry.game.tick(now);
      } catch (err) {
        this.log(`tick of room ${entry.code} failed: ${err instanceof Error ? err.stack : String(err)}`);
      }
    }
  }
}
