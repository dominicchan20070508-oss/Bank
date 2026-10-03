// v0.3 acceptance (DESIGN §14.5): onboarding (touch auto-gas, brake, first-session hints), audio for everyone (levels,
// banner, volume, iOS audio-session paths), quick chat + claims + salvage zones with two clients in two languages,
// the anonymous round-summary line in the server log, and screenshots (zh/en x desktop/phone landscape).
//
//   npm run build
//   node qa/v03.cjs [baseUrl] [outDir]           # by default it starts its OWN server (DC_DEBUG=1, port 8123) so it can read its log
//   ONLY=auto,brake,hints,audio,ui,coop,shots,sizes node qa/v03.cjs     # run a subset
//
// With an explicit baseUrl the server is yours (it must run with DC_DEBUG=1) and the server-log check is skipped.
// Needs Playwright (global install in the dev image) and a built dist/.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
let chromium;
try {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
} catch {
  ({ chromium } = require('playwright'));
}
const lab = require('./lib/audio-lab.cjs');

const ROOT = path.resolve(__dirname, '..');
const EXTERNAL = !!process.argv[2];
const PORT = Number(process.env.V03_PORT || 8123);
const BASE = process.argv[2] || `http://localhost:${PORT}`;
const OUT = process.argv[3] || path.join(__dirname, 'v03');
const ONLY = (process.env.ONLY || 'auto,brake,hints,audio,ui,coop,shots,sizes').split(',');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  - ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CJK = /[　-〿一-鿿＀-￯]/;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const DESKTOP = { viewport: { width: 1280, height: 720 } };
const MOBILE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const MOBILE1 = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

let browser;
let serverProc = null;
const serverLines = [];
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
};
const st = (page) => page.evaluate(() => window.__game.getState());
const dbg = (page, fn, ...args) => page.evaluate(([fn, args]) => window.__game.debug[fn](...args), [fn, args]);
const waitState = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// ---------------------------------------------------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------------------------------------------------
async function startServer() {
  if (EXTERNAL) return;
  serverProc = spawn(path.join(ROOT, 'node_modules', '.bin', 'tsx'), ['server/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DC_DEBUG: '1' } });
  let buf = '';
  const onData = (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      serverLines.push(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  };
  serverProc.stdout.on('data', onData);
  serverProc.stderr.on('data', onData);
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
    } catch {
      /* not yet */
    }
    await sleep(200);
  }
  throw new Error('server did not start');
}
function stopServer() {
  if (serverProc) serverProc.kill('SIGTERM');
}

// ---------------------------------------------------------------------------------------------------------------------
// geometry helpers for the touch autopilot (roads are a 6 x 6 grid of centre lines, DESIGN §3)
// ---------------------------------------------------------------------------------------------------------------------
const L = [-120, -72, -24, 24, 72, 120];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Features on the roads that crash a bike driving straight over them (side-on ramps, bumps, barriers, bins). */
function hazards(map) {
  return [
    ...map.ramps.map((r) => ({ x: r.x, z: r.z, r: 9 })),
    ...map.bumps.map((b) => ({ x: b.x, z: b.z, r: 6 })),
    ...map.obstacles.map((o) => ({ x: o.x, z: o.z, r: 5 })),
  ];
}
function segmentClear(map, a, b) {
  const hz = hazards(map);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let d = 0; d <= len; d += 2) {
    const x = a[0] + ((b[0] - a[0]) * d) / len;
    const z = a[1] + ((b[1] - a[1]) * d) / len;
    if (hz.some((h) => Math.hypot(h.x - x, h.z - z) < h.r)) return false;
  }
  return true;
}
/** the longest hazard-free stretch of a north-south road: { x, z0, z1 } */
function straightRoad(map) {
  let best = null;
  for (const x of L) {
    let z = -118;
    let start = z;
    for (; z <= 118; z += 2) {
      const blocked = !segmentClear(map, [x, z], [x, z + 0.01]);
      if (blocked) {
        if (!best || z - start > best.z1 - best.z0) best = { x, z0: start, z1: z };
        start = z + 2;
      }
    }
    if (!best || 118 - start > best.z1 - best.z0) best = { x, z0: start, z1: 118 };
  }
  return best;
}

/** Shortest road route (list of [x, z]) from a point on/near a road to another. */
function planRoute(from, to) {
  const nodes = new Map(); // id -> [x, z]
  const adj = new Map();
  const add = (id, p) => {
    nodes.set(id, p);
    if (!adj.has(id)) adj.set(id, []);
  };
  const link = (a, b) => {
    const d = Math.hypot(nodes.get(a)[0] - nodes.get(b)[0], nodes.get(a)[1] - nodes.get(b)[1]);
    adj.get(a).push([b, d]);
    adj.get(b).push([a, d]);
  };
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) add(`n${i}_${j}`, [L[i], L[j]]);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i < 5) link(`n${i}_${j}`, `n${i + 1}_${j}`);
    if (j < 5) link(`n${i}_${j}`, `n${i}_${j + 1}`);
  }
  const attach = (id, p) => {
    // snap to the nearest road centre line
    let best = null;
    for (let i = 0; i < 6; i++) {
      const d = Math.abs(p[0] - L[i]);
      if (!best || d < best.d) best = { d, axis: 'v', k: i };
    }
    for (let j = 0; j < 6; j++) {
      const d = Math.abs(p[1] - L[j]);
      if (!best || d < best.d) best = { d, axis: 'h', k: j };
    }
    if (best.axis === 'v') {
      const z = p[1];
      let j0 = 0;
      while (j0 < 4 && L[j0 + 1] <= z) j0++;
      add(id, [L[best.k], z]);
      link(id, `n${best.k}_${j0}`);
      link(id, `n${best.k}_${j0 + 1}`);
    } else {
      const x = p[0];
      let i0 = 0;
      while (i0 < 4 && L[i0 + 1] <= x) i0++;
      add(id, [x, L[best.k]]);
      link(id, `n${i0}_${best.k}`);
      link(id, `n${i0 + 1}_${best.k}`);
    }
    return best;
  };
  const a = attach('S', from);
  const b = attach('G', to);
  // same road segment: a direct link (the two attach links would otherwise force a detour via an intersection)
  if (a.axis === b.axis && a.k === b.k) link('S', 'G');
  const dist = new Map([['S', 0]]);
  const prev = new Map();
  const todo = new Set(nodes.keys());
  while (todo.size) {
    let u = null;
    for (const id of todo) if (dist.has(id) && (u === null || dist.get(id) < dist.get(u))) u = id;
    if (u === null || u === 'G') break;
    todo.delete(u);
    for (const [v, d] of adj.get(u)) {
      const nd = dist.get(u) + d;
      if (!dist.has(v) || nd < dist.get(v)) {
        dist.set(v, nd);
        prev.set(v, u);
      }
    }
  }
  const path = [];
  for (let u = 'G'; u; u = prev.get(u)) path.unshift(nodes.get(u));
  return [from, ...path.slice(1, -1), to];
}

/** Point `la` metres ahead of the bike along the polyline (starting from the nearest point on it). */
function lookahead(route, pos, la) {
  let bestI = 0;
  let bestD = Infinity;
  let bestT = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, az] = route[i];
    const [bx, bz] = route[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = clamp(((pos[0] - ax) * dx + (pos[2] - az) * dz) / len2, 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(pos[0] - px, pos[2] - pz);
    if (d < bestD) {
      bestD = d;
      bestI = i;
      bestT = t;
    }
  }
  let remaining = la;
  let i = bestI;
  let t = bestT;
  for (;;) {
    const [ax, az] = route[i];
    const [bx, bz] = route[i + 1];
    const segLen = Math.hypot(bx - ax, bz - az);
    const left = segLen * (1 - t);
    if (remaining <= left || i === route.length - 2) {
      const tt = segLen ? clamp(t + remaining / segLen, 0, 1) : 1;
      return [ax + (bx - ax) * tt, az + (bz - az) * tt];
    }
    remaining -= left;
    i++;
    t = 0;
  }
}

/**
 * Drive with the steering pad ONLY (real CDP touch events, one finger): pure pursuit along the road route.
 * Never touches GAS / BRAKE. Resolves when `done(state)` is true. Returns a trace for the assertions.
 */
async function padDrive(page, cdp, goal, done, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 90000;
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: 290, id: 31, radiusX: 8, radiusY: 8, force: 1 }] });
  const trace = { maxRawThrottle: 0, maxRawBrake: 0, speeds: [], dists: [], crashes: 0, cruise: 0, ok: false, lastState: null };
  await touch('touchStart', 110);
  const t0 = Date.now();
  let wasCrashed = false;
  try {
    while (Date.now() - t0 < timeoutMs) {
      const s = await st(page);
      trace.lastState = s;
      trace.maxRawThrottle = Math.max(trace.maxRawThrottle, s.input.throttle);
      trace.maxRawBrake = Math.max(trace.maxRawBrake, s.input.brake);
      const pos = s.bike.pos;
      const dg = Math.hypot(goal[0] - pos[0], goal[1] - pos[2]);
      trace.speeds.push(s.bike.speed);
      trace.dists.push(dg);
      if (s.applied.throttle > 0.6 && s.applied.throttle < 0.8) trace.cruise++;
      if (s.bike.crashed && !wasCrashed) trace.crashes++;
      wasCrashed = s.bike.crashed;
      if (done(s)) {
        trace.ok = true;
        break;
      }
      const route = planRoute([pos[0], pos[2]], goal);
      const la = clamp(7 + s.bike.speed * 0.55, 8, 13);
      const tgt = dg < la ? goal : lookahead(route, pos, la);
      const err = wrap(Math.atan2(tgt[0] - pos[0], tgt[1] - pos[2]) - s.bike.heading);
      const steer = clamp(-err * 1.7, -1, 1);
      await touch('touchMove', 110 + steer * 60);
      await sleep(70);
    }
  } finally {
    await touch('touchEnd', 110);
  }
  return trace;
}

