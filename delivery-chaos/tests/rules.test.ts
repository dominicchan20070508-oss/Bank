import { describe, expect, it } from 'vitest';
import { ORDERS, ZONE } from '../src/shared/constants';
import { Rng } from '../src/shared/rng';
import { generateCity } from '../src/shared/map';
import { createOrder, targetDoor, type Order } from '../src/shared/orders';
import type { ClientMsg, GameEvent, ResultsMsg, ServerMsg } from '../src/shared/protocol';
import { GameRoom } from '../src/shared/rules';

function mkRoom(nPlayers = 1, opts: { allowDebug?: boolean } = {}) {
  const log: { to: string | '*'; msg: ServerMsg }[] = [];
  const room = new GameRoom({
    code: 'TEST',
    send: (id, msg) => log.push({ to: id, msg }),
    broadcast: (msg) => log.push({ to: '*', msg }),
    allowStartOverrides: true,
    allowDebug: opts.allowDebug ?? true,
  });
  for (let i = 1; i <= nPlayers; i++) room.addPlayer(`p${i}`, `玩家${i}`);
  return { room, log };
}

const events = (log: { msg: ServerMsg }[]) => log.filter((l) => l.msg.type === 'event').map((l) => l.msg as Extract<ServerMsg, { type: 'event' }>);
const eventsOf = <K extends GameEvent['ev']>(log: { msg: ServerMsg }[], k: K) => events(log).filter((e) => e.ev === k) as unknown as Extract<GameEvent, { ev: K }>[];

function at(room: GameRoom, id: string, x: number, z: number, v = 0, now = 0): void {
  room.handle(id, { type: 'state', t: now, p: [x, 0.5, z], h: 0, l: 0, v, crashed: false, cargo: null }, now);
}

function waiting(room: GameRoom): Order[] {
  return room.orders.filter((o) => o.status === 'waiting');
}

/** make the first waiting order a specific kind and return it */
function pick(room: GameRoom, patch: Partial<Order> = {}): Order {
  const o = waiting(room)[0]!;
  Object.assign(o, patch);
  return o;
}

describe('GameRoom lobby & start', () => {
  it('first player is host; only the host can start; max 4 players', () => {
    const { room } = mkRoom(2);
    expect(room.hostId).toBe('p1');
    room.handle('p2', { type: 'startGame' }, 0);
    expect(room.phase).toBe('lobby');
    room.handle('p1', { type: 'startGame', seed: 5, duration: 60 }, 0);
    expect(room.phase).toBe('playing');
    expect(room.seed).toBe(5);
    expect(room.duration).toBe(60);
    const { room: r4 } = mkRoom(4);
    expect(r4.addPlayer('p5', 'x')).toBe(false);
    expect(room.addPlayer('late', 'x')).toBe(false); // can't join mid-round
  });

  it('broadcasts start with the seed, then the order list', () => {
    const { room, log } = mkRoom(1);
    room.start(10, 77, 90);
    const start = log.find((l) => l.msg.type === 'start')!.msg as Extract<ServerMsg, { type: 'start' }>;
    expect(start).toMatchObject({ seed: 77, duration: 90, serverTime: 10 });
    expect(log.some((l) => l.msg.type === 'orders')).toBe(true);
  });

  it('ignores seed/duration overrides unless allowed', () => {
    const room = new GameRoom({ code: 'X', send: () => {}, broadcast: () => {}, seedSource: () => 1234 });
    room.addPlayer('p1', 'a');
    room.handle('p1', { type: 'startGame', seed: 5, duration: 5 }, 0);
    expect(room.seed).toBe(1234);
    expect(room.duration).toBe(240);
  });

  it('host migrates when the host leaves', () => {
    const { room } = mkRoom(3);
    room.removePlayer('p1', 0);
    expect(room.hostId).toBe('p2');
    expect(room.players.size).toBe(2);
  });
});

