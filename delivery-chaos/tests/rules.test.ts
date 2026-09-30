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
    expect(ev.summary).toContain('完整度 80%');
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
    expect(eventsOf(log, 'deliver')[0]).toMatchObject({ tip: 0, quote: '我的外卖呢？？' });
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

  it('snapshots are relayed at ~20 Hz to multi-player rooms', () => {
    const { room, log } = mkRoom(2);
    room.start(0, 1);
    at(room, 'p1', 1, 2);
    at(room, 'p2', 3, 4);
    for (let t = 0; t < 1; t += 0.01) room.tick(t);
    const snaps = log.filter((l) => l.msg.type === 'snap');
    expect(snaps.length).toBeGreaterThanOrEqual(18);
    expect(snaps.length).toBeLessThanOrEqual(22);
    const last = snaps[snaps.length - 1]!.msg as Extract<ServerMsg, { type: 'snap' }>;
    expect(Object.keys(last.players).sort()).toEqual(['p1', 'p2']);
  });
});
