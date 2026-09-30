// PM acceptance script — Phase A (solo). Usage: node qa-solo.mjs [baseUrl] [outDir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = process.argv[3] || '.';
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const st = () => page.evaluate(() => window.__game.getState());
const dbg = (fn, ...args) => page.evaluate(([fn, args]) => window.__game.debug[fn](...args), [fn, args]);

try {
  // --- menu renders
  await page.goto(`${BASE}/?nosfx`);
  await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
  check('menu phase on plain load', (await st()).phase === 'menu');
  await page.screenshot({ path: `${OUT}/qa-menu.png` });

  // --- solo autostart
  await page.goto(`${BASE}/?solo&seed=1&autostart&nosfx&debug&duration=45`);
  await page.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
  let s = await st();
  check('solo autostart → playing', s.phase === 'playing');
  check('orders spawned = players+2', s.orders.filter((o) => o.status === 'waiting').length === 3, `waiting=${s.orders.filter((o) => o.status === 'waiting').length}`);
  const t0 = s.timeLeft; await sleep(1500); s = await st();
  check('timer counts down', s.timeLeft < t0, `${t0.toFixed?.(1)} → ${s.timeLeft.toFixed?.(1)}`);

  // --- driving
  const p0 = s.bike.pos;
  await dbg('setInput', { throttle: 1, steer: 0 });
  await sleep(2500);
  s = await st();
  const moved = Math.hypot(s.bike.pos[0] - p0[0], s.bike.pos[2] - p0[2]);
  check('throttle → moves', s.bike.speed > 3 && moved > 3, `speed=${s.bike.speed.toFixed(1)} moved=${moved.toFixed(1)}m`);
  await page.screenshot({ path: `${OUT}/qa-driving.png` });

  // --- steering changes heading and produces lean
  const h0 = s.bike.heading;
  let maxLean = 0;
  await dbg('setInput', { throttle: 0.6, steer: 1 });
  for (let i = 0; i < 10; i++) { await sleep(100); maxLean = Math.max(maxLean, Math.abs((await st()).bike.lean)); }
  s = await st();
  check('steer → heading changes', Math.abs(s.bike.heading - h0) > 0.2, `Δh=${(s.bike.heading - h0).toFixed(2)}`);
  check('steer → lean', maxLean > 0.05, `maxLean=${maxLean.toFixed(2)}`);
  await dbg('setInput', { throttle: 0, brake: 1, steer: 0 });
  let minSpeed = 99;
  for (let i = 0; i < 20; i++) { await sleep(75); minSpeed = Math.min(minSpeed, Math.abs((await st()).bike.speed)); }
  check('brake → stops (then reverses, by design)', minSpeed < 1.5, `min speed=${minSpeed.toFixed(2)}`);
  await dbg('setInput', { throttle: 0, brake: 0, steer: 0 });
  await sleep(1500);
  s = await st();
  check('stationary + feet down → no crash', !s.bike.crashed, `lean=${s.bike.lean.toFixed(2)}`);
  await dbg('setInput', null);

  // --- forced crash & recovery
  await dbg('forceCrash');
  await sleep(200);
  check('forceCrash → crashed', (await st()).bike.crashed === true);
  await page.screenshot({ path: `${OUT}/qa-crash.png` });
  await sleep(2500);
  check('recovers after crash', (await st()).bike.crashed === false);

  // --- delivery flow for each food kind
  s = await st();
  const kinds = new Set();
  for (let round = 0; round < 6 && kinds.size < 3; round++) {
    s = await st();
    const order = s.orders.find((o) => o.status === 'waiting' && !kinds.has(o.food)) || s.orders.find((o) => o.status === 'waiting');
    if (!order) { await sleep(3500); continue; }
    const tipsBefore = s.teamTips;
    await dbg('giveOrder', order.id);
    await sleep(300);
    s = await st();
    const cargoOk = s.cargo && s.cargo.kind;
    // go to the right door (backDoor request uses the back door point); let the game tell us via location()
    const custId = order.customerId;
    let loc;
    try { loc = await dbg('location', order.request === 'backDoor' ? `${custId}b` : custId); } catch { loc = null; }
    if (!loc) { try { loc = await dbg('location', custId); } catch { loc = null; } }
    if (!loc) { check(`location() for ${custId}`, false); break; }
    await dbg('teleport', loc[0], loc[1]);
    await dbg('setInput', { throttle: 0, brake: 0, steer: 0 });
    let delivered = false;
    for (let i = 0; i < 40; i++) { await sleep(150); s = await st(); if (!s.cargo && s.teamTips >= tipsBefore && !s.orders.find((o) => o.id === order.id && o.status === 'carrying')) { delivered = true; break; } }
    await dbg('setInput', null);
    kinds.add(order.food);
    check(`deliver ${order.food}${order.request ? ' [' + order.request + ']' : ''}`, !!cargoOk && delivered, `tips ${tipsBefore} → ${s.teamTips}`);
    if (kinds.size === 1) await page.screenshot({ path: `${OUT}/qa-delivered.png` });
    await sleep(800);
  }
  check('all 3 food kinds seen', kinds.size === 3, [...kinds].join(','));

  // --- fps
  s = await st();
  check('fps reported (swiftshader, informational)', typeof s.fps === 'number', `fps=${s.fps}`);

  // --- results screen at end of round
  await page.waitForFunction(() => window.__game.getState().phase === 'results', null, { timeout: 60000 });
  check('round ends → results', true);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/qa-results.png` });
} catch (e) {
  check('script ran without exception', false, e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}/qa-failure.png` }).catch(() => {});
}

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