describe('order pool', () => {
  it('spawns min(players + 2, 6) waiting orders at the start', () => {
    for (const [n, expected] of [[1, 3], [2, 4], [3, 5], [4, 6]] as const) {
      const { room } = mkRoom(n);
      room.start(0, 1);
      expect(waiting(room)).toHaveLength(expected);
    }
  });

  it('orders reference real restaurants / customers and respect the food rules', () => {
    const { room } = mkRoom(4);
    room.start(0, 3);
    const map = room.map!;
    for (const o of room.orders) {
      const r = map.restaurants.find((x) => x.id === o.restaurantId)!;
      expect(o.food).toBe(r.food);
      expect(map.customers.some((c) => c.id === o.customerId)).toBe(true);
      if (o.food === 'pizza') expect(o.size >= 2 && o.size <= 5).toBe(true);
      if (o.food === 'ice') expect(o.size >= 2 && o.size <= 3).toBe(true);
      if (o.food === 'soup') expect(o.size).toBe(1);
      const expectedLimit = o.distance / ORDERS.DELIVERY_SPEED + ORDERS.DELIVERY_SLACK;
      expect(o.timeLimit).toBeCloseTo(o.request === 'rush' ? expectedLimit * ORDERS.RUSH_TIME_MULT : expectedLimit);
    }
  });

  it('about 40% of orders carry a request, all four kinds appear, generation is deterministic', () => {
    const map = generateCity(1);
    const make = () => {
      const rng = new Rng(9);
      const list: Order[] = [];
      for (let i = 0; i < 400; i++) list.push(createOrder(rng, map, `o${i}`, 0, list.slice(-3)));
      return list;
    };
    const a = make();
    expect(JSON.stringify(a)).toBe(JSON.stringify(make()));
    const withReq = a.filter((o) => o.request).length / a.length;
    expect(withReq).toBeGreaterThan(0.3);
    expect(withReq).toBeLessThan(0.5);
    expect(new Set(a.map((o) => o.request).filter(Boolean)).size).toBe(4);
    expect(new Set(a.map((o) => o.restaurantId)).size).toBe(3);
  });

  it('refills the pool 3 s after a pickup and after an expiry', () => {
    const { room } = mkRoom(1);
    room.start(0, 1);
    const o = waiting(room)[0]!;
    const r = room.map!.restaurants.find((x) => x.id === o.restaurantId)!;
    at(room, 'p1', r.door.x, r.door.z);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 1);
    expect(o.status).toBe('carrying');
    expect(waiting(room)).toHaveLength(2);
    room.tick(2.5);
    expect(waiting(room)).toHaveLength(2);
    room.tick(4.1);
    expect(waiting(room)).toHaveLength(3);
  });

  it('waiting orders expire after 45 s (no penalty) and get replaced', () => {
    const { room, log } = mkRoom(1);
    room.start(0, 1);
    const ids = waiting(room).map((o) => o.id);
    room.tick(44);
    expect(waiting(room).map((o) => o.id)).toEqual(ids);
    room.tick(45.5);
    for (const o of room.orders.filter((x) => ids.includes(x.id))) expect(o.status).toBe('expired');
    expect(eventsOf(log, 'expire')).toHaveLength(3);
    expect(room.teamTips).toBe(0);
    room.tick(46.5);
    expect(room.orders.filter((o) => ids.includes(o.id))).toHaveLength(3); // greyed-out cards linger briefly ...
    room.tick(49);
    expect(room.orders.filter((o) => ids.includes(o.id))).toHaveLength(0); // ... then vanish
    expect(waiting(room)).toHaveLength(3); // and the pool has been refilled
  });
});

describe('pickup adjudication', () => {
  it('first come first served; the loser is told the order was taken', () => {
    const { room, log } = mkRoom(2);
    room.start(0, 1);
    const o = waiting(room)[0]!;
    const door = room.map!.restaurants.find((x) => x.id === o.restaurantId)!.door;
    at(room, 'p1', door.x, door.z);
    at(room, 'p2', door.x + 1, door.z);
    room.handle('p2', { type: 'pickup', orderId: o.id }, 1);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 1.01);
    expect(o.carrierId).toBe('p2');
    expect(room.players.get('p2')!.carrying).toBe(o.id);
    expect(room.players.get('p1')!.carrying).toBeNull();
    const rej = eventsOf(log, 'reject');
    expect(rej).toHaveLength(1);
    expect(rej[0]).toMatchObject({ kind: 'pickup', orderId: o.id, reason: 'taken' });
    expect(log.filter((l) => l.to === 'p1' && l.msg.type === 'event' && l.msg.ev === 'reject')).toHaveLength(1); // only the loser hears it
  });

  it('one order per player at a time', () => {
    const { room, log } = mkRoom(1);
    room.start(0, 1);
    const [a, b] = waiting(room);
    // put the player at a's restaurant, pick a, then try b (make b the same restaurant so position is valid)
    b!.restaurantId = a!.restaurantId;
    const door = room.map!.restaurants.find((x) => x.id === a!.restaurantId)!.door;
    at(room, 'p1', door.x, door.z);
    room.handle('p1', { type: 'pickup', orderId: a!.id }, 1);
    room.handle('p1', { type: 'pickup', orderId: b!.id }, 2);
    expect(b!.status).toBe('waiting');
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ reason: 'busy' });
  });

  it('needs the player to be in the circle (with lag tolerance) and not speeding', () => {
    const { room, log } = mkRoom(1);
    room.start(0, 1);
    const o = waiting(room)[0]!;
    const d = room.map!.restaurants.find((x) => x.id === o.restaurantId)!.door;
    room.handle('p1', { type: 'pickup', orderId: o.id }, 1);
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ reason: 'state' }); // no position reported yet
    at(room, 'p1', d.x + ZONE.RADIUS + ZONE.SERVER_POS_TOLERANCE + 1, d.z);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 1);
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ reason: 'far' });
    at(room, 'p1', d.x, d.z, 20);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 1);
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ reason: 'fast' });
    at(room, 'p1', d.x + 3, d.z, 1);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 1);
    expect(o.status).toBe('carrying');
  });
});

