// Integration tests: the real server, in-process on a random port, driven by real `ws` clients.
import os from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { MAX_MESSAGE_BYTES, startServer, type RunningServer } from '../server/app';
import { ERR } from '../server/rooms';
import { generateCity } from '../src/shared/map';
import type { Order } from '../src/shared/orders';
import type { ClientMsg, ServerMsg } from '../src/shared/protocol';

class Client {
  readonly msgs: ServerMsg[] = [];
  closed = false;
  closeCode = 0;
  id = '';
  private readonly listeners = new Set<() => void>();
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      this.msgs.push(JSON.parse(d.toString()) as ServerMsg);
      this.listeners.forEach((l) => l());
    });
    ws.on('close', (code) => {
      this.closed = true;
      this.closeCode = code;
      this.listeners.forEach((l) => l());
    });
    ws.on('error', () => {});
  }

  static async open(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const c = new Client(ws);
    await new Promise<void>((res, rej) => {
      ws.once('open', () => res());
      ws.once('error', rej);
    });
    const w = (await c.waitFor((m) => m.type === 'welcome')) as Extract<ServerMsg, { type: 'welcome' }>;
    c.id = w.id;
    return c;
  }

  send(msg: ClientMsg | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** resolve with the first message (already received or future) matching pred, searching from `from` */
  waitFor(pred: (m: ServerMsg) => boolean, timeout = 4000, from = 0): Promise<ServerMsg> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`timeout waiting for message; got: ${this.msgs.map((m) => m.type + ('ev' in m ? ':' + m.ev : '')).join(',')}`));
      }, timeout);
      const check = () => {
        const m = this.msgs.slice(from).find(pred);
        if (m) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve(m);
        }
      };
      this.listeners.add(check);
      check();
    });
  }

  waitClosed(timeout = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket did not close')), timeout);
      const check = () => {
        if (this.closed) {
          clearTimeout(timer);
          this.listeners.delete(check);
          resolve();
        }
      };
      this.listeners.add(check);
      check();
    });
  }

  of<T extends ServerMsg['type']>(type: T): Extract<ServerMsg, { type: T }>[] {
    return this.msgs.filter((m) => m.type === type) as Extract<ServerMsg, { type: T }>[];
  }
  events(ev: string): Record<string, unknown>[] {
    return this.msgs.filter((m) => m.type === 'event' && (m as { ev: string }).ev === ev) as unknown as Record<string, unknown>[];
  }
  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRoom = (m: ServerMsg) => m.type === 'room';
const room = (m: ServerMsg) => m as Extract<ServerMsg, { type: 'room' }>;
const isErr = (m: ServerMsg) => m.type === 'error';

async function serverClock(c: Client): Promise<number> {
  const from = c.msgs.length;
  c.send({ type: 'ping', t: 123 });
  return ((await c.waitFor((m) => m.type === 'pong', 2000, from)) as Extract<ServerMsg, { type: 'pong' }>).s;
}

let debugServer: RunningServer;
let plainServer: RunningServer;
const open: Client[] = [];
const connect = async (s: RunningServer) => {
  const c = await Client.open(s.port);
  open.push(c);
  return c;
};

beforeAll(async () => {
  debugServer = await startServer({ port: 0, host: '127.0.0.1', distDir: os.tmpdir(), debug: true });
  plainServer = await startServer({ port: 0, host: '127.0.0.1', distDir: os.tmpdir(), debug: false });
});
afterAll(async () => {
  open.forEach((c) => c.close());
  await debugServer.close();
  await plainServer.close();
});

