// GameRoom: the authoritative game rules (players, order pool, timer, pickup / delivery adjudication,
// stats, results). Transport-agnostic: it never touches sockets, timers, DOM or three.
//
//   incoming:  room.handle(playerId, clientMsg, now)     (now = seconds on any monotonic clock)
//   driven by: room.tick(now)                            (call ~20-60x per second)
//   outgoing:  opts.send(playerId, msg) / opts.broadcast(msg, exceptId?)
//
// Single-player runs this in the browser behind LocalTransport; the Phase B server runs one per room.
import { GAME, ORDERS, ZONE } from './constants';
import { generateCity, type CityMap } from './map';
import { createOrder, isActive, restaurantOf, targetDoor, type Order } from './orders';
import type { ClientMsg, GameEvent, PlayerResult, PlayerStateMsg, ResultsMsg, RoomPhase, ServerMsg } from './protocol';
import { Rng, deriveSeed } from './rng';
import { computeTip, emptyStats, integrityQuote, pickAwards, starsFor, type PlayerStats } from './scoring';
import { DEBRIS_KINDS, LIMITS, TokenBucket, clampLength, isFiniteNum, sanitizeCargo, sanitizeName, sanitizeVec3 } from './validate';

export interface GameRoomOptions {
  code: string;
  send: (playerId: string, msg: ServerMsg) => void;
  broadcast: (msg: ServerMsg, exceptId?: string) => void;
  /** honour `debugGive` (test hook). Off by default; LocalTransport turns it on. */
  allowDebug?: boolean;
  /** honour seed / duration inside `startGame`. Off by default; LocalTransport (and dev servers) turn it on. */
  allowStartOverrides?: boolean;
  defaultDuration?: number;
  /** seed for games started without one; default derives from the start time */
  seedSource?: () => number;
}

export interface RoomPlayer {
  id: string;
  name: string;
  color: number; // index into PLAYER_COLORS
  carrying: string | null;
  state: PlayerStateMsg | null;
  stateDirty: boolean; // changed since the last snapshot
  stats: PlayerStats;
  debrisLimit: TokenBucket;
  honkLimit: TokenBucket;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = isFiniteNum;

export class GameRoom {
  readonly code: string;
  phase: RoomPhase = 'lobby';
  hostId: string | null = null;
  readonly players = new Map<string, RoomPlayer>(); // insertion order = join order

  map: CityMap | null = null;
  orders: Order[] = [];
  teamTips = 0;
  seed = 0;
  duration: number;
  startedAt = 0;
  endsAt = 0;
  lastResults: ResultsMsg | null = null;

  private readonly opts: GameRoomOptions;
  private rng = new Rng(1);
  private nextOrderId = 1;
  private respawnAt: number[] = [];
  private lastSnapAt = -Infinity;
  private ordersDirty = false;

  constructor(opts: GameRoomOptions) {
    this.opts = opts;
    this.code = opts.code;
    this.duration = opts.defaultDuration ?? GAME.DURATION;
  }

  // ------------------------------------------------------------------ membership

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  /** Returns false if the room is full or a game is in progress. */
  addPlayer(id: string, name: string): boolean {
    if (this.players.has(id)) return true;
    if (this.players.size >= GAME.MAX_PLAYERS || this.phase === 'playing') return false;
    const used = new Set([...this.players.values()].map((p) => p.color));
    let color = 0;
    while (used.has(color)) color++;
    this.players.set(id, {
      id,
      name: this.cleanName(name, color),
      color,
      carrying: null,
      state: null,
      stateDirty: false,
      stats: emptyStats(),
      debrisLimit: new TokenBucket(LIMITS.DEBRIS_PER_SEC),
      honkLimit: new TokenBucket(LIMITS.HONK_BROADCASTS_PER_SEC),
    });
    if (!this.hostId) this.hostId = id;
    this.broadcastRoom();
    return true;
  }

  removePlayer(id: string, now: number): void {
    const p = this.players.get(id);
    if (!p) return;
    if (p.carrying) {
      const o = this.orders.find((x) => x.id === p.carrying);
      if (o && o.status === 'carrying') this.endOrder(o, 'expired', now);
    }
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null; // next in join order
    this.broadcastRoom();
    this.flushOrders(now);
  }

