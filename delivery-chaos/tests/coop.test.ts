// v0.3 co-op rules (DESIGN §14.3 / §14.4): quick chat + claims, salvage zones, new awards, the anonymous round summary.
import { describe, expect, it } from 'vitest';
import { GAME_VERSION, QUICK, SALVAGE, SALVAGE_TIP, ZONE } from '../src/shared/constants';
import { restaurantOf } from '../src/shared/orders';
import { PING_IDS } from '../src/shared/pings';
import type { ClientMsg, GameEvent, ServerMsg } from '../src/shared/protocol';
import { GameRoom } from '../src/shared/rules';
import { emptyStats, pickAwards } from '../src/shared/scoring';
import { formatRoundSummary, type RoundSummary } from '../src/shared/summary';
import { parseClientMsg } from '../src/shared/validate';

function mkRoom(n = 2, onRoundEnd?: (s: RoundSummary) => void) {
  const log: { to: string | '*'; except?: string; msg: ServerMsg }[] = [];
  const room = new GameRoom({
    code: 'TEST',
    send: (id, msg) => log.push({ to: id, msg }),
    broadcast: (msg, except) => log.push({ to: '*', except, msg }),
    allowStartOverrides: true,
    allowDebug: true,
    onRoundEnd,
  });
  for (let i = 1; i <= n; i++) room.addPlayer(`p${i}`, `Name${i}`);
  room.start(0, 7, 120);
  return { room, log };
}

type Ev = Extract<ServerMsg, { type: 'event' }>;
const evs = <K extends GameEvent['ev']>(log: { msg: ServerMsg }[], k: K) =>
  log.filter((l) => l.msg.type === 'event' && (l.msg as Ev).ev === k) as unknown as { except?: string; msg: Extract<GameEvent, { ev: K }> }[];

function at(room: GameRoom, id: string, x: number, z: number, v = 0, now = 0, crashed = false): void {
  room.handle(id, { type: 'state', t: now, p: [x, 0.5, z], h: 0, l: 0, v, crashed, cargo: null }, now);
}
const send = (room: GameRoom, id: string, msg: ClientMsg, now: number) => room.handle(id, msg, now);
const waiting = (room: GameRoom) => room.orders.filter((o) => o.status === 'waiting');

/** put player `id` next to the restaurant of the given order */
function nearRestaurant(room: GameRoom, id: string, orderId: string, now: number): void {
  const o = room.orders.find((x) => x.id === orderId)!;
  const d = restaurantOf(room.map!, o).door;
  at(room, id, d.x, d.z, 0, now);
}

describe('validators for the v0.3 messages', () => {
  it('quick: only the six preset ids, optional short orderId', () => {
    for (const id of PING_IDS) expect(parseClientMsg({ type: 'quick', id })).toEqual({ type: 'quick', id });
    expect(parseClientMsg({ type: 'quick', id: 'claim', orderId: 'o3' })).toEqual({ type: 'quick', id: 'claim', orderId: 'o3' });
    expect(parseClientMsg({ type: 'quick', id: 'hello world' })).toBeNull();
    expect(parseClientMsg({ type: 'quick', id: 42 })).toBeNull();
    expect(parseClientMsg({ type: 'quick' })).toBeNull();
    expect(parseClientMsg({ type: 'quick', id: 'claim', orderId: 'x'.repeat(100) })).toBeNull();
    expect(parseClientMsg({ type: 'quick', id: 'claim', orderId: { a: 1 } })).toBeNull();
    // nothing but the known fields survives
    expect(parseClientMsg({ type: 'quick', id: 'nice', text: '<script>', extra: 1 })).toEqual({ type: 'quick', id: 'nice' });
  });
  it('salvage / caps', () => {
    expect(parseClientMsg({ type: 'salvage', zoneId: 's1' })).toEqual({ type: 'salvage', zoneId: 's1' });
    expect(parseClientMsg({ type: 'salvage' })).toBeNull();
    expect(parseClientMsg({ type: 'salvage', zoneId: '' })).toBeNull();
    expect(parseClientMsg({ type: 'salvage', zoneId: 7 })).toBeNull();
    expect(parseClientMsg({ type: 'caps', touch: true, autoGas: 'yes' })).toEqual({ type: 'caps', touch: true, autoGas: false });
    expect(parseClientMsg({ type: 'caps' })).toEqual({ type: 'caps', touch: false, autoGas: false });
  });
});

