// PM acceptance script — Phase B (2-player online). Usage: node qa-multi.mjs [baseUrl] [outDir]
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
const errors = { A: [], B: [] };
async function mk(tag) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors[tag].push(m.text()); });
  page.on('pageerror', (e) => errors[tag].push('pageerror: ' + e.message));
  return { ctx, page };
}
const st = (p) => p.evaluate(() => window.__game.getState());
const dbg = (p, fn, ...args) => p.evaluate(([fn, args]) => window.__game.debug[fn](...args), [fn, args]);

const A = await mk('A');
const B = await mk('B');
try {
  await A.page.goto(`${BASE}/?create&name=阿强&nosfx&duration=60`);
  await A.page.waitForFunction(() => window.__game?.getState().roomCode, null, { timeout: 15000 });
  const code = (await st(A.page)).roomCode;
  check('host creates room', /^[A-Z]{4}$/.test(code), code);

  await B.page.goto(`${BASE}/?room=${code}&name=小美&nosfx`);
  await B.page.waitForFunction(() => window.__game?.getState().phase === 'lobby', null, { timeout: 15000 });
  await A.page.waitForFunction(() => window.__game.getState().players.length === 2, null, { timeout: 10000 });
  check('guest joins; host sees 2 players', true);
  await A.page.screenshot({ path: `${OUT}/qa-lobby.png` });

  // host starts via the UI button
  const startBtn = A.page.getByRole('button', { name: /开始|Start/i });
  await startBtn.click();
  await Promise.all([A, B].map(({ page }) => page.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 20000 })));
  check('both enter playing', true);

  await sleep(1000);
  let sa = await st(A.page), sb = await st(B.page);
  const idsA = sa.orders.map((o) => o.id).sort().join(), idsB = sb.orders.map((o) => o.id).sort().join();
  check('same order pool', idsA === idsB && sa.orders.length >= 4, `A=${idsA} B=${idsB}`);
  check('timers in sync (±1s)', Math.abs(sa.timeLeft - sb.timeLeft) < 1, `${sa.timeLeft.toFixed(1)} vs ${sb.timeLeft.toFixed(1)}`);

  // A drives; B should see A move smoothly
  await dbg(A.page, 'setInput', { throttle: 1 });
  const samples = [];
  for (let i = 0; i < 25; i++) {
    await sleep(80);
    const s = await st(B.page);
    const ra = s.players.find((p) => p.id === sa.myId);
    if (ra) samples.push(ra.pos);
  }
  await dbg(A.page, 'setInput', { throttle: 0, brake: 1 });
  const dist = samples.length > 1 ? Math.hypot(samples.at(-1)[0] - samples[0][0], samples.at(-1)[2] - samples[0][2]) : 0;
  const steps = samples.slice(1).map((p, i) => Math.hypot(p[0] - samples[i][0], p[2] - samples[i][2]));
  const maxStep = Math.max(0, ...steps);
  check('B sees A move', dist > 3, `moved ${dist.toFixed(1)}m in ${samples.length} samples`);
  check('remote motion smooth (no big jumps)', maxStep < 3, `max step ${maxStep.toFixed(2)}m / 80ms`);
  await B.page.screenshot({ path: `${OUT}/qa-remote-view.png` });

  // pickup exclusivity: give the same order to both
  sa = await st(A.page);
  const target = sa.orders.find((o) => o.status === 'waiting');
  await dbg(A.page, 'giveOrder', target.id);
  await sleep(600);
  await dbg(B.page, 'giveOrder', target.id);
  await sleep(800);
  sa = await st(A.page); sb = await st(B.page);
  const oa = sa.orders.find((o) => o.id === target.id), ob = sb.orders.find((o) => o.id === target.id);
  check('order carried by A on both clients', oa?.carrierId === sa.myId && ob?.carrierId === sa.myId, `A sees ${oa?.carrierId}, B sees ${ob?.carrierId}`);
  check('B did not get the same order', !sb.cargo || sb.players.find((p) => p.id === sb.myId)?.carrying !== target.id);

  // A delivers → team tips identical on both
  const custId = target.customerId;
  const loc = await dbg(A.page, 'location', target.request === 'backDoor' ? `${custId}b` : custId);
  await dbg(A.page, 'setInput', { throttle: 0, brake: 0, steer: 0 });
  await dbg(A.page, 'teleport', loc[0], loc[1]);
  await A.page.waitForFunction(() => window.__game.getState().teamTips > 0, null, { timeout: 8000 }).catch(() => {});
  await sleep(600);
  sa = await st(A.page); sb = await st(B.page);
  check('team tips shared', sa.teamTips > 0 && sa.teamTips === sb.teamTips, `A=${sa.teamTips} B=${sb.teamTips}`);

  // B disconnects mid-game; A keeps playing
  await B.ctx.close();
  await sleep(2000);
  sa = await st(A.page);
  check('A survives B disconnect', sa.phase === 'playing' && sa.players.length === 1, `players=${sa.players.length}`);
  const t1 = sa.timeLeft; await sleep(1200);
  check('timer still running after disconnect', (await st(A.page)).timeLeft < t1);
} catch (e) {
  check('script ran without exception', false, e.message.split('\n')[0]);
  await A.page.screenshot({ path: `${OUT}/qa-multi-failure-A.png` }).catch(() => {});
}
check('no console errors (A)', errors.A.length === 0, errors.A.slice(0, 5).join(' | '));
check('no console errors (B)', errors.B.filter((e) => !/WebSocket|closed/i.test(e)).length === 0, errors.B.slice(0, 5).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
