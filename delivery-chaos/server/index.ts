// Single-port server: serves the built client (dist/) over HTTP and hosts the /ws endpoint.
//
//   npm run build && npm start        -> http://localhost:8080   (PORT env overrides)
//   npm run dev                       -> Vite on 5173 proxies /ws to this server
//
// PHASE A: only static hosting is implemented. The WebSocket endpoint exists so the Vite proxy and clients have
// something to talk to, but it just tells the client that online play is not available yet.
//
// PHASE B (multiplayer) plugs in at the marked spot below: keep a Map<code, GameRoom> (src/shared/rules.ts), map each
// socket to (room, playerId), translate socket JSON <-> ClientMsg / ServerMsg, and call room.tick(now) on an interval.
// GameRoom is transport-agnostic, so it needs no changes.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.join(DIST, path.normalize(pathname));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('dist/ not found - run `npm run build` first.');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      }
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const headers: Record<string, string | number> = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(serveStatic);

// ---------------------------------------------------------------------------------------------------------------
// PHASE B: room management goes here (see the header comment). Placeholder: refuse politely.
// ---------------------------------------------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'error', msg: '联机功能即将上线' }));
  ws.close();
});

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  else socket.destroy();
});

server.listen(PORT, () => {
  console.log(`Delivery Chaos server: http://localhost:${PORT}  (serving ${DIST})`);
});

function shutdown(): void {
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