describe('quick chat + claims', () => {
  it('broadcasts every preset to everybody with the sender id; only "claim" carries an order', () => {
    const { room, log } = mkRoom(2);
    let now = 1;
    for (const id of PING_IDS) {
      send(room, 'p1', { type: 'quick', id }, now);
      now += QUICK.COOLDOWN + 0.1;
    }
    const pings = evs(log, 'ping').filter((e) => e.msg.pingId !== 'help' || e.except === undefined);
    expect(pings.map((e) => e.msg.pingId)).toEqual([...PING_IDS]);
    expect(pings.every((e) => e.msg.playerId === 'p1' && e.except === undefined)).toBe(true);
    expect(pings.find((e) => e.msg.pingId === 'claim')!.msg.orderId).toMatch(/^o\d+$/);
    expect(pings.filter((e) => e.msg.pingId !== 'claim').every((e) => e.msg.orderId === undefined)).toBe(true);
    expect(room.players.get('p1')!.stats.pings).toBe(6);
  });

  it('cooldown: a second message within 1.5 s is dropped, one after it goes through', () => {
    const { room, log } = mkRoom(2);
    send(room, 'p1', { type: 'quick', id: 'nice' }, 1);
    send(room, 'p1', { type: 'quick', id: 'thanks' }, 1 + QUICK.COOLDOWN - 0.1);
    expect(evs(log, 'ping')).toHaveLength(1);
    send(room, 'p1', { type: 'quick', id: 'thanks' }, 1 + QUICK.COOLDOWN + 0.05);
    expect(evs(log, 'ping')).toHaveLength(2);
    // the cooldown is per player
    send(room, 'p2', { type: 'quick', id: 'wait' }, 1.2);
    expect(evs(log, 'ping')).toHaveLength(3);
  });

  it('flooding is capped by the token bucket (even at cooldown-defeating timestamps)', () => {
    const { room, log } = mkRoom(2);
    for (let i = 0; i < 200; i++) send(room, 'p1', { type: 'quick', id: 'nice' }, 5 + i * 0.001);
    expect(evs(log, 'ping')).toHaveLength(1);
  });

  it('no quick chat in a one-player room, and none outside a round', () => {
    const { room, log } = mkRoom(1);
    send(room, 'p1', { type: 'quick', id: 'nice' }, 1);
    send(room, 'p1', { type: 'quick', id: 'claim' }, 5);
    expect(evs(log, 'ping')).toHaveLength(0);
    expect(room.orders.every((o) => o.claimedBy === null)).toBe(true);
    const lobby = new GameRoom({ code: 'L', send: () => {}, broadcast: (m) => log.push({ to: '*', msg: m }) });
    lobby.addPlayer('a', 'a');
    lobby.addPlayer('b', 'b');
    lobby.handle('a', { type: 'quick', id: 'nice' }, 1);
    expect(evs(log, 'ping')).toHaveLength(0);
  });

  it('claim: marks the nearest waiting order with claimedBy / claimUntil', () => {
    const { room, log } = mkRoom(2);
    const target = waiting(room)[1]!;
    nearRestaurant(room, 'p1', target.id, 0);
    send(room, 'p1', { type: 'quick', id: 'claim' }, 2);
    const claimed = room.orders.filter((o) => o.claimedBy);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.claimedBy).toBe('p1');
    expect(claimed[0]!.claimUntil).toBeCloseTo(2 + QUICK.CLAIM_TTL, 6);
    // the nearest one is a waiting order at (or at least as close as any other to) that restaurant
    const d = restaurantOf(room.map!, target).door;
    const dist = (o: typeof target) => { const r = restaurantOf(room.map!, o).door; return (r.x - d.x) ** 2 + (r.z - d.z) ** 2; };
    expect(dist(claimed[0]!)).toBe(Math.min(...waiting(room).map(dist)));
    expect(evs(log, 'ping').at(-1)!.msg.orderId).toBe(claimed[0]!.id);
    // the order list message carries it to everybody
    const lastOrders = [...log].reverse().find((l) => l.msg.type === 'orders')!.msg as Extract<ServerMsg, { type: 'orders' }>;
    expect(lastOrders.list.find((o) => o.id === claimed[0]!.id)!.claimedBy).toBe('p1');
  });

  it('claim: a tapped order card wins over "nearest"', () => {
    const { room } = mkRoom(2);
    const [a, b] = waiting(room);
    nearRestaurant(room, 'p1', a!.id, 0);
    send(room, 'p1', { type: 'quick', id: 'claim', orderId: b!.id }, 2);
    expect(b!.claimedBy).toBe('p1');
    expect(a!.claimedBy).toBeNull();
  });

  it('claim expires after 15 s', () => {
    const { room } = mkRoom(2);
    send(room, 'p1', { type: 'quick', id: 'claim' }, 2);
    const o = room.orders.find((x) => x.claimedBy)!;
    room.tick(2 + QUICK.CLAIM_TTL - 0.5);
    expect(o.claimedBy).toBe('p1');
    room.tick(2 + QUICK.CLAIM_TTL + 0.1);
    expect(o.claimedBy).toBeNull();
    expect(o.claimUntil).toBeNull();
  });

  it('claim is cleared when the order is picked up, and never blocks a teammate from taking it', () => {
    const { room, log } = mkRoom(2);
    send(room, 'p1', { type: 'quick', id: 'claim' }, 2);
    const o = room.orders.find((x) => x.claimedBy === 'p1')!;
    // p2 (not the claimer) takes the claimed order
    nearRestaurant(room, 'p2', o.id, 3);
    send(room, 'p2', { type: 'pickup', orderId: o.id }, 3.1);
    expect(o.status).toBe('carrying');
    expect(o.carrierId).toBe('p2');
    expect(o.claimedBy).toBeNull();
    expect(o.claimUntil).toBeNull();
    expect(evs(log, 'pickup').some((e) => e.msg.orderId === o.id && e.msg.playerId === 'p2')).toBe(true);
  });

  it('claim: a live claim is not overwritten by another rider; a rider keeps one claim; carrying riders cannot claim', () => {
    const { room } = mkRoom(3);
    send(room, 'p1', { type: 'quick', id: 'claim' }, 2);
    const first = room.orders.find((o) => o.claimedBy === 'p1')!;
    // p2 stands at the same restaurant and asks for "the nearest": gets a different order, never p1's
    nearRestaurant(room, 'p2', first.id, 2);
    send(room, 'p2', { type: 'quick', id: 'claim' }, 2.5);
    expect(first.claimedBy).toBe('p1');
    const second = room.orders.find((o) => o.claimedBy === 'p2');
    expect(second).toBeDefined();
    expect(second!.id).not.toBe(first.id);
    // explicit tap on someone else's live claim: ignored
    send(room, 'p2', { type: 'quick', id: 'claim', orderId: first.id }, 5);
    expect(first.claimedBy).toBe('p1');
    // p1 claims again after the cooldown: the old claim moves
    const spare = waiting(room).find((o) => !o.claimedBy)!;
    send(room, 'p1', { type: 'quick', id: 'claim', orderId: spare.id }, 6);
    expect(first.claimedBy).toBeNull();
    expect(spare.claimedBy).toBe('p1');
    // carrying: no claim
    send(room, 'p3', { type: 'debugGive' }, 7);
    expect(room.players.get('p3')!.carrying).not.toBeNull();
    const before = room.orders.filter((o) => o.claimedBy).length;
    send(room, 'p3', { type: 'quick', id: 'claim' }, 8);
    expect(room.orders.filter((o) => o.claimedBy).length).toBe(before);
  });

  it('a leaving rider takes their claim with them', () => {
    const { room } = mkRoom(2);
    send(room, 'p2', { type: 'quick', id: 'claim' }, 2);
    expect(room.orders.some((o) => o.claimedBy === 'p2')).toBe(true);
    room.removePlayer('p2', 3);
    expect(room.orders.some((o) => o.claimedBy)).toBe(false);
  });
});

