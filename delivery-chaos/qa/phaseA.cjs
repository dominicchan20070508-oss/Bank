// Phase A smoke + tuning check, driven through the __game test hooks (DESIGN §10.4).
//
//   npm run build && npm start &          # serve dist/ on :8080
//   node qa/phaseA.cjs                     # BASE=http://localhost:8080  SHOT=qa/phaseA.png  (optional)
//
// Requires Playwright (installed globally in the dev image): NODE_PATH=/opt/node22/lib/node_modules or the path below.
const path = require('node:path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const BASE = process.env.BASE || 'http://localhost:8080';
const SHOT = process.env.SHOT || path.join(__dirname, 'phaseA.png');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];

let failures = 0;
const check = (ok, label, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
};

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ args: ARGS });
  } catch {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ARGS });
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  const G = (fn, arg) => page.evaluate(fn, arg);
  const state = () => G(() => window.__game.getState());
  const setInput = (p) => G((p) => window.__game.debug.setInput(p), p);

  await page.goto(`${BASE}/?solo&seed=1&autostart&nosfx&debug`);
  await page.waitForFunction(() => window.__game && window.__game.getState().phase === 'playing', null, { timeout: 20000 });
  let s = await state();
  check(s.phase === 'playing' && s.orders.length >= 3, 'solo autostart: playing with a full order pool', `orders=${s.orders.length}`);
  check(s.timeLeft > 200 && s.timeLeft <= 240, 'timer is running', `timeLeft=${s.timeLeft.toFixed(1)}`);

  // ---- basic driving
  const p0 = s.bike.pos.slice();
  await setInput({ throttle: 1, steer: 0 });
  await page.waitForTimeout(3000);
  s = await state();
  const moved = Math.hypot(s.bike.pos[0] - p0[0], s.bike.pos[2] - p0[2]);
  check(s.bike.speed > 5, 'throttle makes speed > 0', `speed=${s.bike.speed.toFixed(1)} m/s`);
  check(moved > 10, 'position changes', `moved=${moved.toFixed(1)} m`);
  await setInput({ throttle: 0, brake: 1, steer: 0 });
  await page.waitForTimeout(1200);
  await setInput(null);

  // ---- tuning sanity: soup on a long straight that has no ramps / bumps / obstacles in the way
  const map = await G(() => window.__game.debug.map());
  function findClearRun(length) {
    const props = [
      ...map.ramps.map((r) => ({ x: r.x, z: r.z, rx: r.dir % 2 ? 3 : 4.5, rz: r.dir % 2 ? 4.5 : 3 })),
      ...map.bumps.map((b) => ({ x: b.x, z: b.z, rx: b.w / 2, rz: b.d / 2 })),
      ...map.obstacles.map((o) => ({ x: o.x, z: o.z, rx: 1.8, rz: 1.8 })),
    ];
    for (const xl of [-72, -24, 24, 72]) {
      for (const lane of [-3, 3]) {
        const x = xl + lane;
        for (let z0 = -110; z0 + length <= 110; z0 += 10) {
          const clear = props.every((p) => Math.abs(p.x - x) > p.rx + 2.5 || p.z + p.rz < z0 - 6 || p.z - p.rz > z0 + length + 8);
          if (clear) return { x, z0 };
        }
      }
    }
    return { x: -24, z0: -110 };
  }
  const run = findClearRun(110);
  console.log(`      clear test route: x=${run.x} z=${run.z0}..${run.z0 + 110}`);
  async function soupRun(label, throttle, steerFn, seconds) {
    s = await state();
    const order = s.orders.find((o) => o.food === 'soup' && o.status === 'waiting') || s.orders.find((o) => o.status === 'waiting');
    await G((id) => window.__game.debug.giveOrder(id), order.id);
    await page.waitForFunction(() => window.__game.getState().cargo !== null);
    await G(([x, z]) => window.__game.debug.teleport(x, z, 0), [run.x, run.z0]);
    await setInput({ throttle: 1, steer: 0, brake: 0, handbrake: false });
    await page.waitForTimeout(1800); // get up to speed before the test starts
    await setInput({ throttle, steer: 0 });
    const t0 = Date.now();
    const pieces = [];
    while ((Date.now() - t0) / 1000 < seconds) {
      await setInput({ steer: steerFn((Date.now() - t0) / 1000) });
      await page.waitForTimeout(60);
      pieces.push((await state()).cargo?.integrity);
    }
    s = await state();
    const integrity = s.cargo ? s.cargo.integrity : 0;
    console.log(`      ${label}: soup integrity ${integrity.toFixed(2)}  crashed=${s.bike.crashed}  speed=${s.bike.speed.toFixed(1)}`);
    await setInput(null);
    await setInput({ brake: 1 });
    await page.waitForTimeout(1500);
    await setInput(null);
    return { integrity, crashed: s.bike.crashed };
  }
  const calm = await soupRun('straight, moderate speed (10 m/s), 5 s', 10 / 16, () => 0, 5);
  check(calm.integrity >= 0.99, 'driving straight at moderate speed loses ~nothing', `integrity=${calm.integrity.toFixed(2)}`);
  const hard = await soupRun('hard slalom at full speed, 5 s', 1, (t) => (Math.floor(t / 0.8) % 2 ? 1 : -1), 5);
  check(hard.integrity < 0.9 && hard.integrity > 0.05, 'hard steering at full speed spills some, not all, within ~5 s', `integrity=${hard.integrity.toFixed(2)}`);
  // drop whatever we are carrying so the delivery test starts clean
  await G(() => window.__game.debug.forceCrash());
  await page.waitForTimeout(2200);

  // ---- full loop for each food: pickup by stopping in the circle, delivery by stopping at the door
  for (const food of ['soup', 'pizza', 'ice']) {
    s = await state();
    if (s.cargo) {
      const tgt = await G(() => window.__game.debug.targetFor());
      await G(([x, z]) => window.__game.debug.teleport(x, z, 0), tgt);
      await page.waitForFunction(() => window.__game.getState().cargo === null, null, { timeout: 15000 }).catch(() => {});
      s = await state();
    }
    // the pool only refills when an order is taken or expires: burn other orders (instant pickup + delivery) until this food shows up
    let order = s.orders.find((o) => o.food === food && o.status === 'waiting');
    for (let i = 0; i < 25 && !order; i++) {
      const other = s.orders.find((o) => o.status === 'waiting');
      if (other) {
        await G((id) => window.__game.debug.giveOrder(id), other.id);
        await page.waitForFunction(() => window.__game.getState().cargo !== null);
        const [dx, dz] = await G(() => window.__game.debug.targetFor());
        await G(([x, z]) => window.__game.debug.teleport(x, z, 0), [dx, dz]);
        await page.waitForFunction(() => window.__game.getState().cargo === null, null, { timeout: 15000 }).catch(() => {});
      }
      await page.waitForTimeout(3300);
      s = await state();
      order = s.orders.find((o) => o.food === food && o.status === 'waiting');
    }
    if (!order) {
      check(false, `${food}: an order was offered`);
      continue;
    }
    const [rx, rz] = await G((id) => window.__game.debug.location(id), order.restaurantId);
    await G(([x, z]) => window.__game.debug.teleport(x, z, 0), [rx, rz]);
    await page.waitForFunction(() => window.__game.getState().cargo !== null, null, { timeout: 15000 }).catch(() => {});
    s = await state();
    check(s.cargo && s.cargo.kind === food, `${food}: picked up by stopping at the restaurant`, s.cargo ? s.cargo.detail : '');
    const tips0 = s.teamTips;
    const [tx, tz] = await G(() => window.__game.debug.targetFor());
    await G(([x, z]) => window.__game.debug.teleport(x, z, 0), [tx, tz]);
    await page.waitForFunction((t0) => window.__game.getState().teamTips > t0, tips0, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(250);
    s = await state();
    const card = await G(() => document.querySelector('.tipcard')?.innerText?.replace(/\n/g, ' | '));
    check(s.teamTips > tips0 && s.cargo === null, `${food}: delivered, team tips ${tips0} -> ${s.teamTips}`, card || '');
  }

  // ---- a nice screenshot: carry something, driving, HUD and guidance visible
  s = await state();
  let shotOrder = s.orders.find((o) => o.status === 'waiting' && o.food !== 'soup') || s.orders.find((o) => o.status === 'waiting');
  if (shotOrder) {
    const [rx, rz] = await G((id) => window.__game.debug.location(id), shotOrder.restaurantId);
    await G(([x, z]) => window.__game.debug.teleport(x, z, 0), [rx, rz]);
    await page.waitForFunction(() => window.__game.getState().cargo !== null, null, { timeout: 15000 }).catch(() => {});
    await G(([x, z]) => window.__game.debug.teleport(x, z, 0), [run.x, run.z0]);
    await setInput({ throttle: 0.8, steer: 0 });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(1500); // let the previous delivery popups fade
    await setInput({ steer: -0.6 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: SHOT });
    await setInput(null);
    console.log(`      screenshot -> ${SHOT}`);
  }

  // ---- end of round -> results -> play again
  await G(() => window.__game.debug.endGame());
  await page.waitForFunction(() => window.__game.getState().phase === 'results', null, { timeout: 10000 });
  const res = await state();
  check(res.results && res.results.stars >= 0 && res.results.awards.length >= 1, 'results screen has stars + awards', `stars=${res.results.stars} awards=${res.results.awards.map((a) => a.title).join('/')}`);
  await page.click('[data-k="again"]');
  await page.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 10000 });
  s = await state();
  check(s.phase === 'playing' && s.teamTips === 0 && s.timeLeft > 200, 'play again starts a fresh round', `timeLeft=${s.timeLeft.toFixed(0)}`);

  check(problems.length === 0, 'no console errors or warnings', problems.join(' || '));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
