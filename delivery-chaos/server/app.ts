// HTTP (static client) + WebSocket (/ws) server. `startServer` is used by index.ts and by the integration tests.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { GAME_VERSION } from '../src/shared/constants';
import { RoomManager, type Conn } from './rooms';
import { createStaticHandler } from './static';

export interface ServerOptions {
  port: number;
  host?: string;
  distDir: string;
  /** DC_DEBUG=1: debugGive + host seed/duration overrides */
  debug?: boolean;
  log?: (line: string) => void;
  /** receives the one-line anonymous JSON summary of every finished online round (DESIGN §14.4); default: dropped */
  roundLog?: (line: string) => void;
  /** room tick interval (ms) */
  tickMs?: number;
  maxConnections?: number;
}

export interface RunningServer {
  port: number;
  manager: RoomManager;
  close(): Promise<void>;
}

export const MAX_MESSAGE_BYTES = 4096;

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.log ?? (() => {});
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  const manager = new RoomManager({ debug: !!opts.debug, now, log, roundLog: opts.roundLog });
  const maxConnections = opts.maxConnections ?? 500;

  const serveStatic = createStaticHandler(opts.distDir);
  const server = http.createServer((req, res) => {
    // wake-up probe (DESIGN §14.1): the page pings this on load so a sleeping free-tier host starts booting at once
    if (req.url === '/healthz' || req.url?.startsWith('/healthz?')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      const body = JSON.stringify({ ok: true, v: GAME_VERSION });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    const conn: Conn = {
      send: (msg) => {
        // a slow consumer must not make the server buffer forever: drop the update (snapshots are superseded anyway)
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > 1_000_000 && msg.type === 'snap') return;
        ws.send(JSON.stringify(msg));
      },
      close: () => ws.close(),
    };
    const session = manager.connect(conn);
    ws.on('message', (data, isBinary) => {
      alive.set(ws, true);
      if (isBinary) return;
      session.receive(typeof data === 'string' ? data : Array.isArray(data) ? Buffer.concat(data).toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8'));
    });
    ws.on('pong', () => alive.set(ws, true));
    ws.on('error', (err) => log(`socket error: ${String(err)}`));
    ws.on('close', () => session.disconnect());
  });

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    let pathname = '';
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      /* bad URL */
    }
    if (pathname !== '/ws' || wss.clients.size >= maxConnections) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  // game clock: every room ticks at 20 Hz (snapshots are batched inside GameRoom.tick)
  const ticker = setInterval(() => manager.tick(), opts.tickMs ?? 50);
  // dead-socket detection: ping every 10 s, drop whoever did not answer the previous ping
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      try {
        ws.ping();
      } catch {
        /* closing */
      }
    }
  }, 10_000);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      server.off('error', reject);
      resolve({
        port: (server.address() as AddressInfo).port,
        manager,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(ticker);
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            server.close(() => done());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}