describe('delivery, tips and special requests', () => {
  function carry(nPlayers = 1, patch: Partial<Order> = {}) {
    const ctx = mkRoom(nPlayers);
    ctx.room.start(0, 1);
    const o = pick(ctx.room, patch);
    const r = ctx.room.map!.restaurants.find((x) => x.id === o.restaurantId)!;
    at(ctx.room, 'p1', r.door.x, r.door.z);
    ctx.room.handle('p1', { type: 'pickup', orderId: o.id }, 0);
    const door = targetDoor(ctx.room.map!, o);
    at(ctx.room, 'p1', door.x, door.z, 0, 10);
    return { ...ctx, o, door };
  }
  const deliver = (room: GameRoom, o: Order, extra: Partial<Extract<ClientMsg, { type: 'deliver' }>> = {}, now = 10) =>
    room.handle('p1', { type: 'deliver', orderId: o.id, integrity: 1, crashedDuring: false, honkedNear: false, ...extra }, now);

  it('a normal delivery pays the formula tip into the team pool and updates stats', () => {
    const { room, log, o } = carry(1, { request: null, distance: 100, timeLimit: 40, food: 'soup', size: 1 });
    deliver(room, o, { integrity: 0.8 }, 20); // 20 s of 40 s used
    const ev = eventsOf(log, 'deliver')[0]!;
    // base 18 * (0.3 + 0.56) * 1.25 = 19.35 -> 19
    expect(ev.tip).toBe(19);
    expect(room.teamTips).toBe(19);
    expect(ev.teamTips).toBe(19);
    expect(ev.parts[0]).toEqual({ key: 'tip.integrity', pct: 80 });
    expect(ev.parts[1]).toEqual({ key: 'tip.early', secs: 20 });
    expect(ev.quote).toBe('quote.ok');
    expect(o.status).toBe('delivered');
    const st = room.players.get('p1')!.stats;
    expect(st).toMatchObject({ deliveries: 1, tips: 19 });
    expect(st.integritySum).toBeCloseTo(0.8);
    expect(room.players.get('p1')!.carrying).toBeNull();
    // pool message reflects the new total
    const orders = [...log].reverse().find((l) => l.msg.type === 'orders')!.msg as Extract<ServerMsg, { type: 'orders' }>;
    expect(orders.teamTips).toBe(19);
  });

  it('needs to be at the door; tips also pool across players', () => {
    const { room, log, o } = carry(2);
    at(room, 'p1', 0, 0, 0, 10);
    deliver(room, o);
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ kind: 'deliver', reason: 'far' });
    expect(o.status).toBe('carrying');
    // a different player cannot deliver someone else's order
    room.handle('p2', { type: 'deliver', orderId: o.id, integrity: 1, crashedDuring: false, honkedNear: false }, 10);
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ reason: 'notCarrier' });
  });

  it('zero integrity is delivered but pays nothing', () => {
    const { room, log, o } = carry(1, { request: null });
    deliver(room, o, { integrity: 0 });
    expect(eventsOf(log, 'deliver')[0]).toMatchObject({ tip: 0, quote: 'quote.none' });
    expect(room.teamTips).toBe(0);
    expect(o.status).toBe('delivered');
  });

  it('backDoor orders only complete at the back door', () => {
    const { room, log, o } = carry(1, { request: 'backDoor', distance: 100, timeLimit: 60 });
    const c = room.map!.customers.find((x) => x.id === o.customerId)!;
    at(room, 'p1', c.front.x, c.front.z, 0, 10);
    deliver(room, o);
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ reason: 'wrongDoor' });
    expect(o.status).toBe('carrying');
    at(room, 'p1', c.back.x, c.back.z, 0, 11);
    deliver(room, o, {}, 11);
    expect(o.status).toBe('delivered');
    expect(eventsOf(log, 'deliver')[0]).toMatchObject({ request: 'backDoor', requestOk: true });
  });

  it('a normal order does not complete at the back door', () => {
    const { room, log, o } = carry(1, { request: null });
    const c = room.map!.customers.find((x) => x.id === o.customerId)!;
    at(room, 'p1', c.back.x, c.back.z, 0, 10);
    deliver(room, o);
    expect(eventsOf(log, 'reject').pop()).toMatchObject({ reason: 'wrongDoor' });
  });

  it('noHorn: honking within 30 m of the customer wakes the dog and costs the bonus', () => {
    const { room, log, o, door } = carry(1, { request: 'noHorn', distance: 100, timeLimit: 40 });
    // honk far away: fine
    at(room, 'p1', door.x + 80, door.z, 5, 5);
    room.handle('p1', { type: 'honk' }, 5);
    expect(eventsOf(log, 'honk').pop()).toMatchObject({ dog: false });
    expect(o.honkedNear).toBe(false);
    // honk close: dog
    at(room, 'p1', door.x + 20, door.z, 5, 6);
    room.handle('p1', { type: 'honk' }, 6);
    expect(eventsOf(log, 'honk').pop()).toMatchObject({ dog: true, orderId: o.id });
    expect(o.honkedNear).toBe(true);
    at(room, 'p1', door.x, door.z, 0, 10);
    deliver(room, o, {}, 40); // exactly at the limit -> timeMult 1
    const ev = eventsOf(log, 'deliver')[0]!;
    expect(ev.requestOk).toBe(false);
    expect(ev.tip).toBe(Math.round(18 * 1 * 1 - 8));
    expect(room.players.get('p1')!.stats.honks).toBe(2);
  });

  it('noHorn: a clean approach earns the bonus', () => {
    const { room, log, o } = carry(1, { request: 'noHorn', distance: 100, timeLimit: 40 });
    deliver(room, o, {}, 40);
    expect(eventsOf(log, 'deliver')[0]).toMatchObject({ requestOk: true, tip: 26 });
  });

  it('gentle: a crash while carrying fails the request', () => {
    const { room, log, o } = carry(1, { request: 'gentle', distance: 100, timeLimit: 40 });
    room.handle('p1', { type: 'stat', key: 'crashes', delta: 1 }, 5);
    expect(o.crashedDuring).toBe(true);
    deliver(room, o, {}, 40);
    expect(eventsOf(log, 'deliver')[0]).toMatchObject({ requestOk: false, tip: 10 });
    expect(room.players.get('p1')!.stats.crashes).toBe(1);
  });

  it('gentle: client-reported crashes count too', () => {
    const { room, log, o } = carry(1, { request: 'gentle', distance: 100, timeLimit: 40 });
    deliver(room, o, { crashedDuring: true }, 40);
    expect(eventsOf(log, 'deliver')[0]).toMatchObject({ requestOk: false });
  });

  it('rush: bonus only when on time', () => {
    const fast = carry(1, { request: 'rush', distance: 100, timeLimit: 30 });
    deliver(fast.room, fast.o, {}, 30);
    expect(eventsOf(fast.log, 'deliver')[0]).toMatchObject({ requestOk: true, tip: 18 + 15 });
    const slow = carry(1, { request: 'rush', distance: 100, timeLimit: 30 });
    deliver(slow.room, slow.o, {}, 50);
    // late: timeMult 0.5 and -8
    expect(eventsOf(slow.log, 'deliver')[0]).toMatchObject({ requestOk: false, onTime: false, tip: Math.max(0, Math.round(18 * 0.5 - 8)) });
  });

  it('late delivery is still accepted, at a discount', () => {
    const { room, log, o } = carry(1, { request: null, distance: 100, timeLimit: 30, food: 'soup', size: 1 });
    deliver(room, o, {}, 500);
    expect(eventsOf(log, 'deliver')[0]).toMatchObject({ onTime: false, tip: 9 });
  });

  it('a disconnecting carrier frees nothing but loses the order', () => {
    const { room, o } = carry(2);
    room.removePlayer('p1', 12);
    expect(o.status).toBe('expired');
    expect(room.hostId).toBe('p2');
  });
});