describe('crash: automatic SOS + salvage zone', () => {
  function crashWithOrder(room: GameRoom, id: string, x: number, z: number, now: number) {
    send(room, id, { type: 'debugGive' }, now);
    at(room, id, x, z, 6, now);
    send(room, id, { type: 'stat', key: 'crashes', delta: 1 }, now + 0.05);
  }

  it('sends 🆘 to the teammates only, and not in single player', () => {
    const { room, log } = mkRoom(2);
    at(room, 'p1', 10, 10, 5, 1);
    send(room, 'p1', { type: 'stat', key: 'crashes', delta: 1 }, 1.1);
    const help = evs(log, 'ping').filter((e) => e.msg.pingId === 'help');
    expect(help).toHaveLength(1);
    expect(help[0]!.except).toBe('p1');
    expect(help[0]!.msg.playerId).toBe('p1');
    // the automatic SOS is not "chatter"
    expect(room.players.get('p1')!.stats.pings).toBe(0);

    const solo = mkRoom(1);
    at(solo.room, 'p1', 10, 10, 5, 1);
    send(solo.room, 'p1', { type: 'stat', key: 'crashes', delta: 1 }, 1.1);
    expect(evs(solo.log, 'ping')).toHaveLength(0);
  });

  it('opens a salvage zone at the crash position for a rider carrying an order, valid for 20 s, broadcast to all', () => {
    const { room, log } = mkRoom(2);
    crashWithOrder(room, 'p1', 40, -12, 1);
    expect(room.salvage).toHaveLength(1);
    const z = room.salvage[0]!;
    expect(z).toMatchObject({ ownerId: 'p1', x: 40, z: -12 });
    expect(z.expiresAt).toBeCloseTo(1.05 + SALVAGE.TTL, 6);
    expect(['soup', 'pizza', 'ice']).toContain(z.food);
    const msg = [...log].reverse().find((l) => l.msg.type === 'salvage')!;
    expect(msg.to).toBe('*');
    const list = (msg.msg as Extract<ServerMsg, { type: 'salvage' }>).list;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: z.id, ownerId: 'p1', x: 40, z: -12 });
    expect('createdAt' in list[0]!).toBe(false);
  });

  it('no zone when empty-handed, in single player, or when a second crash happens while the first zone is open', () => {
    const a = mkRoom(2);
    at(a.room, 'p1', 5, 5, 6, 1);
    send(a.room, 'p1', { type: 'stat', key: 'crashes', delta: 1 }, 1.1);
    expect(a.room.salvage).toHaveLength(0);

    const solo = mkRoom(1);
    crashWithOrder(solo.room, 'p1', 5, 5, 1);
    expect(solo.room.salvage).toHaveLength(0);
    expect(solo.log.some((l) => l.msg.type === 'salvage')).toBe(false);

    const b = mkRoom(2);
    crashWithOrder(b.room, 'p1', 5, 5, 1);
    send(b.room, 'p1', { type: 'stat', key: 'crashes', delta: 1 }, 5);
    expect(b.room.salvage).toHaveLength(1);
  });

  it('a teammate who stops in the zone adds SALVAGE_TIP to the team once, and gets credit', () => {
    const { room, log } = mkRoom(2);
    crashWithOrder(room, 'p1', 40, -12, 1);
    const zid = room.salvage[0]!.id;
    const tips0 = room.teamTips;
    at(room, 'p2', 42, -10, 1, 3);
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 3.1);
    expect(room.teamTips).toBe(tips0 + SALVAGE_TIP);
    expect(SALVAGE_TIP).toBe(6);
    expect(room.players.get('p2')!.stats.salvages).toBe(1);
    expect(room.players.get('p1')!.stats.salvages).toBe(0);
    expect(room.salvage).toHaveLength(0);
    const ev = evs(log, 'salvage');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.msg).toMatchObject({ zoneId: zid, playerId: 'p2', ownerId: 'p1', tip: 6, teamTips: tips0 + 6 });
    // the order list carries the new team total; the salvage list is empty again
    const lastOrders = [...log].reverse().find((l) => l.msg.type === 'orders')!.msg as Extract<ServerMsg, { type: 'orders' }>;
    expect(lastOrders.teamTips).toBe(tips0 + 6);
    expect(([...log].reverse().find((l) => l.msg.type === 'salvage')!.msg as Extract<ServerMsg, { type: 'salvage' }>).list).toHaveLength(0);
    // tip added once: repeating (or a third rider) does nothing
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 3.5);
    expect(room.teamTips).toBe(tips0 + 6);
    expect(room.players.get('p2')!.stats.salvages).toBe(1);
  });

  it('the crasher cannot salvage their own zone', () => {
    const { room } = mkRoom(2);
    crashWithOrder(room, 'p1', 40, -12, 1);
    const zid = room.salvage[0]!.id;
    const tips0 = room.teamTips;
    at(room, 'p1', 40, -12, 0, 3);
    send(room, 'p1', { type: 'salvage', zoneId: zid }, 3.1);
    expect(room.teamTips).toBe(tips0);
    expect(room.salvage).toHaveLength(1);
    expect(room.players.get('p1')!.stats.salvages).toBe(0);
  });

  it('the server checks position, speed and the rescuer not being crashed', () => {
    const { room } = mkRoom(2);
    crashWithOrder(room, 'p1', 40, -12, 1);
    const zid = room.salvage[0]!.id;
    const R = ZONE.RADIUS + ZONE.SERVER_POS_TOLERANCE;
    at(room, 'p2', 40 + R + 3, -12, 0, 3);
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 3.1);
    expect(room.salvage).toHaveLength(1); // too far
    at(room, 'p2', 41, -12, ZONE.MAX_SPEED + ZONE.SERVER_SPEED_TOLERANCE + 2, 3.2);
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 3.3);
    expect(room.salvage).toHaveLength(1); // too fast
    at(room, 'p2', 41, -12, 0, 3.4, true);
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 3.5);
    expect(room.salvage).toHaveLength(1); // crashed
    send(room, 'p2', { type: 'salvage', zoneId: 'nope' }, 3.6);
    expect(room.salvage).toHaveLength(1); // unknown zone
    at(room, 'p2', 41, -12, 1, 3.7);
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 3.8);
    expect(room.salvage).toHaveLength(0); // finally fine
  });

  it('a zone expires after 20 s (and can no longer be collected)', () => {
    const { room, log } = mkRoom(2);
    crashWithOrder(room, 'p1', 40, -12, 1);
    const zid = room.salvage[0]!.id;
    room.tick(1.05 + SALVAGE.TTL - 0.5);
    expect(room.salvage).toHaveLength(1);
    room.tick(1.05 + SALVAGE.TTL + 0.1);
    expect(room.salvage).toHaveLength(0);
    expect(([...log].reverse().find((l) => l.msg.type === 'salvage')!.msg as Extract<ServerMsg, { type: 'salvage' }>).list).toHaveLength(0);
    const tips0 = room.teamTips;
    at(room, 'p2', 40, -12, 0, 22);
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 22.1);
    expect(room.teamTips).toBe(tips0);
  });

  it('the salvage claim message is rate limited', () => {
    const { room } = mkRoom(2);
    crashWithOrder(room, 'p1', 40, -12, 1);
    const zid = room.salvage[0]!.id;
    at(room, 'p2', 1000, 1000, 0, 2); // far away: every claim is rejected, but must be cheap
    for (let i = 0; i < 100; i++) send(room, 'p2', { type: 'salvage', zoneId: zid }, 2 + i * 0.0001);
    at(room, 'p2', 40, -12, 0, 2.01);
    send(room, 'p2', { type: 'salvage', zoneId: zid }, 2.011);
    expect(room.salvage).toHaveLength(1); // the bucket was already empty
  });

  it('zones are cleared when the round ends', () => {
    const { room, log } = mkRoom(2);
    crashWithOrder(room, 'p1', 40, -12, 1);
    room.tick(121);
    expect(room.phase).toBe('results');
    expect(room.salvage).toHaveLength(0);
    expect(([...log].reverse().find((l) => l.msg.type === 'salvage')!.msg as Extract<ServerMsg, { type: 'salvage' }>).list).toHaveLength(0);
  });
});

