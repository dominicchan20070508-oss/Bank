// Extra Phase B checks (complements qa/pm-multi.mjs): menu-driven create/join, remote cargo on screen, error paths,
// disconnect overlay. Starts its OWN server on a random port (with DC_DEBUG) so it can kill it mid-test.
//   node qa/multi-extra.cjs [outDir]
const path = require('node:path');
const { spawn } = require('node:child_process');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}
const OUT = process.argv[2] || __dirname;
const PORT = 8100 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, label, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
};

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'server/index.ts'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DC_DEBUG: '1' },
    stdio: 'ignore',
    detached: true, // tsx starts a child node: kill the whole group
  });
  const killServer = () => {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  };
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  let browser;
  try {
    browser = await chromium.launch({ args: ARGS });
  } catch {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ARGS });
  }
  const errors = { A: [], B: [], C: [] };
  const mk = async (tag, w = 960, h = 540) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors[tag].push(m.text()));
    page.on('pageerror', (e) => errors[tag].push('pageerror: ' + e.message));
    return { ctx, page };
  };
  const st = (p) => p.evaluate(() => window.__game.getState());
  const dbg = (p, fn, ...args) => p.evaluate(([fn, args]) => window.__game.debug[fn](...args), [fn, args]);

  try {
    const A = await mk('A');
    const B = await mk('B');

    // --- host via the MENU buttons, guest via the code box
    await A.page.goto(`${BASE}/?nosfx&name=阿强`);
    await A.page.click('[data-k="create"]');
    await A.page.waitForFunction(() => window.__game.getState().roomCode, null, { timeout: 15000 });
    const code = (await st(A.page)).roomCode;
    check(/^[A-HJ-NP-Z]{4}$/.test(code), 'create room from the menu button', code);
    check((await A.page.innerText('[data-k="code"]')).trim() === code, 'big room code on screen');
    await A.page.click('[data-k="copy"]');
    await A.page.waitForSelector('.notice-toast', { timeout: 3000 });
    check((await A.page.innerText('.notice-toast')).includes(`/?room=${code}`), 'copy-invite button reports the link', await A.page.innerText('.notice-toast'));

    await B.page.goto(`${BASE}/?nosfx&name=小美`);
    await B.page.click('[data-k="join"]');
    await B.page.fill('#dc-code', code.toLowerCase());
    await B.page.click('[data-k="go"]');
    await B.page.waitForFunction(() => window.__game.getState().phase === 'lobby' && window.__game.getState().players.length === 2, null, { timeout: 15000 });
    check(true, 'join from the menu code box');
    const hostBtn = await A.page.getByRole('button', { name: /开始/ }).innerText();
    const guestBtn = await B.page.getByRole('button', { name: /开始|等待/ }).first();
    check(hostBtn.includes('开始') && (await guestBtn.isDisabled()) && (await guestBtn.innerText()).includes('等待房主开始'), 'host sees 开始游戏, guest sees 等待房主开始…');
    await A.page.getByRole('button', { name: /开始/ }).click();
    await Promise.all([A, B].map((c) => c.page.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 20000 })));

    // --- A carries a pizza and wobbles in front of B
    let sa = await st(A.page);
    const pizza = sa.orders.find((o) => o.food === 'pizza' && o.status === 'waiting') || sa.orders.find((o) => o.status === 'waiting');
    await dbg(A.page, 'giveOrder', pizza.id);
    await A.page.waitForFunction(() => window.__game.getState().cargo, null, { timeout: 5000 });
    const sb0 = await st(B.page);
    const me = sb0.players.find((p) => p.id === sb0.myId);
    // A rides slowly in front of B, swerving so the stack wobbles; every 2 s it is put back 11 m ahead of B
    for (let round = 0; round < 3; round++) {
      await dbg(A.page, 'teleport', me.pos[0] - 1, me.pos[2] + 11, 0);
      await dbg(A.page, 'setInput', { throttle: 0.3, steer: 0 });
      await sleep(600);
      for (let i = 0; i < 4; i++) {
        await dbg(A.page, 'setInput', { throttle: 0.3, steer: i % 2 ? 1 : -1 });
        await sleep(300);
      }
    }
    await dbg(A.page, 'teleport', me.pos[0] - 1, me.pos[2] + 11, 0);
    await dbg(A.page, 'setInput', { throttle: 0.3, steer: 0.0 });
    await sleep(500);
    await dbg(A.page, 'setInput', { throttle: 0.3, steer: 1 });
    await sleep(450);
    await B.page.screenshot({ path: `${OUT}/remote-cargo.png` });
    const sb = await st(B.page);
    const cardText = await B.page.evaluate(() => [...document.querySelectorAll('.order-badge')].map((e) => e.textContent).join(' | '));
    check(/配送中·阿强/.test(cardText), 'B sees "配送中·阿强" on the order card', cardText);
    const ra = sb.players.find((p) => p.id === sa.myId);
    check(ra && ra.carrying === pizza.id && Math.hypot(ra.pos[0] - me.pos[0], ra.pos[2] - me.pos[2]) < 60, 'B.getState() has A position + carrying', JSON.stringify(ra && { pos: ra.pos.map((v) => +v.toFixed(1)), carrying: ra.carrying }));

    // remote crash + debris + honk reach B without errors
    await dbg(A.page, 'forceCrash');
    await sleep(500);
    await dbg(A.page, 'honk');
    await sleep(600);
    await B.page.screenshot({ path: `${OUT}/remote-crash.png` });
    check((await B.page.evaluate(() => window.__game.getState().phase)) === 'playing', 'B keeps playing through A crash / honk');

    // --- error paths via URL
    const C = await mk('C');
    await C.page.goto(`${BASE}/?room=${code}&name=迟到&nosfx`);
    await C.page.waitForSelector('.notice-toast', { timeout: 8000 });
    const errText = await C.page.innerText('.notice-toast');
    check(errText.includes('房间正在游戏中，请等下一局') && (await st(C.page)).phase === 'menu', 'joining a playing room → message + back to menu', errText);
    await C.page.goto(`${BASE}/?room=ZZZZ&name=迷路&nosfx`);
    await C.page.waitForSelector('.notice-toast', { timeout: 8000 });
    check((await C.page.innerText('.notice-toast')).includes('房间不存在'), 'unknown room code → 房间不存在', await C.page.innerText('.notice-toast'));

    // --- server dies: overlay, no error spam
    const errsBefore = errors.A.length + errors.B.length;
    killServer();
    await B.page.waitForSelector('.disconnect:not([hidden])', { timeout: 15000 });
    check((await B.page.innerText('.disconnect')).includes('连接断开'), '连接断开 overlay appears when the socket drops');
    await sleep(1200);
    await B.page.screenshot({ path: `${OUT}/disconnect.png` });
    check(errors.A.length + errors.B.length - errsBefore <= 2, 'no error spam after the drop', errors.B.slice(errsBefore).join(' | '));
    await B.page.click('.disconnect [data-k="menu"]');
    await sleep(300);
    check((await st(B.page)).phase === 'menu', '返回菜单 works');
    const real = [...errors.A, ...errors.B, ...errors.C].filter((e) => !/WebSocket|ERR_CONNECTION|Failed to load resource/i.test(e));
    check(real.length === 0, 'no console errors (ignoring the expected socket-closed noise)', real.slice(0, 4).join(' | '));
  } catch (e) {
    check(false, 'script ran without exception', e.message.split('\n')[0]);
  }
  killServer();
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