describe('room lifecycle', () => {
  it('create, join, start: same seed, same orders; pickup is exclusive; a disconnect does not stop the round', async () => {
    const a = await connect(debugServer);
    const b = await connect(debugServer);
    a.send({ type: 'hello', name: '阿强' });
    a.send({ type: 'createRoom' });
    const created = room(await a.waitFor(isRoom));
    expect(created.code).toMatch(/^[A-HJ-NP-Z]{4}$/); // 4 letters, no I / O
    expect(created.hostId).toBe(a.id);
    expect(created.phase).toBe('lobby');
    expect(created.players.map((p) => p.name)).toEqual(['阿强']);

    b.send({ type: 'hello', name: '小美' });
    b.send({ type: 'joinRoom', code: created.code.toLowerCase() }); // codes are case-insensitive
    const joinedB = room(await b.waitFor((m) => isRoom(m) && room(m).players.length === 2));
    const joinedA = room(await a.waitFor((m) => isRoom(m) && room(m).players.length === 2));
    expect(joinedA.players.map((p) => p.name)).toEqual(['阿强', '小美']);
    expect(joinedB.players.map((p) => p.color)).toEqual([0, 1]);
    expect(joinedB.hostId).toBe(a.id);

    // only the host starts
    b.send({ type: 'startGame' });
    await sleep(250);
    expect(b.of('start')).toHaveLength(0);
    expect(a.of('start')).toHaveLength(0);

    a.send({ type: 'startGame', seed: 7, duration: 3 }); // honoured: debug server
    const startA = (await a.waitFor((m) => m.type === 'start')) as Extract<ServerMsg, { type: 'start' }>;
    const startB = (await b.waitFor((m) => m.type === 'start')) as Extract<ServerMsg, { type: 'start' }>;
    expect(startA).toEqual(startB);
    expect(startA.seed).toBe(7);
    expect(startA.duration).toBe(3);

    const ordersA = (await a.waitFor((m) => m.type === 'orders')) as Extract<ServerMsg, { type: 'orders' }>;
    const ordersB = (await b.waitFor((m) => m.type === 'orders')) as Extract<ServerMsg, { type: 'orders' }>;
    expect(ordersA.list).toEqual(ordersB.list);
    expect(ordersA.list).toHaveLength(4); // 2 players + 2

    // both stand at the same restaurant: only the first pickup succeeds
    const map = generateCity(7);
    const order = ordersA.list[0] as Order;
    const door = map.restaurants.find((r) => r.id === order.restaurantId)!.door;
    const t = await serverClock(a);
    for (const c of [a, b]) c.send({ type: 'state', t, p: [door.x, 0.5, door.z], h: 0, l: 0, v: 0, crashed: false, cargo: null });
    await sleep(100);
    a.send({ type: 'pickup', orderId: order.id });
    await a.waitFor((m) => m.type === 'event' && m.ev === 'pickup');
    b.send({ type: 'pickup', orderId: order.id });
    const reject = (await b.waitFor((m) => m.type === 'event' && m.ev === 'reject')) as unknown as { reason: string };
    expect(reject.reason).toBe('taken');
    const pickB = (await b.waitFor((m) => m.type === 'event' && m.ev === 'pickup')) as unknown as { playerId: string };
    expect(pickB.playerId).toBe(a.id); // b was told who got it
    const latest = (c: Client) => c.of('orders').at(-1)!.list.find((o) => o.id === order.id)!;
    await b.waitFor((m) => m.type === 'orders' && m.list.find((o) => o.id === order.id)?.carrierId === a.id);
    expect(latest(b).carrierId).toBe(a.id);
    expect(b.events('reject')).toHaveLength(1);
    expect(a.events('reject')).toHaveLength(0);

    // snapshots flow to the other player
    a.send({ type: 'state', t: await serverClock(a), p: [door.x + 1, 0.5, door.z], h: 0.5, l: 0.1, v: 3, crashed: false, cargo: { kind: 'pizza', a: 3, b: 0.1, c: 0 } });
    const snap = (await b.waitFor((m) => m.type === 'snap' && m.players[a.id]?.cargo != null)) as Extract<ServerMsg, { type: 'snap' }>;
    expect(snap.players[a.id]!.cargo).toEqual({ kind: 'pizza', a: 3, b: 0.1, c: 0 });

    // a drops out mid-round: b is told, becomes host, and the round still ends on time with results for the one left
    a.close();
    const after = room(await b.waitFor((m) => isRoom(m) && room(m).players.length === 1));
    expect(after.hostId).toBe(b.id);
    expect(after.phase).toBe('playing');
    const results = (await b.waitFor((m) => m.type === 'results', 6000)) as Extract<ServerMsg, { type: 'results' }>;
    expect(results.players.map((p) => p.id)).toEqual([b.id]);
    expect(results.teamTips).toBe(0);

    // the host can restart straight from the results screen
    b.send({ type: 'startGame', duration: 60 });
    const restart = (await b.waitFor((m) => m.type === 'start' && m.duration === 60, 3000)) as Extract<ServerMsg, { type: 'start' }>;
    expect(restart.seed).not.toBe(7); // a fresh map
    b.close();
    await sleep(150);
    expect(debugServer.manager.roomCount).toBe(0);
  }, 20000);

  it('rejects bad joins with clear messages', async () => {
    const a = await connect(debugServer);
    const b = await connect(debugServer);
    b.send({ type: 'joinRoom', code: 'ZZZZ' });
    expect(((await b.waitFor(isErr)) as { msg: string }).msg).toBe(ERR.notFound);

    a.send({ type: 'createRoom' });
    const code = room(await a.waitFor(isRoom)).code;
    a.send({ type: 'createRoom' });
    expect(((await a.waitFor(isErr)) as { msg: string }).msg).toBe(ERR.inRoom);

    // fill the room (4 max); the 5th is refused
    const extra = [];
    for (let i = 0; i < 3; i++) {
      const c = await connect(debugServer);
      c.send({ type: 'joinRoom', code });
      await c.waitFor((m) => isRoom(m) && room(m).code === code);
      extra.push(c);
    }
    const fifth = await connect(debugServer);
    fifth.send({ type: 'joinRoom', code });
    expect(((await fifth.waitFor(isErr)) as { msg: string }).msg).toBe(ERR.full);
    expect(room((await a.waitFor((m) => isRoom(m) && room(m).players.length === 4))).players).toHaveLength(4);

    // a room that is playing refuses newcomers with the exact message the client shows
    a.send({ type: 'startGame', duration: 30 });
    await a.waitFor((m) => m.type === 'start');
    b.send({ type: 'joinRoom', code });
    const err = (await b.waitFor((m) => isErr(m) && (m as { msg: string }).msg !== ERR.notFound)) as { msg: string };
    expect(err.msg).toBe('房间正在游戏中，请等下一局');
    expect(b.of('room')).toHaveLength(0);
    [a, b, fifth, ...extra].forEach((c) => c.close());
    await sleep(150);
    expect(debugServer.manager.roomCount).toBe(0);
    // an empty room is gone: its code no longer works
    const late = await connect(debugServer);
    late.send({ type: 'joinRoom', code });
    expect(((await late.waitFor(isErr)) as { msg: string }).msg).toBe(ERR.notFound);
  }, 20000);

  it('lets a newcomer join between rounds (results phase)', async () => {
    const a = await connect(debugServer);
    a.send({ type: 'createRoom' });
    const code = room(await a.waitFor(isRoom)).code;
    a.send({ type: 'startGame', duration: 1 });
    await a.waitFor((m) => m.type === 'results', 4000);
    const b = await connect(debugServer);
    b.send({ type: 'joinRoom', code });
    const r = room(await b.waitFor(isRoom));
    expect(r.phase).toBe('results');
    expect(r.players).toHaveLength(2);
    a.close();
    b.close();
  }, 10000);
});