describe('awards 救汤侠 / 话痨骑手', () => {
  const P = (id: string, patch: Partial<ReturnType<typeof emptyStats>>) => ({ id, name: id, stats: { ...emptyStats(), ...patch } });
  it('救汤侠: most salvages, at least 1', () => {
    const a = pickAwards([P('a', { salvages: 1 }), P('b', { salvages: 3 })], 10).find((x) => x.id === 'salvage')!;
    expect(a).toMatchObject({ id: 'salvage', icon: '🦸', playerId: 'b', value: 3 });
    expect(pickAwards([P('a', {}), P('b', {})], 10).some((x) => x.id === 'salvage')).toBe(false);
  });
  it('话痨骑手: most quick chats, at least 5', () => {
    const a = pickAwards([P('a', { pings: 4 }), P('b', { pings: 9 }), P('c', { pings: 7 })], 10).find((x) => x.id === 'chat')!;
    expect(a).toMatchObject({ id: 'chat', icon: '💬', playerId: 'b', value: 9 });
    expect(pickAwards([P('a', { pings: 4 })], 10).some((x) => x.id === 'chat')).toBe(false);
  });
  it('both are among the first awards when only a few can be shown', () => {
    const awards = pickAwards([P('a', { tips: 30, deliveries: 1, integritySum: 1, crashes: 2, salvages: 2, pings: 8, soupSpilled: 2, honks: 5, maxAirTime: 2 })], 4);
    expect(awards.map((x) => x.id)).toEqual(['tips', 'salvage', 'crash', 'chat']);
  });
  it('a full round: the rescuer gets the award in the results message', () => {
    const { room, log } = mkRoom(2);
    send(room, 'p1', { type: 'debugGive' }, 1);
    at(room, 'p1', 40, -12, 6, 1);
    send(room, 'p1', { type: 'stat', key: 'crashes', delta: 1 }, 1.1);
    at(room, 'p2', 41, -12, 0, 3);
    send(room, 'p2', { type: 'salvage', zoneId: room.salvage[0]!.id }, 3.1);
    room.tick(121);
    const res = log.find((l) => l.msg.type === 'results')!.msg as Extract<ServerMsg, { type: 'results' }>;
    expect(res.awards.find((a) => a.id === 'salvage')).toMatchObject({ playerId: 'p2', value: 1 });
    expect(res.players.find((p) => p.id === 'p2')!.stats.salvages).toBe(1);
  });
});

