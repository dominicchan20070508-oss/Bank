// Delivery Chaos server entry: `npm run build && npm start`  ->  http://localhost:8080  (PORT env overrides)
//
//   DC_DEBUG=1 npm start     enables the QA hooks online (debugGive, host-chosen seed / duration). Never use it for real games.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app';

const PORT = Number(process.env.PORT ?? 8080);
const DEBUG = process.env.DC_DEBUG === '1';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** every non-internal IPv4 address: what friends on the same Wi-Fi / LAN should open */
export function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
    }
  }
  return out;
}

const running = await startServer({ port: PORT, host: '0.0.0.0', distDir: DIST, debug: DEBUG, log: (l) => console.log(`[server] ${l}`) });

console.log('');
console.log('  外卖大乱送 Delivery Chaos 已启动 / server is up');
console.log('');
console.log(`  本机打开 / this computer:   http://localhost:${running.port}`);
const urls = lanUrls(running.port);
if (urls.length) {
  console.log('  同一 Wi-Fi 的朋友打开 / friends on your LAN:');
  for (const u of urls) console.log(`                              ${u}`);
} else {
  console.log('  (没有检测到局域网地址 / no LAN address found)');
}
if (DEBUG) console.log('\n  !! DC_DEBUG=1: 调试钩子已开启 (debugGive / 房主自定义时长) — 仅供测试 !!');
console.log('');

function shutdown(): void {
  void running.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
