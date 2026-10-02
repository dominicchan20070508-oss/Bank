// The browser WsTransport run against the real server (Node 22 has a global WebSocket).
import os from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WsTransport } from '../src/client/net/wsTransport';
import { startServer, type RunningServer } from '../server/app';
import type { ServerMsg } from '../src/shared/protocol';

let server: RunningServer;
const url = () => `ws://127.0.0.1:${server.port}/ws`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const perf = () => performance.now() / 1000;

beforeAll(async () => {
  server = await startServer({ port: 0, host: '127.0.0.1', distDir: os.tmpdir(), debug: true });
});
afterAll(async () => {
  await server.close();
});

function collect(t: WsTransport): ServerMsg[] {
  const msgs: ServerMsg[] = [];
  t.onMessage((m) => msgs.push(m));
  return msgs;
}

describe('WsTransport', () => {
  it('connects, is welcomed, and two clients with very different local clocks agree on server time', async () => {
    const a = new WsTransport(url(), () => perf() + 5000); // "a" thinks it is 5000 s in the future ...
    const b = new WsTransport(url(), () => perf() - 300); // ... "b" 300 s in the past
    const ma = collect(a);
    const mb = collect(b);
    await Promise.all([a.connect('阿强'), b.connect('小美')]);
    expect(a.myId).toMatch(/^p\d+$/);
    expect(a.myId).not.toBe(b.myId);
    expect(ma[0]).toEqual({ type: 'welcome', id: a.myId });
    await sleep(500); // let the ping burst converge
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      samples.push(Math.abs(a.serverNow() - b.serverNow()));
      await sleep(40);
    }
    expect(Math.max(...samples)).toBeLessThan(0.05); // well inside the 0.2 s budget
    expect(a.syncInfo.samples).toBeGreaterThan(2);
    // and it really is the server's clock, not just mutual agreement: it advances at real speed
    const t0 = a.serverNow();
    await sleep(300);
    expect(a.serverNow() - t0).toBeGreaterThan(0.28);
    expect(a.serverNow() - t0).toBeLessThan(0.45);

    // a room round trip through the transport interface
    a.send({ type: 'createRoom' });
    await sleep(150);
    const room = ma.find((m) => m.type === 'room') as Extract<ServerMsg, { type: 'room' }>;
    expect(room.players).toHaveLength(1);
    b.send({ type: 'joinRoom', code: room.code });
    await sleep(200);
    expect(mb.some((m) => m.type === 'room' && m.players.length === 2)).toBe(true);
    a.close();
    b.close();
  });

  it('reports an unexpected drop through onClose, but stays quiet after close()', async () => {
    const polite = new WsTransport(url());
    let politeFired = false;
    polite.onClose(() => (politeFired = true));
    await polite.connect('y');
    polite.close();
    await sleep(150);
    expect(politeFired).toBe(false);

    const other = await startServer({ port: 0, host: '127.0.0.1', distDir: os.tmpdir() });
    const victim = new WsTransport(`ws://127.0.0.1:${other.port}/ws`);
    let victimReason = '';
    victim.onClose((r) => (victimReason = r));
    await victim.connect('z');
    await other.close(); // the server goes away
    await sleep(300);
    expect(victimReason).toBe('closed');
    // sending on a dead connection is a silent no-op (no exception, no spam)
    expect(() => victim.send({ type: 'honk' })).not.toThrow();
  });

  it('rejects when nothing is listening', async () => {
    const t = new WsTransport('ws://127.0.0.1:1/ws');
    await expect(t.connect('nobody')).rejects.toThrow();
  });
});