describe('round summary line (anonymous)', () => {
  it('is emitted once per round with the agreed fields and no names, ids or addresses', () => {
    const lines: RoundSummary[] = [];
    const { room } = mkRoom(2, (s) => lines.push(s));
    room.handle('p1', { type: 'caps', touch: true, autoGas: true }, 0);
    room.handle('p2', { type: 'caps', touch: false, autoGas: false }, 0);
    send(room, 'p1', { type: 'quick', id: 'claim' }, 2);
    send(room, 'p1', { type: 'quick', id: 'nice' }, 5);
    send(room, 'p2', { type: 'quick', id: 'nice' }, 5);
    send(room, 'p1', { type: 'debugGive' }, 6);
    at(room, 'p1', 40, -12, 6, 6);
    send(room, 'p1', { type: 'stat', key: 'crashes', delta: 1 }, 6.1);
    at(room, 'p2', 41, -12, 0, 8);
    send(room, 'p2', { type: 'salvage', zoneId: room.salvage[0]!.id }, 8.1);
    room.tick(121);
    room.tick(122); // a finished round does not report twice
    expect(lines).toHaveLength(1);
    const s = lines[0]!;
    expect(s).toMatchObject({ v: GAME_VERSION, evt: 'round', players: 2, touchPlayers: 1, autoGasPlayers: 1, durationS: 120, deliveries: 0, crashes: 1, avgIntegrity: 0, teamTips: SALVAGE_TIP, stars: 0, salvages: 1, claims: 1 });
    expect(s.pings).toEqual({ claim: 1, help: 0, wait: 0, follow: 0, thanks: 0, nice: 2 });
    expect(Object.keys(s).sort()).toEqual(
      ['autoGasPlayers', 'avgIntegrity', 'claims', 'crashes', 'deliveries', 'durationS', 'evt', 'pings', 'players', 'salvages', 'stars', 'teamTips', 'touchPlayers', 'v'].sort(),
    );
  });

  it('the log line is one line of JSON that contains none of the players\' names or ids', () => {
    const lines: string[] = [];
    const log: ServerMsg[] = [];
    const room = new GameRoom({ code: 'ZZZZ', send: () => {}, broadcast: (m) => log.push(m), allowStartOverrides: true, onRoundEnd: (s) => lines.push(formatRoundSummary(s)) });
    room.addPlayer('p1', 'SecretAlice');
    room.addPlayer('p2', '张三丰');
    room.start(0, 3, 30);
    room.tick(31);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).not.toMatch(/\n/);
    expect(() => JSON.parse(line)).not.toThrow();
    for (const bad of ['SecretAlice', '张三丰', 'p1', 'p2', 'ZZZZ']) expect(line).not.toContain(bad);
    expect(line).not.toMatch(/"(name|names|ip|id|ids|addr|address|host|room|code)"/);
    expect(JSON.parse(line).durationS).toBe(30);
  });

  it('a failing sink cannot break the round', () => {
    const { room } = mkRoom(2, () => {
      throw new Error('disk full');
    });
    expect(() => room.tick(121)).not.toThrow();
    expect(room.phase).toBe('results');
  });

  it('single player (no sink) simply does not report', () => {
    const { room } = mkRoom(1);
    expect(() => room.tick(121)).not.toThrow();
  });
});