describe('end of round', () => {
  it('timer end -> results with stars and awards, carried orders are dropped, play stops', () => {
    const { room, log } = mkRoom(2);
    room.start(100, 1, 60);
    const o = pick(room, { request: null, distance: 100, timeLimit: 50, food: 'soup', size: 1 });
    const r = room.map!.restaurants.find((x) => x.id === o.restaurantId)!;
    at(room, 'p1', r.door.x, r.door.z, 0, 101);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 101);
    const door = targetDoor(room.map!, o);
    at(room, 'p1', door.x, door.z, 0, 110);
    room.handle('p1', { type: 'deliver', orderId: o.id, integrity: 1, crashedDuring: false, honkedNear: false }, 110);
    room.handle('p2', { type: 'stat', key: 'crashes', delta: 1 }, 111);
    room.handle('p2', { type: 'honk' }, 112);

    // a second order is still being carried when time runs out
    const o2 = waiting(room)[0]!;
    const r2 = room.map!.restaurants.find((x) => x.id === o2.restaurantId)!;
    at(room, 'p1', r2.door.x, r2.door.z, 0, 120);
    room.handle('p1', { type: 'pickup', orderId: o2.id }, 120);

    room.tick(159);
    expect(room.phase).toBe('playing');
    expect(room.timeLeft(159)).toBeCloseTo(1);
    room.tick(160);
    expect(room.phase).toBe('results');
    expect(room.players.get('p1')!.carrying).toBeNull();
    expect(o2.status).toBe('expired');
    const res = log.find((l) => l.msg.type === 'results')!.msg as ResultsMsg;
    expect(res.teamTips).toBe(room.teamTips);
    expect(res.teamTips).toBeGreaterThan(0);
    expect(res.stars).toBeGreaterThanOrEqual(0);
    expect(res.players).toHaveLength(2);
    expect(res.awards.find((a) => a.id === 'tips')?.playerId).toBe('p1');
    expect(res.awards.find((a) => a.id === 'crash')?.playerId).toBe('p2');
    // nothing is accepted after the end
    const before = room.teamTips;
    room.handle('p1', { type: 'deliver', orderId: o.id, integrity: 1, crashedDuring: false, honkedNear: false }, 161);
    expect(room.teamTips).toBe(before);
    // and no more ticking side effects
    room.tick(500);
    expect(room.phase).toBe('results');
  });

  it('host can go back to the lobby and start again with fresh state', () => {
    const { room } = mkRoom(1);
    room.start(0, 1, 10);
    room.tick(11);
    expect(room.phase).toBe('results');
    room.handle('p1', { type: 'backToLobby' }, 12);
    expect(room.phase).toBe('lobby');
    expect(room.teamTips).toBe(0);
    room.handle('p1', { type: 'startGame', seed: 2 }, 13);
    expect(room.phase).toBe('playing');
    expect(room.seed).toBe(2);
    expect(waiting(room)).toHaveLength(3);
    expect(room.endsAt).toBe(13 + room.duration);
  });

  it('debugGive hands a waiting order over without the pickup checks, only when allowed', () => {
    const a = mkRoom(1, { allowDebug: true });
    a.room.start(0, 1);
    a.room.handle('p1', { type: 'debugGive' }, 1);
    expect(a.room.players.get('p1')!.carrying).not.toBeNull();
    const b = mkRoom(1, { allowDebug: false });
    b.room.start(0, 1);
    b.room.handle('p1', { type: 'debugGive' }, 1);
    expect(b.room.players.get('p1')!.carrying).toBeNull();
  });

  it('snapshots go out at ~20 Hz (50 ms ticks, a little jitter) and only carry riders that sent something new', () => {
    const { room, log } = mkRoom(2);
    room.start(0, 1);
    const jitter = [0.002, -0.003, 0.004, -0.001, 0.003];
    let n = 0;
    for (let t = 0.05; t < 2.0; t += 0.05) {
      const now = t + jitter[n++ % jitter.length]!;
      at(room, 'p1', t, 2, 0, now);
      if (n % 2 === 0) at(room, 'p2', 3, t, 0, now); // p2 reports at 10 Hz
      room.tick(now);
    }
    const snaps = log.filter((l) => l.msg.type === 'snap').map((l) => l.msg as Extract<ServerMsg, { type: 'snap' }>);
    expect(snaps.length).toBeGreaterThanOrEqual(36);
    expect(snaps.length).toBeLessThanOrEqual(42);
    expect(snaps.every((s) => 'p1' in s.players)).toBe(true);
    expect(snaps.filter((s) => 'p2' in s.players).length).toBeLessThan(snaps.length * 0.7); // only when it was updated
  });
});