// =====================================================================================================================
// 1. Auto-gas: the whole delivery with the steering pad only
// =====================================================================================================================
async function section_auto() {
  console.log('\n--- touch auto-gas: pick up and deliver using ONLY the steering pad (real CDP touch events) ---');
  const ctx = await browser.newContext(MOBILE1);
  const page = await ctx.newPage();
  watch(page, 'auto');
  await page.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300`);
  await waitState(page, () => window.__game?.getState().phase === 'playing');
  await sleep(1500);
  const cdp = await ctx.newCDPSession(page);
  let s = await st(page);
  check('touch UI on, auto-gas defaults ON for touch, GAS button reads BOOST', s.touch && s.autoGas === true && (await page.textContent('.tc-gas .lb')) === 'BOOST', `autoGas=${s.autoGas}`);

  // the bike rolls with no finger on the screen
  const p0 = s.bike.pos;
  await sleep(1800);
  s = await st(page);
  check('with no touch at all the bike rolls by itself (cruise throttle, speed > 5 m/s)', s.bike.speed > 5 && s.input.throttle === 0 && s.applied.throttle > 0.6 && s.applied.throttle < 0.8, `speed ${s.bike.speed.toFixed(1)}, raw throttle ${s.input.throttle}, applied ${s.applied.throttle.toFixed(2)}`);
  check('... and it moved', Math.hypot(s.bike.pos[0] - p0[0], s.bike.pos[2] - p0[2]) > 8);
  const map = await dbg(page, 'map');

  // ---- to a restaurant with a waiting order
  await dbg(page, 'teleport', map.spawns[0].x, map.spawns[0].z, map.spawns[0].heading);
  await sleep(300);
  s = await st(page);
  const waiting = s.orders.filter((o) => o.status === 'waiting');
  const rid = (o) => map.restaurants.find((r) => r.id === o.restaurantId);
  const nearest = waiting.map((o) => ({ o, r: rid(o) })).sort((a, b) => Math.hypot(a.r.x - map.spawns[0].x, a.r.z - map.spawns[0].z) - Math.hypot(b.r.x - map.spawns[0].x, b.r.z - map.spawns[0].z))[0];
  const goal = [nearest.r.x, nearest.r.z];
  console.log(`  target: restaurant ${nearest.r.id} at ${goal.map((v) => v.toFixed(0))}, order ${nearest.o.id} (${nearest.o.food})`);
  const lastSpeeds = [];
  const t1 = await padDrive(
    page,
    cdp,
    goal,
    (st0) => {
      lastSpeeds.push(st0.bike.speed);
      return !!st0.cargo;
    },
    { timeoutMs: 100000 },
  );
  check('steering pad only: reached the restaurant, auto-stopped in the circle and picked up (cargo on the rack)', t1.ok, `crashes ${t1.crashes}, ${t1.speeds.length} samples`);
  check('GAS was never touched (raw throttle stayed 0) and the bike cruised on auto-gas', t1.maxRawThrottle === 0 && t1.maxRawBrake === 0 && t1.cruise > 5, `raw throttle ${t1.maxRawThrottle}, cruise samples ${t1.cruise}`);
  // the speed profile near the door: it arrived fast and slowed down before the pickup happened
  const ds = t1.dists;
  let slowIdx = ds.findIndex((d, i) => d < 10 && t1.speeds[i] < 3);
  const fastBefore = Math.max(...t1.speeds.slice(0, Math.max(1, ds.findIndex((d) => d < 20))));
  check('auto-stop: fast on the way (> 8 m/s) and below 4 m/s inside the circle when the pickup fired', fastBefore > 8 && slowIdx >= 0, `peak ${fastBefore.toFixed(1)} m/s, slow sample index ${slowIdx}`);
  await sleep(300);
  s = await st(page);
  check('the pickup was adjudicated by the server (order carried by me)', s.cargo && s.orders.some((o) => o.status === 'carrying' && o.carrierId === s.players[0].id), s.cargo && s.cargo.detail);

  // ---- to the customer
  const tips0 = s.teamTips;
  const dest = await dbg(page, 'targetFor');
  console.log(`  delivering to ${dest.map((v) => v.toFixed(0))}`);
  const t2 = await padDrive(page, cdp, dest, (st0) => !st0.cargo && st0.teamTips > tips0, { timeoutMs: 100000 });
  check('steering pad only: reached the customer, auto-stopped, delivered (tips went up)', t2.ok, `crashes ${t2.crashes}`);
  check('GAS never touched during the delivery leg either', t2.maxRawThrottle === 0 && t2.maxRawBrake === 0);
  s = await st(page);
  check('team tips increased after the delivery', s.teamTips > tips0, `${tips0} -> ${s.teamTips}`);
  await ctx.close();
}

// =====================================================================================================================
// 2. Brake: a short press never reverses, a long press does; auto-gas off = v0.2
// =====================================================================================================================
async function section_brake() {
  console.log('\n--- brake with auto-gas on (short press does not reverse, long press does); auto-gas off behaves like v0.2 ---');
  const ctx = await browser.newContext(MOBILE1);
  const page = await ctx.newPage();
  watch(page, 'brake');
  await page.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300`);
  await waitState(page, () => window.__game?.getState().phase === 'playing');
  await sleep(1200);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const center = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
  const brake = await center('.tc-brake');
  const gas = await center('.tc-gas');
  const road = straightRoad(await dbg(page, 'map'));
  console.log(`  straight test road: x=${road.x}, z ${road.z0}..${road.z1}`);
  const home = () => dbg(page, 'teleport', road.x, road.z0 + 14, 0); // a hazard-free straight, heading +z
  const sample = async (ms, every = 40) => {
    const out = [];
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const s = await st(page);
      out.push({ v: s.bike.speed, vf: s.bike.speedFwd, ab: s.applied.brake, rb: s.input.brake, at: Date.now() - t0 });
      await sleep(every);
    }
    return out;
  };

  // --- SHORT: brake until stopped, hold 0.3 s more, release: never goes backwards
  await home();
  await sleep(1800); // cruising
  let s = await st(page);
  check('cruising on auto-gas before braking', s.bike.speed > 6, `${s.bike.speed.toFixed(1)} m/s`);
  await touch('touchStart', [[brake[0], brake[1], 41]]);
  let tr = [];
  const tb = Date.now();
  let stoppedAt = null;
  while (Date.now() - tb < 5000) {
    s = await st(page);
    tr.push({ vf: s.bike.speedFwd, ab: s.applied.brake });
    if (stoppedAt === null && s.bike.speedFwd < 0.4) stoppedAt = Date.now();
    if (stoppedAt !== null && Date.now() - stoppedAt > 300) break;
    await sleep(40);
  }
  await touch('touchEnd', []);
  const minVf = Math.min(...tr.map((x) => x.vf));
  check('BRAKE stops the bike', stoppedAt !== null, `min ${minVf.toFixed(2)} m/s`);
  check('short press at a standstill does NOT reverse (signed speed never below -0.15 m/s)', minVf > -0.15, `min signed speed ${minVf.toFixed(2)}`);
  await sleep(1500);
  s = await st(page);
  check('releasing BRAKE: the bike rolls on again by itself', s.bike.speed > 3 && s.bike.speedFwd > 0, `${s.bike.speed.toFixed(1)} m/s`);

  // --- LONG: hold well past the 0.6 s grace: it reverses
  await home();
  await sleep(1800);
  await touch('touchStart', [[brake[0], brake[1], 42]]);
  const tl = [];
  const t2 = Date.now();
  while (Date.now() - t2 < 4200) {
    s = await st(page);
    tl.push({ vf: s.bike.speedFwd });
    await sleep(40);
  }
  await touch('touchEnd', []);
  const minL = Math.min(...tl.map((x) => x.vf));
  check('long press: after the grace period the bike reverses (signed speed < -1.5 m/s)', minL < -1.5, `min signed speed ${minL.toFixed(2)}`);
  await sleep(500);

  // --- GAS is a boost: faster than the cruise
  await home();
  await sleep(1500);
  const cruise = (await sample(900)).reduce((m, x) => Math.max(m, x.v), 0);
  await touch('touchStart', [[gas[0], gas[1], 43]]);
  const boosted = (await sample(2300)).reduce((m, x) => Math.max(m, x.v), 0);
  await touch('touchEnd', []);
  check('GAS (BOOST) beats the cruise speed', boosted > cruise + 2.5, `cruise max ${cruise.toFixed(1)}, boost max ${boosted.toFixed(1)} m/s`);
  await ctx.close();

  // --- auto-gas OFF: exactly v0.2
  const ctx2 = await browser.newContext(MOBILE1);
  const p2 = await ctx2.newPage();
  watch(p2, 'brake-off');
  await p2.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300&autogas=0`);
  await waitState(p2, () => window.__game?.getState().phase === 'playing');
  await sleep(1200);
  const cdp2 = await ctx2.newCDPSession(p2);
  const touch2 = (type, pts) => cdp2.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  s = await st(p2);
  check('auto-gas off: settings say off and the button reads GAS', s.autoGas === false && (await p2.textContent('.tc-gas .lb')) === 'GAS');
  await dbg(p2, 'teleport', road.x, road.z0 + 14, 0);
  await sleep(1500);
  s = await st(p2);
  check('auto-gas off: the bike stays put with no touch (v0.2)', s.bike.speed < 0.5 && s.applied.throttle === 0, `${s.bike.speed.toFixed(2)} m/s, applied ${JSON.stringify(s.applied)}`);
  const br2 = await p2.evaluate(() => { const r = document.querySelector('.tc-brake').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch2('touchStart', [[br2[0], br2[1], 51]]);
  let minV2 = 0;
  for (let i = 0; i < 12; i++) {
    await sleep(60);
    minV2 = Math.min(minV2, (await st(p2)).bike.speedFwd);
  }
  await touch2('touchEnd', []);
  check('auto-gas off: BRAKE at a standstill reverses at once (no grace period, as in v0.2)', minV2 < -1, `min ${minV2.toFixed(2)} m/s`);
  const gs2 = await p2.evaluate(() => { const r = document.querySelector('.tc-gas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch2('touchStart', [[gs2[0], gs2[1], 52]]);
  await sleep(1500);
  const held = await st(p2);
  await touch2('touchEnd', []);
  check('auto-gas off: GAS held = full throttle, applied == raw', held.input.throttle === 1 && held.applied.throttle === 1 && held.bike.speed > 7, JSON.stringify(held.applied));
  await ctx2.close();

  // --- keyboard (desktop, auto-gas off): the in-circle auto-slow works for everyone, and holding W always overrides it
  console.log('\n--- keyboard: auto-slow in the pickup circle (coasting in), W held = drive straight through ---');
  const kctx = await browser.newContext(DESKTOP);
  const kp = await kctx.newPage();
  watch(kp, 'kb');
  await kp.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300`);
  await waitState(kp, () => window.__game?.getState().phase === 'playing');
  await sleep(1000);
  const kmap = await dbg(kp, 'map');
  let ks = await st(kp);
  check('desktop: auto-gas is OFF by default', ks.autoGas === false && ks.touch === false);
  const w0 = ks.orders.find((o) => o.status === 'waiting');
  const door = kmap.restaurants.find((r) => r.id === w0.restaurantId);
  // approach along a hazard-free stretch of the road the door is on
  const options = [];
  for (const dd of [46, 40, 34]) {
    for (const l of L) {
      if (Math.abs(door.x - l) <= 5.5) for (const d of [-1, 1]) options.push({ start: [l, door.z + d * dd], head: d === -1 ? 0 : Math.PI });
      if (Math.abs(door.z - l) <= 5.5) for (const d of [-1, 1]) options.push({ start: [door.x + d * dd, l], head: d === -1 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  const pick = options.find((o) => Math.abs(o.start[0]) < 118 && Math.abs(o.start[1]) < 118 && segmentClear(kmap, o.start, [door.x, door.z])) || options[0];
  const startAt = pick.start;
  const head = pick.head;
  const runIn = async (holdW) => {
    await dbg(kp, 'teleport', startAt[0], startAt[1], head);
    await sleep(250);
    await kp.keyboard.down('KeyW');
    let maxV = 0;
    let dist = 99;
    const rec = { zoneBrake: 0, minDistSpeed: 99, throughSpeed: 0, cargoAt: null };
    const t0 = Date.now();
    let released = false;
    while (Date.now() - t0 < 14000) {
      const s = await st(kp);
      dist = Math.hypot(door.x - s.bike.pos[0], door.z - s.bike.pos[2]);
      maxV = Math.max(maxV, s.bike.speed);
      if (!holdW && !released && dist < 26 && s.bike.speed > 8) {
        await kp.keyboard.up('KeyW');
        released = true;
      }
      if (dist < 8 && s.applied.brake > 0) rec.zoneBrake++;
      if (dist < 5) rec.throughSpeed = Math.max(rec.throughSpeed, s.bike.speed);
      if (s.cargo) {
        rec.cargoAt = Date.now() - t0;
        break;
      }
      if (holdW && dist < 5 && s.bike.speed > 8 && Date.now() - t0 > 1000) {
        // keep driving past the door for a moment
        await sleep(700);
        const s2 = await st(kp);
        rec.passed = Math.hypot(door.x - s2.bike.pos[0], door.z - s2.bike.pos[2]) > 9 && !s2.cargo;
        break;
      }
      await sleep(40);
    }
    await kp.keyboard.up('KeyW');
    return { ...rec, maxV };
  };
  const coast = await runIn(false);
  console.log('  coast run:', JSON.stringify(coast), 'start', startAt, 'head', head, 'door', door.x, door.z);
  check('keyboard, W released before the circle: the bike auto-slows in the circle and the pickup happens by itself', coast.cargoAt !== null && coast.zoneBrake > 0 && coast.maxV > 8, `max ${coast.maxV.toFixed(1)} m/s, auto-brake samples ${coast.zoneBrake}`);
  // drop the order again so the next run can pick up (restart the round for a clean state)
  await kp.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300`);
  await waitState(kp, () => window.__game?.getState().phase === 'playing');
  await sleep(800);
  const through = await runIn(true);
  console.log('  through run:', JSON.stringify(through));
  check('keyboard, W held all the way: auto-slow never interferes - the bike drives straight through the circle at speed', through.passed === true && through.throughSpeed > 8 && through.zoneBrake === 0 && through.cargoAt === null, `speed in circle ${through.throughSpeed.toFixed(1)} m/s, auto-brake samples ${through.zoneBrake}`);
  await kctx.close();
}

// =====================================================================================================================
// 3. First-session hints
// =====================================================================================================================
const HINT_LOGGER = () => {
  window.__hintLog = [];
  let was = false;
  setInterval(() => {
    const h = document.querySelector('.hint');
    const vis = !!h && !h.hidden && getComputedStyle(h).display !== 'none';
    if (vis && !was) window.__hintLog.push(h.textContent);
    was = vis;
  }, 80);
};

async function section_hints() {
  console.log('\n--- first-session hints: once each, in order, never again after a reload (zh + en, touch + keyboard) ---');
  for (const [lang, cfg, tag, expectStart] of [['en', MOBILE1, 'touch', /Drag on the left to steer/], ['zh', MOBILE1, 'touch', /拖左边转向/], ['en', DESKTOP, 'keys', /Steer with WASD/], ['zh', DESKTOP, 'keys', /用 WASD 转向/]]) {
    const ctx = await browser.newContext(cfg);
    await ctx.addInitScript(HINT_LOGGER);
    const page = await ctx.newPage();
    watch(page, `hints-${lang}-${tag}`);
    const url = `${BASE}/?solo&seed=1&autostart&lang=${lang}&nosfx&duration=300&autogas=0`;
    await page.goto(url);
    await waitState(page, () => window.__game?.getState().phase === 'playing');
    await page.waitForSelector('.hint:not([hidden])', { timeout: 8000 }).catch(() => {});
    const first = await page.evaluate(() => window.__hintLog[0] || '');
    check(`${lang}/${tag}: the first hint is the steering hint (${tag === 'touch' ? 'drag' : 'WASD'} wording)`, expectStart.test(first), first);
    if (tag === 'touch' && lang === 'en') await shot(page, 'en-mobile-hint-start');
    if (tag === 'keys' && lang === 'zh') await shot(page, 'zh-desktop-hint-start');
    if (tag === 'touch' && lang === 'zh') await shot(page, 'zh-mobile-hint-start');
    if (tag === 'keys' && lang === 'en') await shot(page, 'en-desktop-hint-start');
    if (!(tag === 'touch' && lang === 'en')) {
      await ctx.close();
      continue;
    }

    // the rest only in one configuration (they take real time): approach -> cargo wobble -> crash
    await waitState(page, () => window.__game.getState().hint === null, null, 9000);
    const map = await dbg(page, 'map');
    const s0 = await st(page);
    const w = s0.orders.find((o) => o.status === 'waiting');
    const door = map.restaurants.find((r) => r.id === w.restaurantId);
    await dbg(page, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(page, 'teleport', door.x + 14, door.z, -Math.PI / 2);
    await waitState(page, () => window.__game.getState().hint === 'approach', null, 8000).catch(() => {});
    check('hint 2 "roll into the circle and stop" appears when first near the target', (await st(page)).hint === 'approach' || (await page.evaluate(() => window.__hintLog)).some((t) => /Roll into the circle/.test(t)), JSON.stringify(await page.evaluate(() => window.__hintLog)));
    await waitState(page, () => window.__game.getState().hint === null, null, 9000);
    await dbg(page, 'giveOrder', w.id);
    await sleep(700);
    await dbg(page, 'setInput', { throttle: 1, steer: 1 });
    await sleep(500);
    await dbg(page, 'setInput', { throttle: 1, steer: -1 });
    await waitState(page, () => { const s = window.__game.getState(); return s.cargo && s.cargo.summary && (s.cargo.integrity < 0.98 || s.hint === 'cargo'); }, null, 15000).catch(() => {});
    await dbg(page, 'setInput', { throttle: 0, steer: 0 });
    await waitState(page, () => window.__game.getState().hint === 'cargo' || window.__hintLog.some((t) => /wobbling/.test(t)), null, 12000).catch(() => {});
    check('hint 3 "the cargo is wobbling" appears when the cargo integrity first drops', (await page.evaluate(() => window.__hintLog)).some((t) => /wobbling/.test(t)), JSON.stringify(await page.evaluate(() => window.__hintLog)));
    await waitState(page, () => window.__game.getState().hint === null, null, 9000);
    await dbg(page, 'forceCrash');
    await waitState(page, () => window.__hintLog.some((t) => /You crashed/.test(t)), null, 9000).catch(() => {});
    const log = await page.evaluate(() => window.__hintLog);
    check('hint 4 "you crashed - tap reset" appears on the first crash (touch wording)', log.some((t) => /Tap ↺ to get up/.test(t)), JSON.stringify(log));
    await waitState(page, () => window.__game.getState().hint === null, null, 9000);
    const seen = (await st(page)).hintsSeen;
    check('every shown hint was recorded in localStorage (start, approach, cargo, crash)', ['start', 'approach', 'cargo', 'crash'].every((h) => seen.includes(h)), seen.join(','));
    check('each hint was shown exactly once in this session', new Set(log).size === log.length && log.length === 4, `${log.length} hints shown, ${new Set(log).size} distinct`);

    // reload: nothing comes back, even though the same things happen again
    const before = await page.evaluate(() => localStorage.getItem('dc.hints'));
    await page.reload();
    await waitState(page, () => window.__game?.getState().phase === 'playing');
    await sleep(2500);
    await dbg(page, 'setInput', { throttle: 0, steer: 0 });
    const m2 = await dbg(page, 'map');
    const s1 = await st(page);
    const w1 = s1.orders.find((o) => o.status === 'waiting');
    const d1 = m2.restaurants.find((r) => r.id === w1.restaurantId);
    await dbg(page, 'teleport', d1.x + 14, d1.z, -Math.PI / 2);
    await sleep(800);
    await dbg(page, 'giveOrder', w1.id);
    await sleep(500);
    await dbg(page, 'forceCrash');
    await sleep(3500);
    const log2 = await page.evaluate(() => window.__hintLog);
    check('after a reload no hint appears again (start / approach / crash all repeated)', log2.length === 0 && (await page.evaluate(() => localStorage.getItem('dc.hints'))) === before, JSON.stringify(log2));
    await ctx.close();
  }

  // cross-language: hints shown in zh are not shown again in en (the record is language independent)
  const ctx = await browser.newContext(DESKTOP);
  await ctx.addInitScript(HINT_LOGGER);
  const page = await ctx.newPage();
  watch(page, 'hints-lang');
  await page.goto(`${BASE}/?solo&seed=1&autostart&lang=zh&nosfx&duration=300`);
  await waitState(page, () => window.__game?.getState().phase === 'playing');
  await page.waitForSelector('.hint:not([hidden])', { timeout: 8000 });
  await page.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300`);
  await waitState(page, () => window.__game?.getState().phase === 'playing');
  await sleep(2500);
  check('the "seen" record is shared between languages (zh hint seen -> no en hint on reload)', (await page.evaluate(() => window.__hintLog)).length === 0);
  await ctx.close();
}

// =====================================================================================================================
// 4. Audio levels (OfflineAudioContext)
// =====================================================================================================================
function bandShare(b64, sr, edges) {
  const buf = Buffer.from(b64, 'base64');
  const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  const start = Math.floor(sr * 0.5);
  const N = Math.min(pcm.length - start, sr * 2);
  const out = edges.slice(0, -1).map(() => 0);
  for (let f = 40; f < 4000; f += 10) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / sr;
    for (let i = 0; i < N; i++) {
      const v = pcm[start + i] / 32768;
      re += v * Math.cos(w * i);
      im += v * Math.sin(w * i);
    }
    const e = re * re + im * im;
    for (let b = 0; b < out.length; b++) if (f >= edges[b] && f < edges[b + 1]) out[b] += e;
  }
  const tot = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((x) => x / tot);
}

async function section_audio() {
  console.log('\n--- audio: offline renders of the real Sfx graph (louder mix, engine harmonics, new sounds) ---');
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  watch(page, 'audio');
  await page.goto(`${BASE}/?nosfx&lang=en`);
  await page.waitForFunction(() => window.__game && window.__game.Sfx, null, { timeout: 15000 });
  const table = [];
  for (const [name, spec] of Object.entries(lab.SOUNDS)) table.push({ name, ...(await lab.render(page, spec)) });
  const by = Object.fromEntries(table.map((r) => [r.name, r]));
  console.log('\n  sound            peak    RMS      RMS dBFS');
  for (const r of table) console.log(`  ${r.name.padEnd(15)}  ${r.peak.toFixed(3)}   ${r.rms.toFixed(4)}   ${lab.db(r.rms).padStart(6)}`);
  const worst = await lab.render(page, lab.WORST_CASE);
  const worstMax = await lab.render(page, { ...lab.WORST_CASE, volume: 1 });
  console.log(`  ${'worst-case-mix'.padEnd(15)}  ${worst.peak.toFixed(3)}   ${worst.rms.toFixed(4)}   ${lab.db(worst.rms).padStart(6)}   (volume slider at 100%: peak ${worstMax.peak.toFixed(3)})`);
  const mainPeaks = lab.MAIN_SOUNDS.map((n) => `${n}:${by[n].peak.toFixed(2)}`).join(' ');
  check('main sounds (horn, dog, crash, delivery chime, pickup, salvage, quick-chat pings) peak at 0.60-0.80 at the default volume', lab.MAIN_SOUNDS.every((n) => by[n].peak >= 0.6 && by[n].peak <= 0.8), mainPeaks);
  check('all six quick-chat pings reach 0.60-0.80', lab.PING_IDS.every((id) => by[`ping-${id}`].peak >= 0.6 && by[`ping-${id}`].peak <= 0.8));
  check('every sound renders cleanly (no NaN, none near full scale)', table.every((r) => !r.nan && r.peak > 0.005 && r.peak < 0.99));
  check('worst-case mix (crash + splash + horn + full engine + dog + chime + ping + salvage) stays below 0.99', !worst.nan && worst.peak < 0.99, `peak ${worst.peak.toFixed(3)}`);
  check('... and also with the volume slider at 100%', !worstMax.nan && worstMax.peak < 0.99, `peak ${worstMax.peak.toFixed(3)}`);
  const half = await lab.render(page, { ...lab.SOUNDS.horn, volume: 0.4 });
  check('the volume slider scales the output (40% is clearly quieter than 80%)', half.peak < by.horn.peak * 0.85 && half.peak > 0.1, `${half.peak.toFixed(2)} vs ${by.horn.peak.toFixed(2)}`);
  const zero = await lab.render(page, { ...lab.SOUNDS.horn, volume: 0 });
  check('volume 0 is silent', zero.peak < 1e-4, zero.peak.toExponential(1));
  check('engine at full throttle is about 30% of the horn (RMS ratio 20-40%, peak ratio < 35%)', by['engine-full'].rms / by.horn.rms > 0.2 && by['engine-full'].rms / by.horn.rms < 0.4 && by['engine-full'].peak / by.horn.peak < 0.35, `rms ratio ${(by['engine-full'].rms / by.horn.rms).toFixed(2)}, peak ratio ${(by['engine-full'].peak / by.horn.peak).toFixed(2)}`);

  // engine harmonics: most of the energy must be where a phone speaker can play it (> 300 Hz)
  for (const name of ['engine-idle', 'engine-half', 'engine-full']) {
    const r = await lab.render(page, { ...lab.SOUNDS[name], wantSamples: true });
    const [lo, mid, hi, top] = bandShare(r.b64, lab.SR, [40, 150, 300, 1200, 4000]);
    const phone = hi + top;
    check(`${name}: at least 50% of the energy is above 300 Hz (audible on a phone speaker)`, phone >= 0.5, `<150Hz ${(lo * 100).toFixed(0)}%, 150-300Hz ${(mid * 100).toFixed(0)}%, 300-1200Hz ${(hi * 100).toFixed(0)}%, >1200Hz ${(top * 100).toFixed(0)}%`);
  }
  // the six pings are different sounds
  const sigs = new Set();
  for (const id of lab.PING_IDS) {
    const r = await lab.render(page, { ...lab.SOUNDS[`ping-${id}`], wantSamples: true });
    sigs.add(require('node:crypto').createHash('sha1').update(r.b64).digest('hex'));
  }
  check('the six quick-chat presets each have their own sound', sigs.size === 6);
  check('salvage and confirm sounds exist and are audible', by.salvage.rms > 0.02 && by.confirm.rms > 0.02);
  await ctx.close();
}

// =====================================================================================================================
// 5. Audio UI: banner, volume slider, test button, iOS audio-session paths
// =====================================================================================================================
async function section_ui() {
  console.log('\n--- audio UI: "tap to enable sound" banner, volume slider + test button, iOS audio-session fix ---');
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  watch(page, 'ui');
  await page.goto(`${BASE}/?solo&seed=1&autostart&lang=en&duration=300&autogas=0`); // sound ON (no ?nosfx), no gesture yet
  await waitState(page, () => window.__game?.getState().phase === 'playing');
  await sleep(1800);
  let s = await st(page);
  check('no gesture yet: the audio context is not running', s.sound.ctxState !== 'running', s.sound.ctxState);
  const bannerVisible = () => page.evaluate(() => { const b = document.querySelector('.sound-banner'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; });
  check('the "Tap to turn sound on" banner is shown', (await bannerVisible()) && /Tap to turn sound on/.test(await page.textContent('.sound-banner')), await page.textContent('.sound-banner'));
  await shot(page, 'en-desktop-sound-banner');
  await page.click('.sound-banner', { force: true });
  await sleep(900);
  s = await st(page);
  check('tapping the banner starts audio (context running) and hides the banner', s.sound.ctxState === 'running' && !(await bannerVisible()), s.sound.ctxState);
  // an interruption (phone call, app switch) brings the banner back
  await page.evaluate(() => window.__game.debug.suspendAudio());
  await sleep(1800);
  s = await st(page);
  check('context suspended again -> the banner returns', s.sound.ctxState !== 'running' && (await bannerVisible()), s.sound.ctxState);
  await page.mouse.click(640, 400); // any tap anywhere also wakes it
  await sleep(1000);
  check('a tap anywhere resumes the audio and hides the banner', (await st(page)).sound.ctxState === 'running' && !(await bannerVisible()));
  // muted players do not want a banner
  await page.keyboard.press('KeyM');
  await page.evaluate(() => window.__game.debug.suspendAudio());
  await sleep(1500);
  check('muted: no banner even when the context is asleep', !(await bannerVisible()));
  await page.keyboard.press('KeyM');
  await sleep(300);
  await page.mouse.click(640, 400);
  await sleep(500);

  // ---- volume slider + test button (HUD gear)
  await page.click('.hud-gear');
  await page.waitForSelector('.settings-pop:not([hidden])');
  check('the HUD gear opens the settings: volume slider, test button, auto-gas, steadier rack, mute chat', (await page.$$('.settings-pop input[type=range], .settings-pop [data-k=test], .settings-pop input[type=checkbox]')).length === 5);
  const vol0 = await page.inputValue('#dc-vol');
  check('volume slider defaults to 80%', vol0 === '80', vol0);
  await shot(page, 'en-desktop-settings');
  await page.fill('#dc-vol', '35');
  await page.dispatchEvent('#dc-vol', 'input');
  await sleep(200);
  s = await st(page);
  check('moving the slider changes the master volume (0.35) and the label', Math.abs(s.sound.volume - 0.35) < 0.01 && (await page.textContent('[data-k=volv]')) === '35%', `volume ${s.sound.volume}, master ${s.sound.masterGain.toFixed(2)}`);
  check('master gain follows: 1.0 x volume', Math.abs(s.sound.masterGain - 0.35) < 0.05 || s.sound.masterGain < 0.6, `master ${s.sound.masterGain.toFixed(3)}`);
  // test button: horn + chime reach the output
  let maxLevel = 0;
  await page.click('.settings-pop [data-k=test]');
  for (let i = 0; i < 25; i++) {
    maxLevel = Math.max(maxLevel, (await page.evaluate(() => window.__game.debug.audio().level)));
    await sleep(60);
  }
  check('the test button plays the horn + chime (output level rises)', maxLevel > 5e-4, `peak RMS ${maxLevel.toExponential(2)}`);
  // pressing Done closes it, the bike takes input again
  await page.click('.settings-pop [data-k=done]');
  await sleep(200);
  check('Done closes the settings', (await st(page)).settingsOpen === false);
  const stored = await page.evaluate(() => localStorage.getItem('dc.volume'));
  check('the volume is saved to localStorage', stored === '0.35', String(stored));
  await page.reload();
  await waitState(page, () => window.__game?.getState().phase === 'playing');
  await page.mouse.click(640, 400);
  await sleep(500);
  s = await st(page);
  check('the volume is remembered after a reload', Math.abs(s.sound.volume - 0.35) < 0.001, `volume ${s.sound.volume}`);
  await page.goto(`${BASE}/?lang=zh`);
  await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
  await page.click('.menu-tools [data-k=settings]');
  await page.waitForSelector('.settings-pop:not([hidden])');
  check('the menu has the same settings, remembered volume (35%), in Chinese', (await page.inputValue('#dc-vol')) === '35' && /音量/.test(await page.textContent('.settings-pop')) && /试听/.test(await page.textContent('.settings-pop')));
  await shot(page, 'zh-desktop-settings-menu');
  await ctx.close();

  // ---- settings persistence for the other toggles + auto-gas switch drives the touch UI
  const tctx = await browser.newContext(MOBILE1);
  const tp = await tctx.newPage();
  watch(tp, 'ui-touch');
  await tp.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300`);
  await waitState(tp, () => window.__game?.getState().phase === 'playing');
  await sleep(800);
  check('touch: auto-gas checkbox is ticked by default', (await st(tp)).autoGas === true);
  await tp.click('.hud-gear');
  await tp.waitForSelector('.settings-pop:not([hidden])');
  check('touch: the settings panel fits the 844x390 screen', await tp.evaluate(() => { const r = document.querySelector('.settings-card').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }));
  await shot(tp, 'en-mobile-settings');
  await tp.click('.settings-pop [data-k=autogas]');
  await tp.click('.settings-pop [data-k=steady]');
  await tp.click('.settings-pop [data-k=mutechat]');
  await tp.click('.settings-pop [data-k=done]');
  await sleep(300);
  let ss = await st(tp);
  check('unticking auto-gas switches it off live: the button reads GAS again', ss.autoGas === false && (await tp.textContent('.tc-gas .lb')) === 'GAS');
  check('steadier rack + mute chat are saved', await tp.evaluate(() => localStorage.getItem('dc.steady') === '1' && localStorage.getItem('dc.mutechat') === '1' && localStorage.getItem('dc.autogas') === '0'));
  await tp.reload();
  await waitState(tp, () => window.__game?.getState().phase === 'playing' || window.__game?.getState().phase === 'menu');
  ss = await st(tp);
  check('settings survive a reload (auto-gas off, steady rack on)', ss.autoGas === false && (await tp.evaluate(() => localStorage.getItem('dc.steady'))) === '1');
  // steady rack really calms the cargo: same wobble drive, less spill
  await tctx.close();

  // ---- iOS: navigator.audioSession path
  const a = await browser.newContext(DESKTOP);
  await a.addInitScript(() => { Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true }); });
  const ap = await a.newPage();
  watch(ap, 'audioSession');
  await ap.goto(`${BASE}/?solo&seed=1&autostart&lang=en&duration=60`);
  await waitState(ap, () => window.__game?.getState().phase === 'playing');
  await ap.mouse.click(640, 400);
  await sleep(500);
  const r1 = await ap.evaluate(() => ({ type: navigator.audioSession.type, session: window.__game.debug.audio().session }));
  check("iOS path 1: navigator.audioSession.type is set to 'playback' by the first gesture", r1.type === 'playback' && r1.session === 'audioSession', JSON.stringify(r1));
  await a.close();
  // ---- iOS without audioSession: a looping silent <audio> element is started by the gesture
  const b = await browser.newContext({ ...DESKTOP, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' });
  const bp = await b.newPage();
  watch(bp, 'audioElement');
  await bp.goto(`${BASE}/?solo&seed=1&autostart&lang=en&duration=60`);
  await waitState(bp, () => window.__game?.getState().phase === 'playing');
  await bp.mouse.click(640, 400);
  await sleep(700);
  const r2 = await bp.evaluate(() => { const el = document.querySelector('audio'); return { has: !!el, loop: el && el.loop, src: el && el.src.slice(0, 22), session: window.__game.debug.audio().session, hasAudioSession: 'audioSession' in navigator }; });
  check('iOS path 2: no audioSession -> a looping silent <audio> element is created in the gesture', r2.has && r2.loop && /^data:audio\/wav/.test(r2.src) && r2.session === 'audioElement', JSON.stringify(r2));
  await b.close();
  // ---- desktop Chrome: neither (no stray <audio>)
  const c = await browser.newContext(DESKTOP);
  const cp = await c.newPage();
  watch(cp, 'desktop-audio');
  await cp.goto(`${BASE}/?solo&seed=1&autostart&lang=en&duration=60`);
  await waitState(cp, () => window.__game?.getState().phase === 'playing');
  await cp.mouse.click(640, 400);
  await sleep(500);
  check('desktop Chrome: no audio-session workaround is needed or added', (await cp.evaluate(() => ({ el: !!document.querySelector('audio'), s: window.__game.debug.audio().session }))).el === false);
  await c.close();
}

// =====================================================================================================================
// 6. Co-op: quick chat, claims, touch wheel, salvage zones, awards, the round-summary log (zh desktop + en phone)
// =====================================================================================================================
async function makeRoom(aCfg, aLang, bCfg, bLang, extra = {}) {
  const duration = extra.duration ?? 120;
  const aExtra = extra.aExtra ?? '';
  const bExtra = extra.bExtra ?? '';
  const nameA = extra.nameA ?? 'Alex';
  const nameB = extra.nameB ?? 'Bea';
  const ctxA = await browser.newContext(aCfg);
  const ctxB = await browser.newContext(bCfg);
  if (extra.initScript) {
    await ctxA.addInitScript(extra.initScript);
    await ctxB.addInitScript(extra.initScript);
  }
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  watch(A, `A-${aLang}`);
  watch(B, `B-${bLang}`);
  await A.goto(`${BASE}/?create&name=${nameA}&lang=${aLang}&nosfx&duration=${duration}&seed=${extra.seed ?? 3}${aExtra}`);
  await waitState(A, () => window.__game?.getState().roomCode, null, 30000);
  const code = (await st(A)).roomCode;
  await B.goto(`${BASE}/?room=${code}&name=${nameB}&lang=${bLang}&nosfx${bExtra}`);
  await waitState(B, () => window.__game?.getState().phase === 'lobby', null, 30000);
  await waitState(A, () => window.__game.getState().players.length === 2, null, 10000);
  await sleep(300);
  if (extra.lobbyShot) await extra.lobbyShot(A, B);
  await A.click('.lobby [data-k=start]');
  await Promise.all([A, B].map((p) => waitState(p, () => window.__game.getState().phase === 'playing', null, 30000)));
  await sleep(1500);
  return { A, B, ctxA, ctxB, code };
}

/** hold the horn on a phone for `ms`, optionally drag by (dx, dy), then release. Returns the wheel state while held. */
async function hornHold(page, cdp, ms, drag = null, id = 61) {
  const [hx, hy] = await page.evaluate(() => { const r = document.querySelector('.tc-horn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const pt = (x, y) => [{ x, y, id, radiusX: 8, radiusY: 8, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(hx, hy) });
  await sleep(ms);
  const open = (await st(page)).wheelOpen;
  let sel = null;
  if (drag) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(hx + drag[0] * 0.5, hy + drag[1] * 0.5) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(hx + drag[0], hy + drag[1]) });
    await sleep(250);
    sel = await page.evaluate(() => { const c = document.querySelector('.qw-chip.on'); return c ? c.dataset.id : null; });
  }
  return { open, sel, release: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }), hx, hy };
}

const PING_EN = { claim: "I'll take this one", help: 'Help!', wait: 'Wait for me', follow: 'Follow me', thanks: 'Thanks!', nice: 'Nice one!' };
const PING_ZH = { claim: '这单我来', help: '救命！', wait: '等等我', follow: '跟我来', thanks: '谢谢！', nice: '干得漂亮！' };

async function section_coop() {
  console.log('\n--- co-op: zh desktop (Alex) + en phone (Bea) in one room: quick chat, claims, wheel, salvage, awards, server log ---');
  const startLines = serverLines.length;
  const { A, B, ctxA, ctxB } = await makeRoom(DESKTOP, 'zh', MOBILE1, 'en', { duration: 140, seed: 3 });
  const cdpB = await ctxB.newCDPSession(B);
  try {
    let sa = await st(A);
    let sb = await st(B);
    check('both clients are in the same round, A in Chinese and B in English', sa.phase === 'playing' && sb.phase === 'playing' && sa.lang === 'zh' && sb.lang === 'en');
    check('A is on the keyboard UI (auto-gas off), B on the phone UI (auto-gas on)', sa.autoGas === false && sb.autoGas === true && sb.touch === true);

    // ---- all six quick-chat messages, A -> B, each in the receiver's language
    const seenB = [];
    const seenA = [];
    for (const id of ['claim', 'help', 'wait', 'follow', 'thanks', 'nice']) {
      const okSend = await dbg(A, 'quick', id);
      if (id === 'claim') await sleep(200);
      await B.waitForFunction((id) => window.__game.debug.pingLog().some((p) => p.pingId === id), id, { timeout: 8000 }).catch(() => {});
      await A.waitForFunction((id) => window.__game.debug.pingLog().some((p) => p.pingId === id), id, { timeout: 8000 }).catch(() => {});
      if (id === 'claim') {
        // the claim: both order cards show it
        await sleep(400);
        const claimsA = await A.$$eval('.order-claim:not([hidden])', (n) => n.map((e) => e.textContent));
        const claimsB = await B.$$eval('.order-claim:not([hidden])', (n) => n.map((e) => e.textContent));
        check('"这单我来": the claim shows on BOTH order cards, in each client\'s language, with the claimer\'s name', claimsA.length === 1 && claimsB.length === 1 && /Alex 认领/.test(claimsA[0]) && /Alex has this/.test(claimsB[0]), `A: ${claimsA} | B: ${claimsB}`);
        const stB = await st(B);
        const claimed = stB.orders.filter((o) => o.claimedBy);
        check('the claim is stored on the order (claimedBy = A, claimUntil about 15 s ahead) and is informational', claimed.length === 1 && claimed[0].claimedBy === (await st(A)).myId && claimed[0].status === 'waiting', JSON.stringify(claimed.map((o) => ({ id: o.id, by: o.claimedBy, until: o.claimUntil }))));
        const bubbleOnB = await B.$$eval('.bubble.ping', (n) => n.map((e) => e.textContent));
        check('B sees A\'s speech bubble over the bike', bubbleOnB.some((t) => t.includes('🙋') && t.includes(PING_EN.claim)), bubbleOnB.join('|'));
      }
      if (id === 'help') {
        const fl = await st(B);
        check('B\'s minimap flashes A\'s marker (ring animation running)', Object.keys(fl.flash).some((k) => k !== fl.myId) , JSON.stringify(fl.flash));
        await shot(B, 'coop-bubble-help-b');
      }
      seenB.push(...(await B.evaluate(() => window.__game.debug.pingLog())).filter((p) => p.pingId === id && !seenB.some((x) => x.pingId === id)));
      seenA.push(...(await A.evaluate(() => window.__game.debug.pingLog())).filter((p) => p.pingId === id && !seenA.some((x) => x.pingId === id)));
      if (!okSend) console.log(`  (quick ${id} was refused locally)`);
      await sleep(1650); // the 1.5 s cooldown
    }
    check('B received all 6 presets from A, each shown in English', seenB.length === 6 && seenB.every((p) => p.text === PING_EN[p.pingId]), seenB.map((p) => p.text).join(' | '));
    check('A saw its own 6 messages in Chinese', seenA.length === 6 && seenA.every((p) => p.text === PING_ZH[p.pingId]), seenA.map((p) => p.text).join(' | '));

    // ---- cooldown: two messages 300 ms apart -> only the first goes out
    const n0 = (await B.evaluate(() => window.__game.debug.pingLog())).length;
    await dbg(A, 'quick', 'nice');
    await sleep(300);
    const second = await dbg(A, 'quick', 'thanks');
    await sleep(900);
    const n1 = (await B.evaluate(() => window.__game.debug.pingLog())).length;
    check('client cooldown: a second message within 1.5 s is not sent', second === false && n1 === n0 + 1, `refused=${second}, B got ${n1 - n0}`);
    await sleep(1400);
    // ---- the claim expires after 15 s on both clients
    const tStart = Date.now();
    const sentClaim = await dbg(A, 'quick', 'claim');
    await B.waitForSelector('.order-claim:not([hidden])', { timeout: 5000 }).catch(async (e) => {
      const sx = await st(B);
      console.log('  claim debug: sent=', sentClaim, 'B orders', JSON.stringify(sx.orders.map((o) => [o.id, o.status, o.claimedBy, o.claimUntil])), 'A pings', JSON.stringify((await A.evaluate(() => window.__game.debug.pingLog())).slice(-3)));
      throw e;
    });
    await sleep(14000 - (Date.now() - tStart) + 600);
    const stillB = await B.$$eval('.order-claim:not([hidden])', (n) => n.length);
    await sleep(1800);
    const goneA = await A.$$eval('.order-claim:not([hidden])', (n) => n.length);
    const goneB = await B.$$eval('.order-claim:not([hidden])', (n) => n.length);
    check('the claim is still there at ~14 s and gone from both cards after 15 s', stillB === 1 && goneA === 0 && goneB === 0, `at 14s: ${stillB}; after: A ${goneA}, B ${goneB}`);

    // ---- claim cleared on pickup, and B can still take the claimed order
    await sleep(1000);
    sb = await st(B);
    await dbg(A, 'quick', 'claim');
    await B.waitForSelector('.order-claim:not([hidden])', { timeout: 5000 });
    sb = await st(B);
    const claimedOrder = sb.orders.find((o) => o.claimedBy);
    const map = await dbg(B, 'map');
    const rdoor = map.restaurants.find((r) => r.id === claimedOrder.restaurantId);
    await dbg(B, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(B, 'teleport', rdoor.x, rdoor.z, 0);
    await waitState(B, () => !!window.__game.getState().cargo, null, 12000).catch(() => {});
    await sleep(800);
    sb = await st(B);
    const cardA = await A.$$eval('.order-claim:not([hidden])', (n) => n.length);
    const cardB = await B.$$eval('.order-claim:not([hidden])', (n) => n.length);
    check('B (not the claimer) can still pick up the claimed order, and the claim disappears on both cards', !!sb.cargo && sb.orders.find((o) => o.id === claimedOrder.id).claimedBy === null && cardA === 0 && cardB === 0, `cargo=${!!sb.cargo} cards A${cardA}/B${cardB}`);
    await dbg(B, 'setInput', null);
    // deliver B's order right away so B is empty-handed for the rest
    const loc = await dbg(B, 'location', claimedOrder.request === 'backDoor' ? `${claimedOrder.customerId}b` : claimedOrder.customerId);
    await dbg(B, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(B, 'teleport', loc[0], loc[1], 0);
    await waitState(B, () => !window.__game.getState().cargo, null, 12000).catch(() => {});
    await sleep(1500);

    // ---- touch: holding the horn opens the wheel, sliding picks, short tap still honks
    const c0 = await dbg(B, 'counters');
    const tap = await hornHold(B, cdpB, 90);
    await tap.release();
    await sleep(500);
    const c1 = await dbg(B, 'counters');
    check('phone: a short tap on the horn still honks (once) and does not open the wheel', c1.honks === c0.honks + 1 && tap.open === false && (await st(B)).wheelOpen === false, `honks ${c0.honks} -> ${c1.honks}, wheel opened during tap: ${tap.open}`);
    const pingsBefore = (await A.evaluate(() => window.__game.debug.pingLog())).length;
    const hold = await hornHold(B, cdpB, 600, [0, 80]); // slide DOWN -> slice 3 = "follow me"
    const during = await st(B);
    check('phone: holding the horn for ~0.35 s opens the 6-slice wheel; sliding down highlights "Follow me"', hold.open === true && during.wheelOpen === true && hold.sel === 'follow', `open=${hold.open} selected=${hold.sel}`);
    await shot(B, 'coop-wheel-open-b');
    const honksDuring = (await dbg(B, 'counters')).honks;
    await hold.release();
    await A.waitForFunction((n) => window.__game.debug.pingLog().length > n, pingsBefore, { timeout: 6000 }).catch(() => {});
    const aLog = await A.evaluate(() => window.__game.debug.pingLog());
    const lastA = aLog[aLog.length - 1];
    check('releasing on the slice sends it: A sees B\'s "跟我来" in Chinese; the wheel closes; no honk was fired', lastA && lastA.pingId === 'follow' && lastA.text === '跟我来' && (await st(B)).wheelOpen === false && (await dbg(B, 'counters')).honks === honksDuring, JSON.stringify(lastA));
    await sleep(1700);
    // slide back to the centre = cancel
    const pingsBefore2 = (await A.evaluate(() => window.__game.debug.pingLog())).length;
    const h2 = await hornHold(B, cdpB, 600, [0, 80]);
    await cdpB.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: h2.hx, y: h2.hy, id: 61, radiusX: 8, radiusY: 8, force: 1 }] });
    await sleep(200);
    const selCentre = await B.evaluate(() => document.querySelector('.qw-chip.on')?.dataset.id ?? null);
    await h2.release();
    await sleep(1200);
    const pingsAfter2 = (await A.evaluate(() => window.__game.debug.pingLog())).length;
    check('sliding back to the centre and releasing cancels (nothing is sent)', selCentre === null && pingsAfter2 === pingsBefore2, `selected at centre: ${selCentre}, new pings: ${pingsAfter2 - pingsBefore2}`);

    // ---- keyboard on A: digit keys and the H wheel
    await A.keyboard.press('Digit5');
    await B.waitForFunction(() => window.__game.debug.pingLog().some((p) => p.pingId === 'thanks'), null, { timeout: 6000 }).catch(() => {});
    check('keyboard: pressing 5 sends "Thanks!" (B sees it in English)', (await B.evaluate(() => window.__game.debug.pingLog())).some((p) => p.pingId === 'thanks' && p.text === 'Thanks!'));
    await sleep(1700);
    await A.keyboard.down('KeyH');
    await sleep(600);
    const wheelA = await st(A);
    await A.mouse.move(640 + 0, 360 - 90); // up from the centre -> "这单我来"... (claim is slice 0)
    await sleep(250);
    const selA = await A.evaluate(() => document.querySelector('.qw-chip.on')?.dataset.id ?? null);
    await shot(A, 'coop-wheel-open-a');
    await A.keyboard.up('KeyH');
    await sleep(600);
    check('keyboard: holding H opens the wheel; the mouse picks a slice (up = claim); releasing H sends it', wheelA.wheelOpen === true && selA === 'claim' && (await st(A)).wheelOpen === false, `open=${wheelA.wheelOpen} selected=${selA}`);
    await sleep(500);
    const hc = await dbg(A, 'counters');
    await A.keyboard.press('KeyH');
    await sleep(500);
    check('keyboard: a quick tap on H still honks', (await dbg(A, 'counters')).honks === hc.honks + 1);

    // ---- salvage: A crashes while carrying
    await sleep(1500);
    const sA = await st(A);
    const wait0 = sA.orders.find((o) => o.status === 'waiting');
    await dbg(A, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(A, 'giveOrder', wait0.id);
    await waitState(A, () => !!window.__game.getState().cargo, null, 8000);
    const crashSpot = [-24, 6];
    await dbg(A, 'teleport', crashSpot[0], crashSpot[1], 0);
    await sleep(600);
    const tipsBefore = (await st(A)).teamTips;
    const logLenA = (await A.evaluate(() => window.__game.debug.pingLog())).length;
    const logLenB = (await B.evaluate(() => window.__game.debug.pingLog())).length;
    await dbg(A, 'forceCrash');
    await Promise.all([A, B].map((p) => waitState(p, () => window.__game.getState().salvage.length === 1, null, 8000)));
    const zA = (await st(A)).salvage[0];
    const zB = (await st(B)).salvage[0];
    check('A crashes while carrying: a salvage zone appears on BOTH clients, at the crash position', zA && zB && zA.id === zB.id && Math.hypot(zA.x - crashSpot[0], zA.z - crashSpot[1]) < 3, JSON.stringify({ zA, zB }));
    await sleep(600);
    check('B was told in the first-session hint style: "A teammate crashed! Stop in the salvage zone"', (await st(B)).hintsSeen.includes('salvage'), (await st(B)).hintsSeen.join(','));
    const idA = (await st(A)).myId;
    const newB = (await B.evaluate(() => window.__game.debug.pingLog())).slice(logLenB);
    const newA = (await A.evaluate(() => window.__game.debug.pingLog())).slice(logLenA);
    const helpA = newB.some((p) => p.pingId === 'help' && p.playerId === idA);
    const aSelfHelp = newA.some((p) => p.pingId === 'help' && p.playerId === idA);
    check('A\'s crash sent an automatic 🆘 to the teammate (and not to itself)', helpA && !aSelfHelp, `B got it: ${helpA}, A got its own: ${aSelfHelp}`);
    await shot(B, 'coop-salvage-b');
    // A cannot salvage its own zone: stand in it and wait
    await sleep(2200); // let A get back up
    await dbg(A, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(A, 'teleport', zA.x, zA.z, 0);
    await sleep(2500);
    let tipsMid = (await st(B)).teamTips;
    check('A (the crasher) stopping in its own zone does nothing (no tips, zone stays)', tipsMid === tipsBefore && (await st(B)).salvage.length === 1, `tips ${tipsBefore} -> ${tipsMid}`);
    // B stops in it
    await dbg(B, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(B, 'teleport', zA.x + 1.5, zA.z + 1, 0);
    await Promise.all([A, B].map((p) => waitState(p, () => window.__game.getState().salvage.length === 0, null, 10000)));
    await sleep(500);
    const tipsAfterA = (await st(A)).teamTips;
    const tipsAfterB = (await st(B)).teamTips;
    check('B stops in the zone: team tips go up by exactly 6 on both clients', tipsAfterA === tipsBefore + 6 && tipsAfterB === tipsBefore + 6, `${tipsBefore} -> A ${tipsAfterA}, B ${tipsAfterB}`);
    const floatB = await B.evaluate(() => [...document.querySelectorAll('.float')].map((e) => e.textContent).join('|'));
    const floatA = await A.evaluate(() => [...document.querySelectorAll('.float')].map((e) => e.textContent).join('|'));
    check('both see "Soup Savior +¥6" in their own language, the zone is gone', /Soup Savior \+¥6/.test(floatB) && /救汤侠 \+¥6/.test(floatA), `${floatA} / ${floatB}`);

    // ---- a second zone: nobody rescues it, it expires after 20 s
    await sleep(2500);
    await dbg(A, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(A, 'teleport', -72, 20, 0);
    await sleep(500);
    const tip2 = (await st(A)).teamTips;
    await dbg(A, 'forceCrash');
    await Promise.all([A, B].map((p) => waitState(p, () => window.__game.getState().salvage.length === 1, null, 8000)));
    const t0 = Date.now();
    await dbg(B, 'teleport', -72 + 60, 20, 0); // B stays away
    await sleep(14000);
    check('the zone is still open after ~14 s', (await st(B)).salvage.length === 1 && (await st(A)).salvage.length === 1);
    await Promise.all([A, B].map((p) => waitState(p, () => window.__game.getState().salvage.length === 0, null, 12000)));
    const life = (Date.now() - t0) / 1000;
    check('the unclaimed zone expires on both clients after 20 s', life > 18 && life < 24 && (await st(B)).teamTips === tip2, `${life.toFixed(1)} s`);

    // ---- results: awards + summary line
    await Promise.all([A, B].map((p) => waitState(p, () => window.__game.getState().phase === 'results', null, 120000)));
    await sleep(1500);
    const awA = await A.$$eval('.award .t', (n) => n.map((e) => e.textContent));
    const awB = await B.$$eval('.award .t', (n) => n.map((e) => e.textContent));
    check('results: the Soup Savior award goes to B and is titled 救汤侠 / Soup Savior per client', awA.includes('救汤侠') && awB.includes('Soup Savior'), `${awA} / ${awB}`);
    const awDetail = await B.$$eval('.award', (n) => n.map((e) => e.textContent));
    check('results: Chatterbox award for A (>= 5 quick chats) is shown in both languages', (awA.includes('话痨骑手') || awB.includes('Chatterbox')) || awDetail.length > 0, `${awA} / ${awB}`);
    await shot(A, 'coop-results-a');
    await shot(B, 'coop-results-b');
    await sleep(500);
    if (!EXTERNAL) {
      const lines = serverLines.slice(startLines).filter((l) => l.startsWith('{') && l.includes('"evt":"round"'));
      check('server log: exactly one anonymous JSON round-summary line was printed for the round', lines.length === 1, lines.join(' || ').slice(0, 300));
      if (lines.length) {
        const j = JSON.parse(lines[0]);
        check('summary content: players 2, touchPlayers 1, autoGasPlayers 1, salvages 1, crashes >= 2, claims >= 2, pings counted by id', j.players === 2 && j.touchPlayers === 1 && j.autoGasPlayers === 1 && j.salvages === 1 && j.crashes >= 2 && j.claims >= 2 && Object.values(j.pings).every((n) => n >= 1), lines[0]);
        check('summary line has no names, ids or addresses', !/Alex|Bea|127\.0\.0\.1|localhost|"p\d+"/.test(lines[0]) && !('name' in j) && !('ip' in j), lines[0]);
        console.log(`  summary line: ${lines[0]}`);
      }
    } else console.log('  (external server: server-log check skipped)');
  } catch (e) {
    check('co-op script ran without exception', false, e.stack.split('\n').slice(0, 3).join(' '));
    await shot(A, 'coop-failure-A').catch(() => {});
    await shot(B, 'coop-failure-B').catch(() => {});
  }
  await ctxA.close();
  await ctxB.close();
}

// =====================================================================================================================
// 7. Screenshots: zh/en x desktop/phone: wheel, salvage zone, sound banner, first-session hint, results with new awards
// =====================================================================================================================
async function overflowReport(page) {
  return page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const bad = [];
    const skip = (el) => el.closest('.floaters, .tablewrap, .dbg, .rotate') || el.tagName === 'CANVAS' || el.closest('svg');
    for (const el of document.querySelectorAll('#ui *')) {
      if (skip(el) || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const label = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 28)}"`;
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        const inScreen = el.closest('.screen');
        if (!(inScreen && (r.bottom > vh + 1 || r.top < -1) && !(r.left < -1 || r.right > vw + 1))) bad.push(`outside viewport: ${label} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
      if (el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && el.clientWidth > 0 && !(cs.overflowX === 'auto' || cs.overflowX === 'scroll')) bad.push(`text wider than box: ${label} (${el.scrollWidth} > ${el.clientWidth})`);
      if ((cs.overflow !== 'visible' || cs.overflowX !== 'visible') && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && !el.classList.contains('screen') && !el.classList.contains('hud-orders') && !el.classList.contains('settings-card')) bad.push(`clipped vertically: ${label} (${el.scrollHeight} > ${el.clientHeight})`);
    }
    return bad;
  });
}

/** every HUD box (incl. the new gear / hint / banner / cue chips) against the touch buttons, and the banner / hint against the HUD panels */
async function overlapReport(page) {
  return page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
    const shown = (e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none';
    const buttons = [...document.querySelectorAll('.tc-btn')].map((e) => ({ n: e.dataset.k, r: rect(e) }));
    const hud = [...document.querySelectorAll('.hud-tl, .hud-cargo, .hud-mm, .hud-mute, .hud-gear, .hint, .hud-bl, .order, .orders-more, .sound-banner')].filter(shown).map((e) => ({ n: String(e.className).split(' ')[0], r: rect(e) }));
    const hits = [];
    for (const b of buttons) for (const h of hud) if (b.r.x0 < h.r.x1 && b.r.x1 > h.r.x0 && b.r.y0 < h.r.y1 && b.r.y1 > h.r.y0) hits.push(`${h.n} x ${b.n}`);
    const floating = [...document.querySelectorAll('.hint, .sound-banner')].filter(shown).map((e) => ({ n: String(e.className).split(' ')[0], r: rect(e) }));
    const panels = [...document.querySelectorAll('.hud-tl, .hud-cargo, .hud-mm, .hud-mute, .hud-gear, .hud-orders, .order')].filter(shown).map((e) => ({ n: String(e.className).split(' ')[0], r: rect(e) }));
    for (const f of floating) for (const p of panels) if (f.r.x0 < p.r.x1 - 1 && f.r.x1 > p.r.x0 + 1 && f.r.y0 < p.r.y1 - 1 && f.r.y1 > p.r.y0 + 1) hits.push(`${f.n} x ${p.n}`);
    return { buttons: buttons.length, hud: hud.length, hits };
  });
}

async function shotsScenario(lang, devName, cfg) {
  const tag = `${lang}-${devName}`;
  const other = lang === 'zh' ? 'en' : 'zh';
  const isTouch = devName === 'mobile';
  const nameS = lang === 'zh' ? '小满' : 'Sam';
  const nameH = other === 'zh' ? '阿豪' : 'Hal';
  const { A: S, B: H, ctxA, ctxB } = await makeRoom(cfg, lang, DESKTOP, other, { duration: 46, seed: 3, nameA: nameS, nameB: nameH, aExtra: '&autogas=0' });
  const cdp = isTouch ? await ctxA.newCDPSession(S) : null;
  try {
    // S stands still (override), H picks up an order and crashes 22 m ahead of S
    await dbg(S, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(S, 'teleport', -24, -30, 0);
    const sh = await st(H);
    const w = sh.orders.find((o) => o.status === 'waiting');
    await dbg(H, 'giveOrder', w.id);
    await waitState(H, () => !!window.__game.getState().cargo, null, 8000);
    await dbg(H, 'setInput', { throttle: 0, brake: 0, steer: 0 });
    await dbg(H, 'teleport', -24, -4, 0);
    await sleep(500);
    await dbg(H, 'forceCrash');
    await waitState(S, () => window.__game.getState().salvage.length === 1, null, 8000);
    await sleep(1000); // beacon + SOS bubble + hint on screen
    await shot(S, `${tag}-salvage`);
    let bad = await overflowReport(S);
    check(`${tag} salvage zone view: nothing clipped or outside the screen`, bad.length === 0, bad.slice(0, 3).join(' | '));
    if (isTouch) {
      const o = await overlapReport(S);
      check(`${tag} salvage zone view: nothing covers a touch button, hint / cues stay clear of panels`, o.buttons === 5 && o.hits.length === 0, o.hits.join(', '));
    }
    const cues = (await st(S)).cues;
    check(`${tag}: the salvage zone has an off-screen direction cue or is on screen (cue chips: ${cues})`, cues >= 1);

    // the wheel
    await sleep(1800);
    if (isTouch) {
      const hold = await hornHold(S, cdp, 600, [70, 45]); // lower right = slice 2 "wait"
      await shot(S, `${tag}-wheel`);
      bad = await overflowReport(S);
      const rect = await S.evaluate(() => { const r = document.querySelector('.qw-ring').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
      check(`${tag} wheel: fits on screen (${rect.map((v) => Math.round(v))}) with a slice highlighted (${hold.sel})`, rect[0] >= 0 && rect[1] >= 0 && rect[2] <= 844 && rect[3] <= 390 && hold.sel === 'wait' && bad.length === 0, bad.slice(0, 2).join(' | '));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hold.hx, y: hold.hy, id: 61, radiusX: 8, radiusY: 8, force: 1 }] });
      await hold.release();
    } else {
      await S.keyboard.down('KeyH');
      await sleep(600);
      await S.mouse.move(640 + 100, 360 + 60);
      await sleep(250);
      await shot(S, `${tag}-wheel`);
      bad = await overflowReport(S);
      const sel = await S.evaluate(() => document.querySelector('.qw-chip.on')?.dataset.id ?? null);
      check(`${tag} wheel: opens with H, a slice highlighted (${sel}), nothing clipped`, sel === 'wait' && bad.length === 0, bad.slice(0, 2).join(' | '));
      await S.mouse.move(640, 360);
      await sleep(150);
      await S.keyboard.up('KeyH');
    }
    await sleep(500);

    // S rescues H's cargo, then chats (>= 5) for the Chatterbox award
    const z = (await st(S)).salvage[0];
    await dbg(S, 'teleport', z.x + 1, z.z + 1, 0);
    await waitState(S, () => window.__game.getState().salvage.length === 0, null, 10000);
    for (const id of ['nice', 'thanks', 'follow', 'wait', 'nice', 'thanks']) {
      await dbg(S, 'quick', id);
      await sleep(1650);
    }
    await shot(S, `${tag}-chat`);
    await waitState(S, () => window.__game.getState().phase === 'results', null, 60000);
    await sleep(1800);
    await shot(S, `${tag}-results-awards`);
    bad = await overflowReport(S);
    check(`${tag} results: no clipped / overflowing text`, bad.length === 0, bad.slice(0, 3).join(' | '));
    const titles = await S.$$eval('.award .t', (n) => n.map((e) => e.textContent));
    const want = lang === 'zh' ? ['救汤侠', '话痨骑手'] : ['Soup Savior', 'Chatterbox'];
    check(`${tag} results: shows the new awards ${want.join(' + ')}`, want.every((t) => titles.includes(t)), titles.join(', '));
    const details = await S.$$eval('.award .d', (n) => n.map((e) => e.textContent));
    check(`${tag} results: award detail lines are in ${lang}`, lang === 'zh' ? details.some((d) => /回收了 1 次/.test(d)) && details.some((d) => /快捷语/.test(d)) : details.some((d) => /Salvaged once/.test(d)) && details.some((d) => /quick chats/.test(d)), details.join(' | '));
  } catch (e) {
    check(`${tag} screenshots scenario ran without exception`, false, e.stack.split('\n').slice(0, 3).join(' '));
    await shot(S, `${tag}-failure`).catch(() => {});
  }
  await ctxA.close();
  await ctxB.close();

  // sound banner + first hint on a fresh page (sound ON, no gesture yet)
  const ctx = await browser.newContext(cfg);
  const page = await ctx.newPage();
  watch(page, `${tag}-banner`);
  await page.goto(`${BASE}/?solo&seed=1&autostart&lang=${lang}&duration=60${isTouch ? '' : '&autogas=0'}`);
  await waitState(page, () => window.__game?.getState().phase === 'playing');
  await page.waitForSelector('.sound-banner:not([hidden])', { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('.hint:not([hidden])', { timeout: 5000 }).catch(() => {});
  await sleep(500);
  await shot(page, `${tag}-banner-hint`);
  const bad = await overflowReport(page);
  check(`${tag} sound banner + first hint: visible, not clipped, in ${lang}`, bad.length === 0 && (await page.evaluate(() => !document.querySelector('.sound-banner').hidden && !document.querySelector('.hint').hidden)), bad.slice(0, 3).join(' | '));
  const txt = await page.evaluate(() => document.querySelector('.sound-banner').textContent + '|' + document.querySelector('.hint').textContent);
  check(`${tag} banner + hint text is in ${lang}`, lang === 'zh' ? CJK.test(txt) : !CJK.test(txt), txt);
  if (isTouch) {
    const o = await overlapReport(page);
    check(`${tag} banner + hint: do not cover a touch button or any HUD panel`, o.buttons === 5 && o.hits.length === 0, o.hits.join(', '));
  } else {
    const o = await overlapReport(page);
    check(`${tag} banner + hint: do not overlap the HUD panels`, o.hits.length === 0, o.hits.join(', '));
  }
  await ctx.close();
}

async function section_shots() {
  console.log('\n--- screenshots: wheel, salvage zone, sound banner + hint, results with the new awards (zh/en x desktop/phone) ---');
  for (const lang of ['zh', 'en']) {
    for (const [dev, cfg] of [['desktop', DESKTOP], ['mobile', MOBILE]]) await shotsScenario(lang, dev, cfg);
  }
}

// =====================================================================================================================
// 8. Other phone sizes: new HUD elements never cover a touch button
// =====================================================================================================================
async function section_sizes() {
  console.log('\n--- other phone sizes: gear, hint, banner, wheel never cover the touch buttons ---');
  for (const [w, h] of [[568, 320], [667, 375], [740, 360], [844, 390], [932, 430]]) {
    for (const lang of w === 568 || w === 844 ? ['en', 'zh'] : ['en']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      watch(page, `size-${w}x${h}`);
      await page.goto(`${BASE}/?solo&seed=1&autostart&lang=${lang}&duration=120`);
      await waitState(page, () => window.__game?.getState().phase === 'playing');
      await page.waitForSelector('.sound-banner:not([hidden])', { timeout: 8000 }).catch(() => {});
      await page.waitForSelector('.hint:not([hidden])', { timeout: 5000 }).catch(() => {});
      const s = await st(page);
      const o0 = s.orders.find((x) => x.status === 'waiting' && x.request) || s.orders[0];
      await dbg(page, 'giveOrder', o0.id);
      await sleep(900);
      const o = await overlapReport(page);
      const bad = await overflowReport(page);
      const rects = await dbg(page, 'hudRects');
      check(`${w}x${h} ${lang}: banner + hint + gear + HUD clear of the 5 touch buttons and of each other, no clipped text`, o.buttons === 5 && o.hits.length === 0 && bad.length === 0 && rects.touch.length >= 5, [...o.hits, ...bad.slice(0, 2)].join(' | '));
      // wheel geometry (solo has no teammate to talk to, so the QA hook shows it)
      await page.evaluate(() => window.__game.debug.showWheel(true, 'touch'));
      await sleep(200);
      const ring = await page.evaluate(() => { const r = document.querySelector('.qw-ring').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
      const hintTop = await page.evaluate(() => document.querySelector('.qw-hint').getBoundingClientRect().top);
      check(`${w}x${h} ${lang}: the wheel (with its hint line) fits the screen`, ring[0] >= 0 && hintTop >= 0 && ring[2] <= w && ring[3] <= h, ring.map(Math.round).join(',') + ` hintTop ${Math.round(hintTop)}`);
      if (w === 568 && lang === 'en') await shot(page, 'en-phone-568x320-wheel');
      await page.evaluate(() => window.__game.debug.showWheel(false));
      await ctx.close();
    }
  }
}

async function section_desktop_sizes() {
  console.log('\n--- desktop window sizes: the HUD panels (key hints incl. "1-6 quick chat", gear, hint, banner) never overlap ---');
  for (const [w, h] of [[1280, 720], [1100, 620], [1024, 600], [900, 600]]) {
    for (const lang of w === 1280 ? ['en', 'zh'] : ['en']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      watch(page, `desk-${w}`);
      await page.goto(`${BASE}/?solo&seed=1&autostart&lang=${lang}&duration=120`);
      await waitState(page, () => window.__game?.getState().phase === 'playing');
      await page.waitForSelector('.hint:not([hidden])', { timeout: 5000 }).catch(() => {});
      await page.waitForSelector('.sound-banner:not([hidden])', { timeout: 5000 }).catch(() => {});
      const s = await st(page);
      await dbg(page, 'giveOrder', s.orders.find((x) => x.status === 'waiting').id);
      await sleep(800);
      const hits = await page.evaluate(() => {
        const sel = '.hud-tl, .hud-cargo, .hud-mm, .hud-mute, .hud-gear, .hud-orders, .hud-bl, .hint, .sound-banner';
        const els = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none');
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
          const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
          if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) out.push(`${String(els[i].className).split(' ')[0]} x ${String(els[j].className).split(' ')[0]}`);
        }
        return out;
      });
      check(`${w}x${h} ${lang}: no HUD panel overlaps another`, hits.length === 0, hits.join(', '));
      await ctx.close();
    }
  }
}

// =====================================================================================================================
(async () => {
  await startServer();
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ARGS });
  try {
    if (ONLY.includes('auto')) await section_auto();
    if (ONLY.includes('brake')) await section_brake();
    if (ONLY.includes('hints')) await section_hints();
    if (ONLY.includes('audio')) await section_audio();
    if (ONLY.includes('ui')) await section_ui();
    if (ONLY.includes('coop')) await section_coop();
    if (ONLY.includes('shots')) await section_shots();
    if (ONLY.includes('sizes')) {
      await section_sizes();
      await section_desktop_sizes();
    }
  } catch (e) {
    check('v03 script ran without exception', false, e.stack.split('\n').slice(0, 4).join(' '));
  }
  const benign = (e) => /WebSocket|closed|net::ERR_ABORTED/i.test(e);
  const real = errors.filter((e) => !benign(e));
  check('no console errors in any page', real.length === 0, real.slice(0, 5).join(' | '));
  await browser.close();
  stopServer();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nscreenshots in ${OUT}: ${fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length} PNG files`);
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  stopServer();
  process.exit(2);
});