  /** An empty name stays empty: every client shows its own language's default ("Rider 2" / "骑手2") from the colour index. */
  private cleanName(name: unknown, _color: number): string {
    return sanitizeName(name);
  }

  private roomInfo(): ServerMsg {
    return {
      type: 'room',
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color })),
    };
  }

  private broadcastRoom(): void {
    this.opts.broadcast(this.roomInfo());
  }

  /** Send the current room state (and, if playing, the running game) to one player, e.g. right after they join. */
  sendRoomTo(id: string): void {
    this.opts.send(id, this.roomInfo());
  }

  // ------------------------------------------------------------------ lifecycle

  /** Begin a new round. Any phase except `playing`. */
  start(now: number, seed?: number, duration?: number): boolean {
    if (this.phase === 'playing' || this.players.size === 0) return false;
    this.seed = (seed ?? this.opts.seedSource?.() ?? Math.floor(now * 1000)) >>> 0;
    this.duration = duration ?? this.opts.defaultDuration ?? GAME.DURATION;
    this.map = generateCity(this.seed);
    this.rng = new Rng(deriveSeed(this.seed, 0x0d3a));
    this.orders = [];
    this.respawnAt = [];
    this.teamTips = 0;
    this.nextOrderId = 1;
    this.lastResults = null;
    for (const p of this.players.values()) {
      p.carrying = null;
      p.state = null;
      p.stateDirty = false;
      p.stats = emptyStats();
    }
    this.phase = 'playing';
    this.startedAt = now;
    this.endsAt = now + this.duration;
    this.lastSnapAt = -Infinity;
    this.opts.broadcast({ type: 'start', seed: this.seed, duration: this.duration, serverTime: now });
    this.broadcastRoom();
    const target = this.poolTarget();
    for (let i = 0; i < target; i++) this.spawnOrder(now);
    this.flushOrders(now);
    return true;
  }

  private backToLobby(): void {
    if (this.phase === 'playing') return;
    this.phase = 'lobby';
    this.orders = [];
    this.respawnAt = [];
    this.teamTips = 0;
    this.map = null;
    this.lastResults = null;
    for (const p of this.players.values()) {
      p.carrying = null;
      p.state = null;
      p.stateDirty = false;
      p.stats = emptyStats();
    }
    this.broadcastRoom();
  }

  private finish(now: number): void {
    for (const o of this.orders) if (o.status === 'carrying') this.endOrder(o, 'expired', now, false);
    for (const p of this.players.values()) p.carrying = null;
    this.phase = 'results';
    const list = [...this.players.values()];
    const players: PlayerResult[] = list.map((p) => ({ id: p.id, name: p.name, color: p.color, stats: { ...p.stats } }));
    const results: ResultsMsg = {
      type: 'results',
      teamTips: this.teamTips,
      stars: starsFor(this.teamTips, list.length),
      players,
      awards: pickAwards(list.map((p) => ({ id: p.id, name: p.name, stats: p.stats }))),
    };
    this.lastResults = results;
    this.flushOrders(now);
    this.opts.broadcast(results);
    this.broadcastRoom();
  }

  // ------------------------------------------------------------------ tick

  tick(now: number): void {
    if (this.phase !== 'playing') return;
    if (now >= this.endsAt) {
      this.finish(now);
      return;
    }
    // waiting orders expire
    for (const o of this.orders) {
      if (o.status === 'waiting' && now - o.createdAt >= ORDERS.WAIT_EXPIRE) this.endOrder(o, 'expired', now);
    }
    // drop long-ended orders from the list
    const before = this.orders.length;
    this.orders = this.orders.filter((o) => isActive(o) || (o.endedAt !== null && now - o.endedAt < ORDERS.ENDED_LINGER));
    if (this.orders.length !== before) this.ordersDirty = true;
    // refill the pool
    if (this.respawnAt.length) {
      const due = this.respawnAt.filter((t) => t <= now);
      if (due.length) {
        this.respawnAt = this.respawnAt.filter((t) => t > now);
        for (let i = 0; i < due.length; i++) if (this.waitingCount() < this.poolTarget()) this.spawnOrder(now);
      }
    }
    // snapshots: only riders whose state changed since the last one (so a resent state never looks like "standing still"),
    // at ~20 Hz. The 0.8 factor keeps a 20 Hz tick loop with a little timer jitter from skipping every other snapshot.
    if (now - this.lastSnapAt >= 0.8 / GAME.SNAP_HZ) {
      this.lastSnapAt = now;
      const players: Record<string, PlayerStateMsg> = {};
      let any = false;
      for (const p of this.players.values()) {
        if (p.state && p.stateDirty) {
          players[p.id] = p.state;
          p.stateDirty = false;
          any = true;
        }
      }
      if (any && this.players.size > 1) this.opts.broadcast({ type: 'snap', t: now, players });
    }
    this.flushOrders(now);
  }

  timeLeft(now: number): number {
    return this.phase === 'playing' ? Math.max(0, this.endsAt - now) : 0;
  }

  // ------------------------------------------------------------------ orders

  poolTarget(): number {
    return Math.min(this.players.size + ORDERS.POOL_BASE, ORDERS.POOL_MAX);
  }

  private waitingCount(): number {
    return this.orders.filter((o) => o.status === 'waiting').length;
  }

  private spawnOrder(now: number): void {
    if (!this.map) return;
    const o = createOrder(this.rng, this.map, `o${this.nextOrderId++}`, now, this.orders);
    this.orders.push(o);
    this.ordersDirty = true;
  }

  private endOrder(o: Order, status: 'delivered' | 'expired', now: number, refill = true): void {
    const wasWaiting = o.status === 'waiting';
    o.status = status;
    o.endedAt = now;
    this.ordersDirty = true;
    if (o.carrierId) {
      const c = this.players.get(o.carrierId);
      if (c && c.carrying === o.id) c.carrying = null;
    }
    if (status === 'expired') {
      this.emit({ ev: 'expire', orderId: o.id });
      // a waiting order's slot is refilled; a carried order's slot was already refilled when it was picked up
      if (refill && wasWaiting) this.respawnAt.push(now + ORDERS.REFILL_DELAY);
    }
  }

  private flushOrders(now: number): void {
    if (!this.ordersDirty) return;
    this.ordersDirty = false;
    this.opts.broadcast({ type: 'orders', t: now, teamTips: this.teamTips, list: this.orders.map((o) => ({ ...o })) });
  }

  private emit(ev: GameEvent, exceptId?: string): void {
    this.opts.broadcast({ type: 'event', ...ev }, exceptId);
  }

  private reject(p: RoomPlayer, kind: 'pickup' | 'deliver', orderId: string, reason: Extract<GameEvent, { ev: 'reject' }>['reason']): void {
    this.opts.send(p.id, { type: 'event', ev: 'reject', kind, orderId, reason });
  }

  // ------------------------------------------------------------------ incoming messages

  handle(playerId: string, msg: ClientMsg, now: number): void {
    const p = this.players.get(playerId);
    if (!p) return;
    switch (msg.type) {
      case 'hello':
        p.name = this.cleanName(msg.name, p.color);
        this.broadcastRoom();
        break;
      case 'startGame':
        if (playerId !== this.hostId) return;
        if (this.opts.allowStartOverrides) {
          this.start(now, finite(msg.seed) ? msg.seed : undefined, finite(msg.duration) && msg.duration > 0 ? msg.duration : undefined);
        } else {
          this.start(now);
        }
        break;
      case 'backToLobby':
        if (playerId === this.hostId) this.backToLobby();
        break;
      case 'state':
        this.onState(p, msg, now);
        break;
      case 'pickup':
        this.onPickup(p, msg.orderId, now);
        break;
      case 'deliver':
        this.onDeliver(p, msg, now);
        break;
      case 'honk':
        this.onHonk(p, now);
        break;
      case 'debris':
        this.onDebris(p, msg, now);
        break;
      case 'stat':
        this.onStat(p, msg.key, msg.delta);
        break;
      case 'debugGive':
        this.onDebugGive(p, msg.orderId, now);
        break;
      default:
        break; // createRoom / joinRoom are handled by whoever owns the room registry
    }
    this.flushOrders(now);
  }

  /** Everything stored here is relayed to teammates in snapshots, so it is rebuilt field by field from checked values. */
  private onState(p: RoomPlayer, m: PlayerStateMsg, now: number): void {
    if (this.phase !== 'playing') return;
    const pos = sanitizeVec3(m.p);
    if (!pos || !finite(m.t) || !finite(m.h) || !finite(m.l) || !finite(m.v)) return;
    // t is the sender's (clock-synced) timestamp; don't let a wrong one poison teammates' interpolation buffers
    const t = Math.abs(m.t - now) <= 1.5 ? m.t : now;
    p.state = { t, p: pos, h: m.h, l: m.l, v: Math.min(Math.abs(m.v), 100), crashed: m.crashed === true, cargo: sanitizeCargo(m.cargo) };
    p.stateDirty = true;
  }

  /** A teammate's pizza box / scoop flew off: relay it, but only well-formed, bounded and rate-limited. */
  private onDebris(p: RoomPlayer, m: Extract<ClientMsg, { type: 'debris' }>, now: number): void {
    if (this.phase !== 'playing') return;
    if (typeof m.kind !== 'string' || !(DEBRIS_KINDS as readonly string[]).includes(m.kind)) return;
    const pos = sanitizeVec3(m.p);
    const vel = sanitizeVec3(m.v, 1e4);
    if (!pos || !vel) return;
    if (!p.debrisLimit.take(now)) return;
    this.emit({ ev: 'debris', playerId: p.id, kind: m.kind, p: pos, v: clampLength(vel, LIMITS.MAX_DEBRIS_SPEED) }, p.id);
  }

  private nearDoor(p: RoomPlayer, door: { x: number; z: number }): 'ok' | 'far' | 'fast' | 'state' {
    const s = p.state;
    if (!s) return 'state';
    const dx = s.p[0] - door.x;
    const dz = s.p[2] - door.z;
    const r = ZONE.RADIUS + ZONE.SERVER_POS_TOLERANCE;
    if (dx * dx + dz * dz > r * r) return 'far';
    if (s.v > ZONE.MAX_SPEED + ZONE.SERVER_SPEED_TOLERANCE) return 'fast';
    return 'ok';
  }

  private take(o: Order, p: RoomPlayer, now: number): void {
    o.status = 'carrying';
    o.carrierId = p.id;
    o.pickedAt = now;
    p.carrying = o.id;
    this.respawnAt.push(now + ORDERS.REFILL_DELAY);
    this.ordersDirty = true;
    this.emit({ ev: 'pickup', orderId: o.id, playerId: p.id });
  }

  private onPickup(p: RoomPlayer, orderId: string, now: number): void {
    if (this.phase !== 'playing' || !this.map) return this.reject(p, 'pickup', orderId, 'phase');
    const o = this.orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'waiting') return this.reject(p, 'pickup', orderId, 'taken');
    if (p.carrying) return this.reject(p, 'pickup', orderId, 'busy');
    const near = this.nearDoor(p, restaurantOf(this.map, o).door);
    if (near !== 'ok') return this.reject(p, 'pickup', orderId, near);
    this.take(o, p, now);
  }

  private onDebugGive(p: RoomPlayer, orderId: string | undefined, now: number): void {
    if (!this.opts.allowDebug || this.phase !== 'playing' || p.carrying) return;
    const o = orderId ? this.orders.find((x) => x.id === orderId) : this.orders.find((x) => x.status === 'waiting');
    if (!o || o.status !== 'waiting') return;
    this.take(o, p, now);
  }

  private onDeliver(p: RoomPlayer, m: Extract<ClientMsg, { type: 'deliver' }>, now: number): void {
    if (this.phase !== 'playing' || !this.map) return this.reject(p, 'deliver', m.orderId, 'phase');
    const o = this.orders.find((x) => x.id === m.orderId);
    if (!o || o.status !== 'carrying' || o.carrierId !== p.id || o.pickedAt === null) return this.reject(p, 'deliver', m.orderId, 'notCarrier');

    const target = targetDoor(this.map, o);
    const near = this.nearDoor(p, target);
    if (near !== 'ok') {
      // standing at the *other* door of the right house?
      const c = this.map.customers.find((cu) => cu.id === o.customerId)!;
      const other = o.request === 'backDoor' ? c.front : c.back;
      const wrong = near === 'far' && this.nearDoor(p, other) === 'ok';
      return this.reject(p, 'deliver', m.orderId, wrong ? 'wrongDoor' : near);
    }

    const integrity = finite(m.integrity) ? clamp(m.integrity, 0, 1) : 0;
    const elapsed = now - o.pickedAt;
    let requestOk: boolean | null = null;
    switch (o.request) {
      case 'noHorn':
        requestOk = !(o.honkedNear || m.honkedNear);
        break;
      case 'gentle':
        requestOk = !(o.crashedDuring || m.crashedDuring);
        break;
      case 'backDoor':
        requestOk = true; // adjudicated by the position check above
        break;
      case 'rush':
        requestOk = elapsed <= o.timeLimit;
        break;
      default:
        break;
    }
    const b = computeTip({
      distance: o.distance,
      food: o.food,
      size: o.size,
      integrity,
      elapsed,
      timeLimit: o.timeLimit,
      request: o.request,
      requestOk,
    });

    this.teamTips += b.tip;
    p.stats.deliveries++;
    p.stats.tips += b.tip;
    p.stats.integritySum += integrity;
    this.endOrder(o, 'delivered', now);
    this.emit({
      ev: 'deliver',
      orderId: o.id,
      playerId: p.id,
      customerId: o.customerId,
      food: o.food,
      request: o.request,
      requestOk,
      integrity,
      tip: b.tip,
      teamTips: this.teamTips,
      parts: b.parts,
      quote: integrityQuote(o.food, integrity),
      onTime: b.onTime,
    });
  }

  private onHonk(p: RoomPlayer, now: number): void {
    if (this.phase !== 'playing' || !this.map) return;
    p.stats.honks++; // every honk counts for 喇叭狂魔 ...
    const audible = p.honkLimit.take(now); // ... but only ~4/s are broadcast
    const pos = p.state?.p ?? [0, 0, 0];
    let dog = false;
    let firstDog = false; // the first time this order's dog wakes up is always announced
    let dogOrder: string | undefined;
    if (p.carrying) {
      const o = this.orders.find((x) => x.id === p.carrying);
      if (o && o.request === 'noHorn' && p.state) {
        const t = targetDoor(this.map, o);
        const dx = pos[0] - t.x;
        const dz = pos[2] - t.z;
        if (dx * dx + dz * dz <= ZONE.HONK_RADIUS * ZONE.HONK_RADIUS) {
          if (!o.honkedNear) firstDog = true;
          o.honkedNear = true; // the rule is enforced on every honk, broadcast or not
          dog = true;
          dogOrder = o.id;
          this.ordersDirty = true;
        }
      }
    }
    if (audible || firstDog) this.emit({ ev: 'honk', playerId: p.id, p: [pos[0], pos[1], pos[2]], dog, orderId: dogOrder });
  }

  private onStat(p: RoomPlayer, key: string, delta: number): void {
    if (this.phase !== 'playing' || !finite(delta)) return;
    switch (key) {
      case 'soupSpilled':
        p.stats.soupSpilled += clamp(delta, 0, 2);
        break;
      case 'pizzasLost':
        p.stats.pizzasLost += clamp(Math.round(delta), 0, 10);
        break;
      case 'scoopsLost':
        p.stats.scoopsLost += clamp(Math.round(delta), 0, 10);
        break;
      case 'maxAirTime':
        p.stats.maxAirTime = Math.max(p.stats.maxAirTime, clamp(delta, 0, 20));
        break;
      case 'crashes': {
        p.stats.crashes += 1;
        if (p.carrying) {
          const o = this.orders.find((x) => x.id === p.carrying);
          if (o) o.crashedDuring = true;
        }
        const pos = p.state?.p ?? [0, 0, 0];
        this.emit({ ev: 'crash', playerId: p.id, p: [pos[0], pos[1], pos[2]] }, p.id);
        break;
      }
      default:
        break;
    }
  }
}