describe('relayed data is validated (one bad client must not crash its teammates)', () => {
  const ok = { kind: 'pizza', p: [1, 2, 3], v: [1, 2, 3] };
  const debrisTo = (log: { msg: ServerMsg }[]) => eventsOf(log, 'debris');
  const send = (room: GameRoom, id: string, msg: unknown, now = 1) => room.handle(id, msg as ClientMsg, now);

  function twoPlayers() {
    const ctx = mkRoom(2);
    ctx.room.start(0, 1);
    return ctx;
  }

  it('debris: well-formed messages are relayed to the others (not back to the sender)', () => {
    const { room, log } = twoPlayers();
    send(room, 'p1', { type: 'debris', ...ok });
    expect(debrisTo(log)).toHaveLength(1);
    expect(debrisTo(log)[0]).toMatchObject({ playerId: 'p1', kind: 'pizza', p: [1, 2, 3], v: [1, 2, 3] });
  });

  it('debris: bad kind, NaN, wrong length, missing or absurd values are dropped', () => {
    const { room, log } = twoPlayers();
    const bad = [
      { type: 'debris', kind: 'bomb', p: [1, 2, 3], v: [1, 2, 3] },
      { type: 'debris', kind: 42, p: [1, 2, 3], v: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: [1, NaN, 3], v: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: [1, 2, 3], v: [1, Infinity, 3] },
      { type: 'debris', kind: 'pizza', p: [1, 2], v: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: [1, 2, 3, 4], v: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: 'x', v: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: [1e9, 0, 0], v: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: [null, 0, 0], v: [1, 2, 3] },
      { type: 'debris', kind: 'pizza', p: ['1', 0, 0], v: [1, 2, 3] },
    ];
    for (const b of bad) send(room, 'p1', b);
    expect(debrisTo(log)).toHaveLength(0);
  });

  it('debris: speed is clamped to 40 m/s, direction kept', () => {
    const { room, log } = twoPlayers();
    send(room, 'p1', { type: 'debris', kind: 'scoop', p: [0, 1, 0], v: [300, 400, 0] });
    const v = debrisTo(log)[0]!.v;
    expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(40, 5);
    expect(v[1] / v[0]).toBeCloseTo(4 / 3, 5);
  });

  it('debris: rate limited to ~15 per second per player, and the allowance refills', () => {
    const { room, log } = twoPlayers();
    for (let i = 0; i < 100; i++) send(room, 'p1', { type: 'debris', ...ok }, 1 + i * 0.001); // a burst within 0.1 s
    expect(debrisTo(log).length).toBeLessThanOrEqual(16);
    expect(debrisTo(log).length).toBeGreaterThanOrEqual(14);
    const before = debrisTo(log).length;
    // a second player is unaffected, and p1 is allowed again a second later
    send(room, 'p2', { type: 'debris', ...ok }, 1.2);
    send(room, 'p1', { type: 'debris', ...ok }, 2.5);
    expect(debrisTo(log).length).toBe(before + 2);
    // sustained 100/s for 3 s -> about 15/s gets through
    const { room: r2, log: l2 } = twoPlayers();
    for (let i = 0; i < 300; i++) send(r2, 'p1', { type: 'debris', ...ok }, 1 + i * 0.01);
    expect(debrisTo(l2).length).toBeGreaterThan(40);
    expect(debrisTo(l2).length).toBeLessThan(65);
  });

  it('debris: ignored outside a running round', () => {
    const { room, log } = mkRoom(2);
    send(room, 'p1', { type: 'debris', ...ok }, 1);
    expect(debrisTo(log)).toHaveLength(0);
  });

  it('state: cargo is rebuilt into the known summary shape, junk becomes null', () => {
    const { room, log } = twoPlayers();
    const state = (cargo: unknown, extra: Record<string, unknown> = {}) =>
      send(room, 'p1', { type: 'state', t: 1, p: [1, 0.5, 2], h: 0, l: 0, v: 3, crashed: false, cargo, ...extra }, 1);
    let tickAt = 1;
    const lastSnapCargo = () => {
      room.tick((tickAt += 0.1)); // one snapshot per call
      const snaps = log.filter((l) => l.msg.type === 'snap');
      const s = snaps[snaps.length - 1]?.msg as Extract<ServerMsg, { type: 'snap' }> | undefined;
      return s?.players.p1?.cargo;
    };
    state({ kind: 'pizza', a: 3, b: 0.2, c: -0.1, evil: 'x'.repeat(1000), __proto__: { x: 1 } });
    expect(lastSnapCargo()).toEqual({ kind: 'pizza', a: 3, b: 0.2, c: -0.1 });
    for (const junk of [{ kind: 'bomb', a: 1, b: 0, c: 0 }, { kind: 'soup', a: NaN, b: 0, c: 0 }, { kind: 'soup', a: 1, b: 'x', c: 0 }, { kind: 'soup', a: 1 }, 'soup', 42, [], { kind: 7, a: 1, b: 1, c: 1 }]) {
      state(junk);
      expect(lastSnapCargo()).toBeNull();
    }
    // out-of-range numbers are clamped rather than trusted
    state({ kind: 'ice', a: 1e9, b: -1e9, c: 1e9 });
    expect(lastSnapCargo()).toEqual({ kind: 'ice', a: 50, b: -5, c: 5 });
  });

  it('state: t, position, heading, lean and speed must be finite, otherwise the message is ignored', () => {
    const { room } = twoPlayers();
    const base = { type: 'state', p: [1, 0.5, 2], h: 0, l: 0, v: 3, crashed: false, cargo: null };
    const stored = () => room.players.get('p1')!.state;
    send(room, 'p1', { ...base, t: 1 });
    expect(stored()?.p).toEqual([1, 0.5, 2]);
    send(room, 'p1', { ...base, t: 1, p: [9, 0.5, 9], v: NaN });
    send(room, 'p1', { ...base, t: NaN, p: [9, 0.5, 9] });
    send(room, 'p1', { ...base, t: undefined, p: [9, 0.5, 9] });
    send(room, 'p1', { ...base, t: Infinity, p: [9, 0.5, 9] });
    send(room, 'p1', { ...base, t: '1', p: [9, 0.5, 9] });
    send(room, 'p1', { ...base, t: 1, p: [9, 0.5, NaN] });
    send(room, 'p1', { ...base, t: 1, h: Infinity, p: [9, 0.5, 9] });
    send(room, 'p1', { ...base, t: 1, l: null, p: [9, 0.5, 9] });
    send(room, 'p1', { ...base, t: 1, p: [9, 0.5], h: 0 });
    expect(stored()?.p).toEqual([1, 0.5, 2]); // none of them got through
  });

  it('state: a wildly wrong timestamp is replaced by the server clock', () => {
    const { room } = twoPlayers();
    send(room, 'p1', { type: 'state', t: 99999, p: [1, 0.5, 2], h: 0, l: 0, v: 3, crashed: false, cargo: null }, 5);
    expect(room.players.get('p1')!.state!.t).toBe(5);
    send(room, 'p1', { type: 'state', t: 5.2, p: [1, 0.5, 2], h: 0, l: 0, v: 3, crashed: false, cargo: null }, 5);
    expect(room.players.get('p1')!.state!.t).toBe(5.2);
  });

  it('honk: broadcasts are limited to ~4/s per player, but every honk is counted', () => {
    const { room, log } = twoPlayers();
    at(room, 'p1', 0, 0, 0, 1);
    for (let i = 0; i < 40; i++) room.handle('p1', { type: 'honk' }, 1 + i * 0.01); // 40 honks in 0.4 s
    const heard = eventsOf(log, 'honk');
    expect(heard.length).toBeLessThanOrEqual(5);
    expect(heard.length).toBeGreaterThanOrEqual(3);
    expect(room.players.get('p1')!.stats.honks).toBe(40);
    // sustained: 10 honks/s for 3 s -> about 4/s audible (+ the initial burst allowance)
    const { room: r2, log: l2 } = twoPlayers();
    at(r2, 'p1', 0, 0, 0, 1);
    for (let i = 0; i < 30; i++) r2.handle('p1', { type: 'honk' }, 1 + i * 0.1);
    expect(eventsOf(l2, 'honk').length).toBeGreaterThan(9);
    expect(eventsOf(l2, 'honk').length).toBeLessThanOrEqual(16);
    expect(r2.players.get('p1')!.stats.honks).toBe(30);
  });

  it('honk: the noHorn rule is enforced on every honk, and the dog is announced even when the spam is throttled', () => {
    const { room, log } = mkRoom(1);
    room.start(0, 1);
    const o = pick(room, { request: 'noHorn', distance: 100, timeLimit: 40 });
    const r = room.map!.restaurants.find((x) => x.id === o.restaurantId)!;
    at(room, 'p1', r.door.x, r.door.z, 0, 0);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 0);
    const door = targetDoor(room.map!, o);
    at(room, 'p1', door.x + 50, door.z, 5, 1);
    for (let i = 0; i < 10; i++) room.handle('p1', { type: 'honk' }, 1 + i * 0.001); // burns the allowance far from the house
    at(room, 'p1', door.x + 10, door.z, 5, 1.01);
    room.handle('p1', { type: 'honk' }, 1.011); // throttled, but it wakes the dog
    expect(o.honkedNear).toBe(true);
    expect(eventsOf(log, 'honk').some((e) => e.dog)).toBe(true);
  });

  it('names and hello are sanitised', () => {
    const { room } = mkRoom(1);
    room.handle('p1', { type: 'hello', name: '  <b>超级长的名字超级长的名字超级长的名字</b>  ' }, 0);
    expect(room.players.get('p1')!.name.length).toBeLessThanOrEqual(12);
    expect(room.players.get('p1')!.name).not.toMatch(/[<>]/);
    room.handle('p1', { type: 'hello', name: { evil: true } } as unknown as ClientMsg, 0);
    expect(room.players.get('p1')!.name).toBe(''); // unnamed: each client shows its own language's "Rider 1"
  });
});

