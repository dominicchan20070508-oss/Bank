// Screenshot helper for the "cargo must read clearly" review item: a 4-box pizza stack in a hard turn.
//   node qa/cargo-turn.cjs [baseUrl] [out.png]
const path = require('node:path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = process.argv[3] || path.join(__dirname, 'cargo-turn.png');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ args: ARGS });
  } catch {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ARGS });
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  const G = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(`${BASE}/?solo&seed=1&autostart&nosfx`);
  await page.waitForFunction(() => window.__game?.getState().phase === 'playing');
  // make sure the pool offers a 4-box pizza: rewrite one waiting pizza order (client-side view only) before taking it
  await G(() => {
    const s = window.__game.getState();
    let o = s.orders.find((x) => x.food === 'pizza' && x.status === 'waiting');
    const list = s.orders.map((x) => ({ ...x }));
    if (!o) {
      const any = list.find((x) => x.status === 'waiting');
      Object.assign(any, { restaurantId: 'r1', food: 'pizza' });
      o = any;
    }
    list.find((x) => x.id === o.id).size = 4;
    window.__game.debug.inject({ type: 'orders', t: 0, teamTips: 0, list });
    window.__game.debug.giveOrder(o.id);
  });
  await page.waitForFunction(() => window.__game.getState().cargo?.kind === 'pizza');
  console.log('carrying', JSON.stringify(await G(() => window.__game.getState().cargo)));

  // a long clear straight (x=-24 has ramps; x=24 lane works for seed 1): get to speed, then yank the bars over
  const route = await G(() => {
    const m = window.__game.debug.map();
    for (const xl of [24, 72, -72, -24]) for (const lane of [-3, 3]) {
      const x = xl + lane;
      const clear = [...m.ramps.map((r) => [r.x, r.z, 5]), ...m.bumps.map((b) => [b.x, b.z, 5]), ...m.obstacles.map((o) => [o.x, o.z, 3])].every(([px, pz, r]) => Math.abs(px - x) > r + 1.5 || pz < -112 || pz > 40);
      if (clear) return [x, -110];
    }
    return [24, -110];
  });
  await G(([x, z]) => window.__game.debug.teleport(x, z, 0), route);
  await G(() => window.__game.debug.setInput({ throttle: 1, steer: 0 }));
  await page.waitForTimeout(2600);
  let best = { score: -1 };
  // a few hard turns in alternating directions (full lock at full speed); keep the frame where the stack leans the most
  for (let k = 0; k < 6 && best.score < 0.42; k++) {
    await G((dir) => window.__game.debug.setInput({ throttle: 1, steer: dir }), k % 2 ? 1 : -1);
    const until = Date.now() + 1100;
    while (Date.now() < until) {
      const s = await G(() => window.__game.getState());
      if (s.bike.crashed) break;
      const tilt = Math.hypot(s.cargo?.summary?.b ?? 0, s.cargo?.summary?.c ?? 0);
      const score = tilt + Math.abs(s.bike.lean) * 0.5;
      if (s.cargo && s.cargo.kind === 'pizza' && score > best.score && Math.abs(s.bike.lean) > 0.2 && tilt > 0.12) {
        await page.screenshot({ path: OUT });
        best = { score, tilt, cargo: s.cargo.detail, lean: s.bike.lean };
      }
      await page.waitForTimeout(30);
    }
    await G(() => window.__game.debug.setInput({ steer: 0 }));
    await page.waitForTimeout(700);
    const st = await G(() => window.__game.getState());
    if (st.bike.crashed) {
      await page.waitForTimeout(2200);
      await G(([x, z]) => window.__game.debug.teleport(x, z, 0), route);
      await G(() => window.__game.debug.setInput({ throttle: 1, steer: 0 }));
      await page.waitForTimeout(2200);
    }
  }
  console.log('best frame', JSON.stringify(best), '->', OUT);
  console.log(problems.length ? 'PROBLEMS ' + problems.join(' | ') : 'no console problems');
  await browser.close();
})();