describe('a production server (no DC_DEBUG)', () => {
  it('refuses debugGive and ignores the host-chosen duration / seed', async () => {
    const a = await connect(plainServer);
    a.send({ type: 'createRoom' });
    await a.waitFor(isRoom);
    a.send({ type: 'startGame', seed: 5, duration: 5 });
    const start = (await a.waitFor((m) => m.type === 'start')) as Extract<ServerMsg, { type: 'start' }>;
    expect(start.duration).toBe(240);
    expect(start.seed).not.toBe(5);
    a.send({ type: 'debugGive' });
    expect(((await a.waitFor(isErr)) as { msg: string }).msg).toBe(ERR.debugOff);
    await sleep(150);
    expect(a.events('pickup')).toHaveLength(0);
    a.close();
  });
});

describe('hardening', () => {
  it('survives garbage: bad JSON, unknown types, wrong shapes, binary frames, oversized messages', async () => {
    const good = await connect(debugServer);
    good.send({ type: 'createRoom' });
    const code = room(await good.waitFor(isRoom)).code;

    const bad = await connect(debugServer);
    for (const raw of ['{not json', '', 'null', '42', '"hi"', '[]', '{"type":"nope"}', '{"type":42}', '{"type":"joinRoom"}', '{"type":"state","t":"x"}', '{"type":"debris","kind":"pizza","p":[1],"v":[1,2,3]}', '{"type":"stat","key":"__proto__","delta":1}']) {
      bad.ws.send(raw);
    }
    bad.ws.send(Buffer.from([1, 2, 3]));
    await sleep(200);
    expect(bad.closed).toBe(false); // polite garbage is simply dropped
    bad.send({ type: 'hello', name: 'x'.repeat(100) });
    bad.send({ type: 'joinRoom', code });
    const r = room(await good.waitFor((m) => isRoom(m) && room(m).players.length === 2));
    expect(r.players[1]!.name.length).toBeLessThanOrEqual(12); // names are clamped

    // an oversized message is refused at the socket (1009) without hurting anyone else
    const big = await connect(debugServer);
    big.ws.send(JSON.stringify({ type: 'hello', name: 'y'.repeat(MAX_MESSAGE_BYTES + 100) }));
    await big.waitClosed();
    expect(big.closeCode).toBe(1009);

    // the server is still fine
    const fresh = await connect(debugServer);
    fresh.send({ type: 'ping', t: 1 });
    await fresh.waitFor((m) => m.type === 'pong');
    [good, bad, fresh].forEach((c) => c.close());
  });

  it('answers ping with its clock', async () => {
    const c = await connect(debugServer);
    const s1 = await serverClock(c);
    await sleep(120);
    const s2 = await serverClock(c);
    expect(s2 - s1).toBeGreaterThan(0.08);
    expect(s2 - s1).toBeLessThan(1);
    const pong = c.of('pong')[0]!;
    expect(pong.t).toBe(123);
    c.close();
  });

  it('a client flooding state messages with junk cannot crash the other player', async () => {
    const a = await connect(debugServer);
    const b = await connect(debugServer);
    a.send({ type: 'createRoom' });
    const code = room(await a.waitFor(isRoom)).code;
    b.send({ type: 'joinRoom', code });
    await b.waitFor((m) => isRoom(m) && room(m).players.length === 2);
    a.send({ type: 'startGame', duration: 30 });
    await b.waitFor((m) => m.type === 'start');
    const t = await serverClock(a);
    for (let i = 0; i < 50; i++) {
      const junk: Record<string, unknown> = { type: 'state', t, p: [i, 0.5, i], h: 0, l: 0, v: 1, crashed: false, cargo: { kind: 'pizza', a: null, b: 'x', c: null } };
      a.send(junk);
      a.send({ type: 'debris', kind: 'pizza', p: [0, 0, 0], v: [1e9, 0, 0] });
    }
    await sleep(300);
    // every snapshot b got is well-formed
    for (const s of b.of('snap')) {
      for (const st of Object.values(s.players)) {
        expect(st.p.every(Number.isFinite)).toBe(true);
        expect(st.cargo).toBeNull();
      }
    }
    for (const d of b.events('debris') as unknown as { v: number[] }[]) expect(Math.hypot(...d.v)).toBeLessThanOrEqual(40.0001);
    expect(b.closed).toBe(false);
    a.close();
    b.close();
  });
});