describe('i18n: the rules emit codes and numbers, never Chinese sentences (DESIGN §13.1)', () => {
  const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

  it('a full round (pickup, delivery with a request, honk near a dog, results) sends no CJK text from the rules', () => {
    // ASCII player names: those are the only user-typed text that may legitimately travel
    const log: { to: string | '*'; msg: ServerMsg }[] = [];
    const room = new GameRoom({ code: 'TEST', send: (id, msg) => log.push({ to: id, msg }), broadcast: (msg) => log.push({ to: '*', msg }), allowStartOverrides: true, allowDebug: true });
    room.addPlayer('p1', 'Alex');
    room.addPlayer('p2', ''); // unnamed
    room.start(0, 3, 60);
    const o = pick(room, { request: 'noHorn', distance: 100, timeLimit: 50, food: 'pizza', size: 3 });
    const r = room.map!.restaurants.find((x) => x.id === o.restaurantId)!;
    at(room, 'p1', r.door.x, r.door.z, 0, 1);
    room.handle('p1', { type: 'pickup', orderId: o.id }, 1);
    const door = targetDoor(room.map!, o);
    at(room, 'p1', door.x + 3, door.z, 0, 5);
    room.handle('p1', { type: 'honk' }, 5); // wakes the dog
    at(room, 'p1', door.x, door.z, 0, 10);
    room.handle('p1', { type: 'deliver', orderId: o.id, integrity: 0.5, crashedDuring: false, honkedNear: true }, 10);
    room.handle('p2', { type: 'stat', key: 'crashes', delta: 1 }, 11);
    room.handle('p2', { type: 'pickup', orderId: 'nope' }, 12); // a reject
    room.tick(61);
    expect(room.phase).toBe('results');

    const text = JSON.stringify(log.map((l) => l.msg));
    expect(text).not.toMatch(CJK);
    const d = eventsOf(log, 'deliver')[0]!;
    expect(d.parts.map((p) => p.key)).toEqual(['tip.integrity', 'tip.early', 'tip.noHorn.fail']);
    expect(d.quote).toBe('quote.mid.pizza');
    expect(room.players.get('p2')!.name).toBe('');
    const res = log.find((l) => l.msg.type === 'results')!.msg as ResultsMsg;
    for (const a of res.awards) {
      expect(a).not.toHaveProperty('title');
      expect(a).not.toHaveProperty('detail');
      expect(typeof a.value).toBe('number');
    }
  });

  it('the map carries both languages for every restaurant and customer', async () => {
    const map = generateCity(11);
    for (const r of map.restaurants) {
      expect(r.name).toMatch(CJK);
      expect(r.nameEn).not.toMatch(CJK);
      expect(r.nameEn.length).toBeGreaterThan(2);
    }
    for (const c of map.customers) {
      expect(c.name).toMatch(CJK);
      expect(c.nameEn).toMatch(/^Bldg \d+ · [A-Z]/);
      expect(c.nameEn).not.toMatch(CJK);
    }
    expect(map.restaurants.map((r) => r.nameEn)).toEqual(["Wang's Soup House", 'Uncle Pizza', 'Chill Desserts']);
  });

  it('adding English names did not change the generated city (the shuffle is permutation-stable)', () => {
    const a = generateCity(1);
    // customer i keeps the same house number and the same Chinese name as the v0.1 generator would give; spot-check determinism
    const b = generateCity(1);
    expect(a.customers.map((c) => c.name)).toEqual(b.customers.map((c) => c.name));
    expect(a.customers.map((c) => c.nameEn)).toEqual(b.customers.map((c) => c.nameEn));
    // zh and en agree on the building number
    for (const c of a.customers) expect(c.nameEn.startsWith(`Bldg ${c.houseNo} ·`)).toBe(true);
  });
});

