// v0.2 acceptance (DESIGN §13.4): screenshots in both languages x desktop / phone landscape, real multi-touch controls,
// audio (worst-case mix, per-sound levels, hidden tab, mute) and a zh + en multiplayer room.
//
//   npm run build && DC_DEBUG=1 npm start &       # the server must run with DC_DEBUG=1 (online tests use debugGive / duration)
//   node qa/v02.cjs [baseUrl] [outDir]            # defaults: http://localhost:8080  qa/v02
//   ONLY=shots,touch,audio,multi,menu node qa/v02.cjs  # run a subset
//
// Needs Playwright (global install in the dev image).
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
} catch {
  ({ chromium } = require('playwright'));
}
const lab = require('./lib/audio-lab.cjs');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = process.argv[3] || path.join(__dirname, 'v02');
const ONLY = (process.env.ONLY || 'shots,touch,audio,multi,menu').split(',');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  - ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CJK = /[　-〿一-鿿＀-￯]/;

const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
let browser;
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
};

const DESKTOP = { viewport: { width: 1280, height: 720 } };
const MOBILE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const MOBILE1 = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
const PORTRAIT = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const st = (page) => page.evaluate(() => window.__game.getState());
const dbg = (page, fn, ...args) => page.evaluate(([fn, args]) => window.__game.debug[fn](...args), [fn, args]);

/** Scan the UI for clipped / overflowing text and elements outside the viewport. Returns a list of problems. */
async function overflowReport(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bad = [];
    const skip = (el) => el.closest('.floaters, .tablewrap, .dbg, .rotate') || el.tagName === 'CANVAS' || el.tagName === 'svg' || el.closest('svg');
    for (const el of document.querySelectorAll('#ui *')) {
      if (skip(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest('[hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const label = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 30)}"`;
      if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
        // screens scroll vertically on purpose; only report horizontal escapes there
        const inScreen = el.closest('.screen');
        if (!(inScreen && (r.bottom > vh + 1 || r.top < -1) && !(r.left < -1 || r.right > vw + 1))) bad.push(`outside viewport: ${label} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
      const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
      if (el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && el.clientWidth > 0) {
        if (!(cs.overflowX === 'auto' || cs.overflowX === 'scroll')) bad.push(`text wider than box: ${label} (${el.scrollWidth} > ${el.clientWidth})`);
      }
      if (clips && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && !el.classList.contains('screen') && !el.classList.contains('hud-orders')) {
        bad.push(`clipped vertically: ${label} (${el.scrollHeight} > ${el.clientHeight})`);
      }
    }
    return bad;
  });
}

/** Rectangles that intersect: HUD panels / cards vs touch buttons. */
async function hudVsButtons(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    };
    const buttons = [...document.querySelectorAll('.tc-btn')].map((e) => ({ n: e.dataset.k, r: rect(e) }));
    const hud = [...document.querySelectorAll('.hud-tl, .hud-cargo, .hud-mm, .hud-mute, .hud-bl, .order, .orders-more')]
      .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none')
      .map((e) => ({ n: String(e.className).split(' ')[0], r: rect(e) }));
    const hits = [];
    for (const b of buttons) for (const h of hud) if (b.r.x0 < h.r.x1 && b.r.x1 > h.r.x0 && b.r.y0 < h.r.y1 && b.r.y1 > h.r.y0) hits.push(`${h.n} x ${b.n}`);
    // the big HUD panels must not overlap each other either
    const panels = [...document.querySelectorAll('.hud-tl, .hud-cargo, .hud-mm, .hud-mute, .hud-orders')]
      .filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none')
      .map((e) => ({ n: String(e.className).split(' ')[0], r: rect(e) }));
    for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i].r, b = panels[j].r;
      if (a.x0 < b.x1 - 1 && a.x1 > b.x0 + 1 && a.y0 < b.y1 - 1 && a.y1 > b.y0 + 1) hits.push(`${panels[i].n} x ${panels[j].n}`);
    }
    return { buttons: buttons.length, hud: hud.length, hits };
  });
}

// =====================================================================================================================
// 1. Screenshots
// =====================================================================================================================
async function section_shots() {
  console.log('\n--- screenshots (menu, lobby, game with cargo, results) x (zh, en) x (desktop, phone landscape) ---');
  for (const lang of ['zh', 'en']) {
    for (const [dev, cfg] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
      const tag = `${lang}-${dev}`;
      // ---- menu
      const ctx = await browser.newContext(cfg);
      const page = await ctx.newPage();
      watch(page, tag);
      await page.goto(`${BASE}/?lang=${lang}&nosfx`);
      await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, `${tag}-menu.png`) });
      let bad = await overflowReport(page);
      check(`${tag} menu: no clipped / overflowing text`, bad.length === 0, bad.slice(0, 3).join(' | '));
      const s0 = await st(page);
      check(`${tag} menu: language is ${lang}`, s0.lang === lang && (await page.evaluate(() => document.documentElement.lang)).startsWith(lang));
      const title = await page.textContent('.screen:not(.disconnect) .card .title');
      check(`${tag} menu: title text matches the language`, lang === 'zh' ? CJK.test(title) : !CJK.test(title), title);
      await ctx.close();

      // ---- lobby (online room with a guest of the other language)
      const hctx = await browser.newContext(cfg);
      const host = await hctx.newPage();
      watch(host, tag + '-host');
      await host.goto(`${BASE}/?create&name=Alex&lang=${lang}&nosfx&duration=40&seed=3`);
      await host.waitForFunction(() => window.__game?.getState().roomCode, null, { timeout: 15000 });
      const code = (await st(host)).roomCode;
      const gctx = await browser.newContext(DESKTOP);
      const guest = await gctx.newPage();
      watch(guest, tag + '-guest');
      await guest.goto(`${BASE}/?room=${code}&name=&lang=${lang === 'zh' ? 'en' : 'zh'}&nosfx`);
      await guest.waitForFunction(() => window.__game?.getState().phase === 'lobby', null, { timeout: 15000 });
      await host.waitForFunction(() => window.__game.getState().players.length === 2, null, { timeout: 10000 });
      await sleep(300);
      await host.screenshot({ path: path.join(OUT, `${tag}-lobby.png`) });
      bad = await overflowReport(host);
      check(`${tag} lobby: no clipped / overflowing text`, bad.length === 0, bad.slice(0, 3).join(' | '));
      const lobbyText = await host.textContent('.lobby');
      check(`${tag} lobby: unnamed guest shows the host's-language default name`, lang === 'zh' ? lobbyText.includes('骑手2') : lobbyText.includes('Rider 2'), lobbyText.replace(/\s+/g, ' ').slice(0, 90));
      await gctx.close();
      await hctx.close();

      // ---- game carrying cargo, then results
      const gctx2 = await browser.newContext(cfg);
      const gp = await gctx2.newPage();
      watch(gp, tag + '-game');
      await gp.goto(`${BASE}/?solo&seed=1&autostart&lang=${lang}&nosfx&duration=60`);
      await gp.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
      await sleep(1200);
      let s = await st(gp);
      // prefer an order with a request so the request line is visible, and a food that wobbles visibly
      const order = s.orders.find((o) => o.status === 'waiting' && o.request === 'noHorn') || s.orders.find((o) => o.status === 'waiting' && o.request) || s.orders.find((o) => o.status === 'waiting');
      await dbg(gp, 'giveOrder', order.id);
      await sleep(500);
      await dbg(gp, 'setInput', { throttle: 0.55, steer: 0.35 });
      await sleep(1500);
      s = await st(gp);
      check(`${tag} game: carrying cargo`, !!s.cargo, s.cargo ? s.cargo.detail : 'no cargo');
      check(`${tag} game: cargo status line is in ${lang}`, s.cargo && (lang === 'zh' ? CJK.test(s.cargo.detail) : !CJK.test(s.cargo.detail)), s.cargo && s.cargo.detail);
      await gp.screenshot({ path: path.join(OUT, `${tag}-game.png`) });
      bad = await overflowReport(gp);
      check(`${tag} game: HUD text not clipped, nothing outside the viewport`, bad.length === 0, bad.slice(0, 4).join(' | '));
      if (dev === 'mobile') {
        const o = await hudVsButtons(gp);
        check(`${tag} game: no HUD element covers a touch button (${o.hud} HUD boxes vs ${o.buttons} buttons)`, o.buttons === 5 && o.hits.length === 0, o.hits.join(', '));
      }
      // deliver for a real tip popup + results
      await dbg(gp, 'setInput', null);
      const loc = await dbg(gp, 'location', order.request === 'backDoor' ? `${order.customerId}b` : order.customerId);
      await dbg(gp, 'teleport', loc[0], loc[1]);
      await gp.waitForFunction(() => !window.__game.getState().cargo, null, { timeout: 8000 }).catch(() => {});
      await sleep(350);
      const tipText = await gp.evaluate(() => document.querySelector('.tipcard')?.textContent || '');
      check(`${tag} game: tip popup is in ${lang}`, !!tipText && (lang === 'zh' ? CJK.test(tipText) : !CJK.test(tipText)), tipText.slice(0, 80));
      if (dev === 'mobile' || lang === 'en') await gp.screenshot({ path: path.join(OUT, `${tag}-delivered.png`) });
      await dbg(gp, 'endGame');
      await gp.waitForFunction(() => window.__game.getState().phase === 'results', null, { timeout: 10000 });
      await sleep(1000);
      await gp.screenshot({ path: path.join(OUT, `${tag}-results.png`) });
      bad = await overflowReport(gp);
      check(`${tag} results: no clipped / overflowing text`, bad.length === 0, bad.slice(0, 3).join(' | '));
      const resText = await gp.textContent('.results');
      check(`${tag} results: text is in ${lang}`, lang === 'zh' ? CJK.test(resText) : !CJK.test(resText), resText.replace(/\s+/g, ' ').slice(0, 70));
      await gctx2.close();
    }
  }

  // ---- portrait phone: menu is usable, in-game shows the rotate overlay
  console.log('\n--- portrait phone ---');
  for (const lang of ['en', 'zh']) {
    const ctx = await browser.newContext(PORTRAIT);
    const page = await ctx.newPage();
    watch(page, 'portrait-' + lang);
    await page.goto(`${BASE}/?lang=${lang}&nosfx`);
    await page.waitForFunction(() => window.__game, null, { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, `${lang}-portrait-menu.png`) });
    const bad = await overflowReport(page);
    check(`portrait ${lang} menu: no clipped / overflowing text`, bad.length === 0, bad.slice(0, 3).join(' | '));
    const visible = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.card .btn')];
      return b.map((x) => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth; });
    });
    check(`portrait ${lang} menu: all buttons fully on screen`, visible.length >= 3 && visible.every(Boolean));
    if (lang === 'en') {
      await page.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=60`);
      await page.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
      await sleep(800);
      const shown = await page.evaluate(() => { const r = document.querySelector('.rotate'); return !!r && !r.hidden && getComputedStyle(r).display !== 'none'; });
      check('portrait: rotate overlay is shown during play', shown);
      await page.screenshot({ path: path.join(OUT, 'en-portrait-rotate.png') });
      const txt = await page.textContent('.rotate');
      check('portrait: rotate overlay text', /Rotate your phone/.test(txt), txt);
    }
    await ctx.close();
  }

  // ---- other phone sizes: the HUD must never cover a touch button (iPhone SE / 8 / 12 mini / Max landscape)
  console.log('\n--- other phone landscape sizes ---');
  for (const [w, h] of [[568, 320], [667, 375], [740, 360], [932, 430]]) {
    for (const lang of ['en', 'zh']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      watch(page, `phone-${w}x${h}`);
      await page.goto(`${BASE}/?solo&seed=1&autostart&lang=${lang}&nosfx&duration=60`);
      await page.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
      await sleep(1000);
      const s = await st(page);
      const o = s.orders.find((x) => x.status === 'waiting' && x.request) || s.orders[0];
      await dbg(page, 'giveOrder', o.id);
      await sleep(900);
      const hits = await hudVsButtons(page);
      const bad = await overflowReport(page);
      check(`${w}x${h} ${lang}: no HUD box covers a touch button, no clipped text`, hits.buttons === 5 && hits.hits.length === 0 && bad.length === 0, [...hits.hits, ...bad.slice(0, 3)].join(' | '));
      if (lang === 'en' && w === 568) await page.screenshot({ path: path.join(OUT, `en-phone-${w}x${h}-game.png`) });
      await ctx.close();
    }
  }
}

// =====================================================================================================================
// 2. Mobile touch (real multi-touch through CDP)
// =====================================================================================================================
async function section_touch() {
  console.log('\n--- mobile touch controls (CDP Input.dispatchTouchEvent, two simultaneous touch points) ---');
  const ctx = await browser.newContext(MOBILE1);
  const page = await ctx.newPage();
  watch(page, 'touch');
  await page.goto(`${BASE}/?solo&seed=1&autostart&lang=en&nosfx&duration=300`);
  await page.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
  await sleep(1200);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const center = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);

  const ui = await page.evaluate(() => ({
    touchUI: window.__game.getState().touch,
    controls: !!document.querySelector('.touch') && !document.querySelector('.touch').hidden,
    buttons: [...document.querySelectorAll('.tc-btn')].map((b) => b.dataset.k),
    viewport: document.querySelector('meta[name=viewport]').content,
  }));
  check('touch UI is on for a phone (hasTouch + isMobile) and shows 5 buttons', ui.touchUI && ui.controls && ui.buttons.length === 5, ui.buttons.join(','));
  check('viewport meta blocks zoom and covers the notch', /user-scalable=no/.test(ui.viewport) && /maximum-scale=1/.test(ui.viewport) && /viewport-fit=cover/.test(ui.viewport), ui.viewport);

  const gas = await center('.tc-gas');
  const brake = await center('.tc-brake');
  const hb = await center('.tc-hb');
  const horn = await center('.tc-horn');
  const reset = await center('.tc-reset');
  const padStart = [110, 290];
  const spawn = (await dbg(page, 'map')).spawns[0];
  const home = () => dbg(page, 'teleport', spawn.x, spawn.z, spawn.heading);

  // --- throttle + steering pad at the same time, two touch points
  const s0 = await st(page);
  const h0 = s0.bike.heading;
  await touch('touchStart', [[gas[0], gas[1], 1], [padStart[0], padStart[1], 2]]);
  await sleep(120);
  await touch('touchMove', [[gas[0], gas[1], 1], [padStart[0] + 30, padStart[1], 2]]);
  await sleep(120);
  await touch('touchMove', [[gas[0], gas[1], 1], [padStart[0] + 55, padStart[1], 2]]);
  let maxSpeed = 0;
  let maxSteer = 0;
  for (let i = 0; i < 18; i++) {
    await sleep(150);
    const s = await st(page);
    maxSpeed = Math.max(maxSpeed, s.bike.speed);
    maxSteer = Math.max(maxSteer, s.input.steer);
  }
  const s1 = await st(page);
  const visual = await page.evaluate(() => ({ base: !document.querySelector('.tc-base').hidden, gasDown: document.querySelector('.tc-gas').classList.contains('down') }));
  check('both thumbs at once: throttle held AND steering active in the same input frame', s1.input.throttle === 1 && s1.input.steer > 0.5, `input=${JSON.stringify(s1.input)}`);
  check('bike accelerates (speed > 3)', maxSpeed > 3, `max speed ${maxSpeed.toFixed(1)} m/s`);
  const dh = Math.abs(s1.bike.heading - h0);
  check('bike turns (heading changed)', dh > 0.2, `dheading ${dh.toFixed(2)} rad`);
  check('pad shows its base and the gas button shows pressed', visual.base && visual.gasDown);
  // steer back the other way with the same finger (analog): input goes negative while throttle stays down
  await touch('touchMove', [[gas[0], gas[1], 1], [padStart[0] - 55, padStart[1], 2]]);
  await sleep(300);
  const sNeg = await st(page);
  check('pad is analog both ways (dx -55 -> steer < -0.5, throttle still held)', sNeg.input.steer < -0.5 && sNeg.input.throttle === 1, `steer=${sNeg.input.steer.toFixed(2)}`);
  await touch('touchMove', [[gas[0], gas[1], 1], [padStart[0] + 20, padStart[1], 2]]);
  await sleep(250);
  const sMid = await st(page);
  check('partial drag gives partial steering (dx 20 -> 0 < steer < 0.5)', sMid.input.steer > 0.1 && sMid.input.steer < 0.5, `steer=${sMid.input.steer.toFixed(2)}`);
  await page.screenshot({ path: path.join(OUT, 'en-mobile-game-touching.png') });
  // lift the steering finger only (touchEnd lists the fingers that leave): throttle must stay
  await touch('touchEnd', [[padStart[0] + 20, padStart[1], 2]]);
  await sleep(250);
  const sHold = await st(page);
  check('lifting the steering thumb keeps the throttle thumb working', sHold.input.throttle === 1 && sHold.input.steer === 0, JSON.stringify(sHold.input));
  await touch('touchEnd', []);
  await sleep(300);
  const sRel = await st(page);
  check('releasing everything stops the inputs', sRel.input.throttle === 0 && sRel.input.steer === 0 && !sRel.input.handbrake, JSON.stringify(sRel.input));

  // --- horn
  const c0 = await dbg(page, 'counters');
  await touch('touchStart', [[horn[0], horn[1], 5]]);
  await sleep(80);
  await touch('touchEnd', []);
  await sleep(400);
  const c1 = await dbg(page, 'counters');
  const floatTxt = await page.evaluate(() => [...document.querySelectorAll('.float')].map((e) => e.textContent).join('|'));
  check('horn button honks once per tap', c1.honks === c0.honks + 1, `honks ${c0.honks} -> ${c1.honks}; floaters: ${floatTxt}`);

  // --- handbrake: stops the bike much faster than coasting
  const speedAfter = async (useHandbrake) => {
    await home();
    await sleep(200);
    await touch('touchStart', [[gas[0], gas[1], 1]]);
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      if ((await st(page)).bike.speed > 9) break;
    }
    await touch('touchEnd', []);
    const v0 = (await st(page)).bike.speed;
    if (useHandbrake) await touch('touchStart', [[hb[0], hb[1], 3]]);
    await sleep(700);
    const mid = await st(page);
    if (useHandbrake) await touch('touchEnd', []);
    return { v0, v1: mid.bike.speed, hb: mid.input.handbrake };
  };
  const coast = await speedAfter(false);
  const braked = await speedAfter(true);
  check('handbrake button engages the handbrake', braked.hb === true);
  check('handbrake sheds speed faster than coasting', braked.v0 - braked.v1 > coast.v0 - coast.v1 + 1, `coast ${coast.v0.toFixed(1)}->${coast.v1.toFixed(1)}, handbrake ${braked.v0.toFixed(1)}->${braked.v1.toFixed(1)} m/s`);

  // --- brake button
  await touch('touchStart', [[gas[0], gas[1], 1]]);
  await sleep(1200);
  await touch('touchStart', [[gas[0], gas[1], 1], [brake[0], brake[1], 4]]);
  await sleep(150);
  const sB = await st(page);
  check('brake button sets brake (and the merge keeps throttle: both are live)', sB.input.brake === 1 && sB.input.throttle === 1, JSON.stringify(sB.input));
  await touch('touchEnd', []);
  await sleep(200);

  // --- reset button
  await home();
  await sleep(200);
  const r0 = (await dbg(page, 'counters')).resets;
  await touch('touchStart', [[reset[0], reset[1], 6]]);
  await sleep(80);
  await touch('touchEnd', []);
  await sleep(400);
  const r1 = (await dbg(page, 'counters')).resets;
  const fill = await page.evaluate(() => document.querySelector('.tc-reset i').style.height);
  check('reset button rights the bike (counts once, cooldown shown on the button)', r1 === r0 + 1 && fill !== '0%' && fill !== '', `resets ${r0} -> ${r1}, cooldown fill ${fill}`);
  // while crashed, reset recovers early
  await sleep(3200); // cooldown (3 s)
  await dbg(page, 'forceCrash');
  await sleep(300);
  check('bike is crashed after forceCrash', (await st(page)).bike.crashed === true);
  await touch('touchStart', [[reset[0], reset[1], 7]]);
  await sleep(80);
  await touch('touchEnd', []);
  await sleep(300);
  check('reset button also recovers a crashed bike', (await st(page)).bike.crashed === false);

  // --- keyboard still works alongside touch (merge, not replace)
  await page.keyboard.down('KeyW');
  await sleep(250);
  const kb = await st(page);
  await page.keyboard.up('KeyW');
  check('keyboard input is unchanged while the touch UI is on', kb.input.throttle === 1, JSON.stringify(kb.input));

  // --- no scroll, no zoom, no long-press menu
  await page.evaluate(() => { window.__cm = []; document.addEventListener('contextmenu', (e) => window.__cm.push(e.defaultPrevented)); });
  await cdp.send('Input.synthesizeScrollGesture', { x: 420, y: 200, yDistance: -250, xDistance: -120, gestureSourceType: 'touch', speed: 800 }).catch((e) => console.log('scroll gesture:', e.message));
  await cdp.send('Input.synthesizePinchGesture', { x: 420, y: 200, scaleFactor: 2.4, relativeSpeed: 500, gestureSourceType: 'touch' }).catch((e) => console.log('pinch gesture:', e.message));
  await touch('touchStart', [[300, 150, 9]]); // long press on the empty middle of the screen
  await sleep(900);
  await touch('touchEnd', []);
  await sleep(200);
  const pg = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollX: window.scrollX,
    docTop: document.documentElement.scrollTop + document.body.scrollTop,
    scale: window.visualViewport ? window.visualViewport.scale : 1,
    cm: window.__cm,
    sel: String(window.getSelection()),
    touchAction: getComputedStyle(document.querySelector('.tc-gas')).touchAction,
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  check('page does not scroll (scrollY == 0)', pg.scrollY === 0 && pg.scrollX === 0 && pg.docTop === 0, JSON.stringify({ y: pg.scrollY, x: pg.scrollX, top: pg.docTop }));
  check('page does not zoom (visualViewport.scale == 1, size unchanged)', pg.scale === 1 && pg.w === 844 && pg.h === 390, `scale ${pg.scale}, ${pg.w}x${pg.h}`);
  check('no long-press context menu / text selection', pg.cm.every(Boolean) && pg.sel === '', `contextmenu defaultPrevented: [${pg.cm}]`);
  check('touch buttons use touch-action: none', pg.touchAction === 'none', pg.touchAction);
  await ctx.close();
}

// =====================================================================================================================
// 3. Audio
// =====================================================================================================================
async function section_audio() {
  console.log('\n--- audio: offline renders of the real Sfx graph ---');
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  watch(page, 'audio');
  await page.goto(`${BASE}/?nosfx&lang=en`);
  await page.waitForFunction(() => window.__game && window.__game.Sfx, null, { timeout: 15000 });

  const table = [];
  for (const [name, spec] of Object.entries(lab.SOUNDS)) {
    const r = await lab.render(page, spec);
    table.push({ name, ...r });
  }
  console.log('\n  sound          peak    RMS     RMS dBFS');
  for (const r of table) console.log(`  ${r.name.padEnd(13)}  ${r.peak.toFixed(3)}   ${r.rms.toFixed(4)}  ${lab.db(r.rms).padStart(6)}`);
  const by = Object.fromEntries(table.map((r) => [r.name, r]));
  check('every sound renders (no NaN) and stays below full scale', table.every((r) => !r.nan && r.peak > 0.005 && r.peak < 0.99), table.map((r) => `${r.name}:${r.peak.toFixed(2)}`).join(' '));
  const worst = await lab.render(page, lab.WORST_CASE);
  console.log(`\n  worst-case mix (crash + big splash + horn + full engine + dog + thud + pop): peak ${worst.peak.toFixed(3)}  RMS ${worst.rms.toFixed(4)} (${lab.db(worst.rms)} dBFS)`);
  check('worst-case mix peak < 0.99', !worst.nan && worst.peak < 0.99, `peak ${worst.peak.toFixed(3)}`);
  // without the compressor the same mix would clip: prove the bus is doing work by comparing with a sum of the singles
  const sumPeaks = table.filter((r) => ['horn', 'dog', 'splash-big', 'crash', 'engine-full', 'thud'].includes(r.name)).reduce((a, r) => a + r.peak, 0);
  console.log(`  (sum of the individual peaks would be ${sumPeaks.toFixed(2)})`);
  check('engine at full throttle is about 30% of the horn (RMS ratio 20-40%, peak ratio < 35%)', by['engine-full'].rms / by.horn.rms > 0.2 && by['engine-full'].rms / by.horn.rms < 0.4 && by['engine-full'].peak / by.horn.peak < 0.35, `rms ratio ${(by['engine-full'].rms / by.horn.rms).toFixed(2)}, peak ratio ${(by['engine-full'].peak / by.horn.peak).toFixed(2)}`);
  check('levels are roughly balanced: every one-shot RMS within 12 dB of the horn', table.filter((r) => !r.name.startsWith('engine')).every((r) => Math.abs(20 * Math.log10(r.rms / by.horn.rms)) < 12), table.filter((r) => !r.name.startsWith('engine')).map((r) => `${r.name}:${(20 * Math.log10(r.rms / by.horn.rms)).toFixed(1)}dB`).join(' '));
  check('engine idle is very light (>= 15 dB below full throttle)', by['engine-full'].rms / by['engine-idle'].rms > 5.6, `idle ${lab.db(by['engine-idle'].rms)} dB vs full ${lab.db(by['engine-full'].rms)} dB`);

  // idle fade: standing still without throttle for >1.5 s fades to (almost) silence
  const idle = await lab.render(page, { duration: 5, rmsWindow: [0, 1], events: lab.engineEvents(0, 0, 5), windows: [[0.3, 1.2], [3.5, 5]] });
  check('idle engine fades to almost silence after ~1.5 s', idle.windows[1].rms < idle.windows[0].rms * 0.15, `first second ${lab.db(idle.windows[0].rms)} dB -> last 1.5 s ${lab.db(idle.windows[1].rms)} dB`);
  // ... and comes back when the throttle is touched
  const revive = await lab.render(page, { duration: 6, rmsWindow: [0, 1], events: [...lab.engineEvents(0, 0, 3.5), ...lab.engineEvents(0.3, 0.8, 6).filter((e) => e.t >= 3.5)], windows: [[2.8, 3.5], [4.5, 6]] });
  check('throttle brings the engine back after the fade', revive.windows[1].rms > revive.windows[0].rms * 5, `${lab.db(revive.windows[0].rms)} dB -> ${lab.db(revive.windows[1].rms)} dB`);

  // putt-putt: the idle engine is amplitude-modulated at the firing rate (not a constant buzz)
  const mod = await lab.render(page, { duration: 1.4, rmsWindow: [0, 1], events: lab.engineEvents(0, 0.3, 1.4).map((e) => ({ ...e, args: [0.1, 0.3, true] })), wantSamples: true });
  {
    const pcm = new Int16Array(Buffer.from(mod.b64, 'base64').buffer.slice(0, Buffer.from(mod.b64, 'base64').length));
    const sr = lab.SR;
    const blk = Math.round(sr * 0.01);
    const env = [];
    for (let i = Math.round(sr * 0.5); i + blk < pcm.length; i += blk) {
      let s = 0;
      for (let j = 0; j < blk; j++) s += (pcm[i + j] / 32768) ** 2;
      env.push(Math.sqrt(s / blk));
    }
    const max = Math.max(...env);
    const min = Math.min(...env);
    check('engine sounds like putt-putt: strong amplitude modulation (envelope max/min > 3)', max / Math.max(min, 1e-6) > 3, `envelope ${min.toFixed(4)}..${max.toFixed(4)} over ${env.length} x 10 ms`);
  }

  // splash spam (A4): hammer spill() every 50 ms for 3 s -> splashes limited to one per >= 600 ms
  const spam = await page.evaluate(async () => {
    const ctx = new OfflineAudioContext(1, 44100 * 4, 44100);
    const sfx = new window.__game.Sfx(true, { ctx });
    let noise = 0;
    let ticks = 0;
    const nb = sfx.noiseBurst.bind(sfx);
    const tn = sfx.tone.bind(sfx);
    sfx.noiseBurst = (...a) => { noise++; return nb(...a); };
    sfx.tone = (...a) => { ticks++; return tn(...a); };
    for (let t = 0; t < 3; t += 0.05) { sfx.clockOffset = t; sfx.spill(0.5); }
    const splashes = noise;
    noise = 0; ticks = 0;
    for (let t = 0; t < 3; t += 0.05) { sfx.clockOffset = 3.5 + t; sfx.spill(0.02); }
    return { splashes, drips: ticks / 2, dripNoise: noise };
  });
  check('continuous big spill: at most one splash per 600 ms (<= 5 in 3 s, was 12)', spam.splashes >= 1 && spam.splashes <= 5, `${spam.splashes} splashes`);
  check('continuous small spill: soft drips, rate limited, no splash noise', spam.drips >= 1 && spam.drips <= 9 && spam.dripNoise === 0, `${spam.drips} drips, ${spam.dripNoise} noise bursts`);

  // mute silences everything in the graph
  const muted = await lab.render(page, { duration: 2, rmsWindow: [0, 1], events: [...lab.engineEvents(1, 1, 2), { t: 0.1, call: 'horn', args: [] }, { t: 0.9, call: 'setMuted', args: [true] }, { t: 1.0, call: 'horn', args: [] }, { t: 1.0, call: 'crash', args: [] }], windows: [[0.2, 0.8], [1.1, 2]] });
  check('mute silences the output (peak after mute < 1e-4)', muted.windows[0].peak > 0.01 && muted.windows[1].peak < 1e-4, `before ${muted.windows[0].peak.toFixed(3)}, after ${muted.windows[1].peak.toExponential(1)}`);
  await ctx.close();

  // ---------------------------------------------------------------- live page: hidden tab, mute button, persistence
  console.log('\n--- audio: live page (hidden tab, mute, persistence) ---');
  const lctx = await browser.newContext(DESKTOP);
  const lp = await lctx.newPage();
  watch(lp, 'audio-live');
  await lp.goto(`${BASE}/?solo&seed=1&autostart&lang=en&duration=300`);
  await lp.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
  await lp.mouse.click(640, 360); // a gesture unlocks the AudioContext
  await sleep(500);
  const audio = () => lp.evaluate(() => window.__game.debug.audio());
  await dbg(lp, 'setInput', { throttle: 1 });
  await sleep(1500);
  let a = await audio();
  check('audio unlocks on a gesture and the engine sounds while riding', a.ctxState === 'running' && a.engineGain > 0.004 && !a.muted, JSON.stringify(a));
  check('output level is non-zero while the engine runs (analyser tap)', a.level > 1e-4, `level ${a.level.toExponential(2)}`);
  const hide = (hidden) => lp.evaluate((hidden) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await hide(true);
  await sleep(700);
  a = await audio();
  check('tab hidden: AudioContext suspended (or engine gain ~ 0)', a.ctxState === 'suspended' || a.engineGain < 0.002, JSON.stringify(a));
  await hide(false);
  await sleep(1200);
  a = await audio();
  check('tab visible again: AudioContext running and the engine is back (throttle still held)', a.ctxState === 'running' && a.engineGain > 0.004, JSON.stringify(a));
  // pagehide / pageshow
  await lp.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await sleep(500);
  a = await audio();
  check('pagehide: AudioContext suspended (or engine gain ~ 0)', a.ctxState === 'suspended' || a.engineGain < 0.002, JSON.stringify(a));
  await lp.evaluate(() => { window.dispatchEvent(new Event('pageshow')); });
  await sleep(1000);
  a = await audio();
  check('pageshow: engine back', a.ctxState === 'running' && a.engineGain > 0.004, JSON.stringify(a));

  // frozen rAF (no hidden event): the watchdog fades the engine when nobody feeds it
  await lp.evaluate(() => { window.__rafOrig = window.requestAnimationFrame; window.requestAnimationFrame = () => 0; });
  await lp.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  // (the running loop already scheduled its next frame; wait for it to drain)
  await sleep(1500);
  a = await audio();
  check('rAF stalled without a visibility event: watchdog fades the engine', a.engineGain < 0.002, JSON.stringify(a));
  await lp.evaluate(() => { window.requestAnimationFrame = window.__rafOrig; });
  await lp.reload();
  await lp.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
  await lp.mouse.click(640, 360);
  await sleep(500);

  // menu / results are silent: end the round, engine must be 0
  await dbg(lp, 'setInput', { throttle: 1 });
  await sleep(1000);
  await dbg(lp, 'endGame');
  await lp.waitForFunction(() => window.__game.getState().phase === 'results', null, { timeout: 10000 });
  await sleep(900);
  a = await audio();
  check('results screen: engine is silent', a.engineGain < 0.002, JSON.stringify(a));
  await lp.getByRole('button', { name: /Back to menu/i }).click();
  await lp.waitForFunction(() => window.__game.getState().phase === 'menu', null, { timeout: 10000 });
  await sleep(600);
  a = await audio();
  check('menu: engine is silent', a.engineGain < 0.002, JSON.stringify(a));

  // mute: M key, HUD button, menu button; persistence across reload
  await lp.goto(`${BASE}/?solo&seed=1&autostart&lang=en&duration=300`);
  await lp.waitForFunction(() => window.__game?.getState().phase === 'playing', null, { timeout: 20000 });
  await lp.mouse.click(640, 360);
  await sleep(400);
  await dbg(lp, 'honk');
  await sleep(250);
  const loud = await audio();
  check('unmuted: horn is audible at the output', !loud.muted && loud.level > 5e-4, `level ${loud.level.toExponential(2)}`);
  await sleep(1200);
  await lp.keyboard.press('KeyM');
  await sleep(400);
  const m1 = await audio();
  const hudIcon = await lp.textContent('.hud-mute');
  check('M key mutes (master gain 0, HUD icon switches)', m1.muted && m1.masterGain < 0.001 && hudIcon.includes('🔇'), `masterGain ${m1.masterGain}, icon ${hudIcon}`);
  await dbg(lp, 'honk');
  await dbg(lp, 'setInput', { throttle: 1 });
  await sleep(500);
  const m2 = await audio();
  check('muted: nothing reaches the output even with horn + engine', m2.level < 1e-4, `level ${m2.level.toExponential(2)}`);
  const stored = await lp.evaluate(() => localStorage.getItem('dc.muted'));
  check('mute is saved to localStorage', stored === '1', String(stored));
  await lp.goto(`${BASE}/?lang=en`); // reload onto the menu
  await lp.waitForFunction(() => window.__game, null, { timeout: 15000 });
  await sleep(300);
  const afterReload = await lp.evaluate(() => ({ muted: window.__game.getState().muted, menuIcon: document.querySelector('.menu-tools [data-k=mute]')?.textContent, info: window.__game.debug.audio() }));
  check('mute persists across a reload (state + menu button)', afterReload.muted === true && afterReload.menuIcon.includes('🔇'), JSON.stringify({ m: afterReload.muted, i: afterReload.menuIcon }));
  await lp.click('.menu-tools [data-k=mute]');
  await sleep(200);
  const unm = await lp.evaluate(() => ({ muted: window.__game.getState().muted, stored: localStorage.getItem('dc.muted') }));
  check('menu mute button toggles and saves (unmute)', unm.muted === false && unm.stored === '0', JSON.stringify(unm));
  await lctx.close();
}

// =====================================================================================================================
// 4. Bilingual multiplayer
// =====================================================================================================================
async function section_multi() {
  console.log('\n--- bilingual multiplayer: zh host + en guest (+ an unnamed en guest) in one room ---');
  const mk = async (tag) => {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
    const page = await ctx.newPage();
    watch(page, tag);
    return { ctx, page };
  };
  const A = await mk('multi-A-zh');
  const B = await mk('multi-B-en');
  const D = await mk('multi-D-en');
  try {
    await A.page.goto(`${BASE}/?create&name=Alex&lang=zh&nosfx&duration=30`);
    await A.page.waitForFunction(() => window.__game?.getState().roomCode, null, { timeout: 15000 });
    const code = (await st(A.page)).roomCode;
    await B.page.goto(`${BASE}/?room=${code}&name=Bea&lang=en&nosfx`);
    await B.page.waitForFunction(() => window.__game?.getState().phase === 'lobby', null, { timeout: 15000 });
    await D.page.goto(`${BASE}/?room=${code}&lang=en&nosfx`);
    await D.page.waitForFunction(() => window.__game?.getState().phase === 'lobby', null, { timeout: 15000 });
    await A.page.waitForFunction(() => window.__game.getState().players.length === 3, null, { timeout: 10000 });
    await sleep(400);
    const lobA = await A.page.textContent('.lobby');
    const lobB = await B.page.textContent('.lobby');
    check('lobby: zh client sees Chinese UI and the unnamed player as 骑手3', CJK.test(lobA) && lobA.includes('骑手3') && lobA.includes('房主'), lobA.replace(/\s+/g, ' ').slice(0, 80));
    check('lobby: en client sees English UI and the unnamed player as Rider 3', !CJK.test(lobB) && lobB.includes('Rider 3') && lobB.includes('Host'), lobB.replace(/\s+/g, ' ').slice(0, 80));

    await A.page.getByRole('button', { name: /开始|Start/i }).click();
    await Promise.all([A, B, D].map(({ page }) => page.waitForFunction(() => window.__game.getState().phase === 'playing', null, { timeout: 20000 })));
    await sleep(1200);

    const cardsA = await A.page.$$eval('.order .order-name', (n) => n.map((e) => e.textContent));
    const cardsB = await B.page.$$eval('.order .order-name', (n) => n.map((e) => e.textContent));
    check('order cards: zh client shows Chinese place names', cardsA.length > 0 && cardsA.every((t) => CJK.test(t)), cardsA[0]);
    check('order cards: en client shows English place names (no CJK)', cardsB.length > 0 && cardsB.every((t) => !CJK.test(t)), cardsB[0]);
    const hudA = await A.page.textContent('.hud-tl');
    const hudB = await B.page.textContent('.hud-tl');
    check('HUD labels follow each client language', hudA.includes('团队小费') && hudB.includes('Team tips'), `${hudA.replace(/\s+/g, ' ').trim()} / ${hudB.replace(/\s+/g, ' ').trim()}`);
    const sa = await st(A.page);
    const sb = await st(B.page);
    check('same order pool on both clients', sa.orders.map((o) => o.id).sort().join() === sb.orders.map((o) => o.id).sort().join());

    // --- A delivers (a no-horn order if possible, honk near the dog -> dog text)
    const deliver = async (who, other, label) => {
      const s = await st(who.page);
      const o = s.orders.find((x) => x.status === 'waiting' && x.request !== 'backDoor') || s.orders.find((x) => x.status === 'waiting');
      await dbg(who.page, 'giveOrder', o.id);
      await sleep(500);
      const loc = await dbg(who.page, 'location', o.request === 'backDoor' ? `${o.customerId}b` : o.customerId);
      await dbg(who.page, 'setInput', { throttle: 0, brake: 0, steer: 0 });
      await dbg(who.page, 'teleport', loc[0], loc[1]);
      await who.page.waitForSelector('.tipcard', { timeout: 8000 }).catch(() => {});
      await sleep(250);
      const tip = await who.page.evaluate(() => document.querySelector('.tipcard')?.textContent || '');
      // software-GL pages are slow: give the other client's message handler time to run (bubbles live for 3.2 s)
      await Promise.all([other.page.waitForSelector('.bubble', { timeout: 2500 }), who.page.waitForSelector('.bubble', { timeout: 2500 })]).catch(() => {});
      const bubbleOther = await other.page.evaluate(() => [...document.querySelectorAll('.bubble')].map((e) => e.textContent).join(' | '));
      const bubbleSelf = await who.page.evaluate(() => [...document.querySelectorAll('.bubble')].map((e) => e.textContent).join(' | '));
      return { tip, bubbleOther, bubbleSelf, order: o };
    };
    const dA = await deliver(A, B, 'A');
    check('A (zh) delivery: tip popup in Chinese (own language)', CJK.test(dA.tip) && dA.tip.includes('完整度'), dA.tip.slice(0, 80));
    check('A (zh) delivery: B (en) sees the customer bubble in English', dA.bubbleOther.length > 0 && !CJK.test(dA.bubbleOther), dA.bubbleOther);
    check('A (zh) delivery: A sees the customer bubble in Chinese', CJK.test(dA.bubbleSelf), dA.bubbleSelf);
    await sleep(3600);
    const dB = await deliver(B, A, 'B');
    check('B (en) delivery: tip popup in English (own language)', dB.tip.length > 0 && !CJK.test(dB.tip) && /Intact \d+%/.test(dB.tip) && /¥/.test(dB.tip), dB.tip.slice(0, 80));
    check('B (en) delivery: A (zh) sees the customer bubble in Chinese', CJK.test(dB.bubbleOther), dB.bubbleOther);
    check('B (en) delivery: B sees the customer bubble in English', dB.bubbleSelf.length > 0 && !CJK.test(dB.bubbleSelf), dB.bubbleSelf);
    await sleep(500);
    const tipsA = (await st(A.page)).teamTips;
    const tipsB = (await st(B.page)).teamTips;
    check('team tips shared and equal', tipsA > 0 && tipsA === tipsB, `${tipsA} / ${tipsB}`);

    // --- results in each language
    await A.page.waitForFunction(() => window.__game.getState().phase === 'results', null, { timeout: 45000 });
    await B.page.waitForFunction(() => window.__game.getState().phase === 'results', null, { timeout: 15000 });
    await sleep(1200);
    const resA = await A.page.textContent('.results');
    const resB = await B.page.textContent('.results');
    const resD = await D.page.textContent('.results');
    check('results: zh client text is Chinese ("本局结算", 骑手3)', resA.includes('本局结算') && resA.includes('团队小费') && resA.includes('骑手3'), resA.replace(/\s+/g, ' ').slice(0, 70));
    check('results: en client text is English, no CJK, unnamed player is "Rider 3"', resB.includes('Round results') && resB.includes('Team tips') && resB.includes('Rider 3') && !CJK.test(resB), resB.replace(/\s+/g, ' ').slice(0, 70));
    check('results: the third (en) client also sees English only', !CJK.test(resD));
    const awA = await A.page.$$eval('.award .t', (n) => n.map((e) => e.textContent));
    const awB = await B.page.$$eval('.award .t', (n) => n.map((e) => e.textContent));
    check('results: award titles are localized per client', awA.length > 0 && awA.length === awB.length && awA.every((t) => CJK.test(t)) && awB.every((t) => !CJK.test(t)), `${awA.join(',')} / ${awB.join(',')}`);
    await A.page.screenshot({ path: path.join(OUT, 'multi-zh-results.png') });
    await B.page.screenshot({ path: path.join(OUT, 'multi-en-results.png') });
  } catch (e) {
    check('multiplayer script ran without exception', false, e.message.split('\n')[0]);
    await A.page.screenshot({ path: path.join(OUT, 'multi-failure-A.png') }).catch(() => {});
    await B.page.screenshot({ path: path.join(OUT, 'multi-failure-B.png') }).catch(() => {});
  }
  await A.ctx.close();
  await B.ctx.close();
  await D.ctx.close();
}

// =====================================================================================================================
// 5. Language selection, menu behaviour, phone sharing
// =====================================================================================================================
async function section_menu() {
  console.log('\n--- language detection / toggle / persistence, room-code input, navigator.share ---');
  // browser language zh-CN -> Chinese, no URL override, nothing stored
  const zhCtx = await browser.newContext({ ...DESKTOP, locale: 'zh-CN' });
  const p = await zhCtx.newPage();
  watch(p, 'lang');
  await p.goto(`${BASE}/?nosfx`);
  await p.waitForFunction(() => window.__game, null, { timeout: 15000 });
  check('navigator.language zh-CN -> Chinese UI by default', (await st(p)).lang === 'zh' && CJK.test(await p.textContent('.screen:not(.disconnect) .card .title')));
  // type a name, switch to EN: name kept, UI English, preference saved
  await p.fill('#dc-name', 'Mimi');
  await p.click('.langsw [data-lang="en"]');
  await sleep(150);
  const afterToggle = await p.evaluate(() => ({ lang: window.__game.getState().lang, name: document.querySelector('#dc-name').value, stored: localStorage.getItem('dc.lang'), htmlLang: document.documentElement.lang, title: document.title, solo: document.querySelector('[data-k=solo]').textContent }));
  check('EN button switches the menu live, keeps the typed name, saves the choice', afterToggle.lang === 'en' && afterToggle.name === 'Mimi' && afterToggle.stored === 'en' && afterToggle.htmlLang === 'en' && afterToggle.title === 'Delivery Chaos' && afterToggle.solo === 'Solo practice', JSON.stringify(afterToggle));
  await p.goto(`${BASE}/?nosfx`);
  await p.waitForFunction(() => window.__game, null, { timeout: 15000 });
  check('saved preference beats the browser language after a reload (zh-CN browser, saved en -> English)', (await st(p)).lang === 'en');
  await p.goto(`${BASE}/?nosfx&lang=zh`);
  await p.waitForFunction(() => window.__game, null, { timeout: 15000 });
  const ov = await p.evaluate(() => ({ lang: window.__game.getState().lang, stored: localStorage.getItem('dc.lang') }));
  check('?lang=zh overrides the saved preference without overwriting it', ov.lang === 'zh' && ov.stored === 'en', JSON.stringify(ov));
  await zhCtx.close();

  const enCtx = await browser.newContext({ ...DESKTOP, locale: 'fr-FR' });
  const q = await enCtx.newPage();
  watch(q, 'lang2');
  await q.goto(`${BASE}/?nosfx`);
  await q.waitForFunction(() => window.__game, null, { timeout: 15000 });
  check('any non-Chinese browser language -> English', (await st(q)).lang === 'en');
  // blocked localStorage must not break anything
  await enCtx.close();
  const blocked = await browser.newContext(DESKTOP);
  const bp = await blocked.newPage();
  watch(bp, 'nostorage');
  await bp.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await bp.goto(`${BASE}/?nosfx`);
  await bp.waitForFunction(() => window.__game, null, { timeout: 15000 });
  await bp.click('.langsw [data-lang="zh"]');
  await bp.click('.menu-tools [data-k=mute]');
  await sleep(150);
  check('localStorage that throws: menu, language toggle and mute still work', (await st(bp)).lang === 'zh' && (await st(bp)).muted === true);
  await blocked.close();

  // room code box: letters only, upper-case, 4 characters
  const c = await browser.newContext(DESKTOP);
  const cp = await c.newPage();
  watch(cp, 'code');
  await cp.goto(`${BASE}/?nosfx&lang=en`);
  await cp.waitForFunction(() => window.__game, null, { timeout: 15000 });
  await cp.click('[data-k=join]');
  await cp.type('#dc-code', 'ab1cdxyz');
  const codeVal = await cp.inputValue('#dc-code');
  check('room code input is upper-cased, letters only, max 4', codeVal === 'ABCD', codeVal);
  const attrs = await cp.evaluate(() => ({ cap: document.querySelector('#dc-code').getAttribute('autocapitalize'), fs: getComputedStyle(document.querySelector('#dc-code')).fontSize }));
  check('room code input asks phones for capitals and is >= 16px (no iOS focus zoom)', attrs.cap === 'characters' && parseFloat(attrs.fs) >= 16, JSON.stringify(attrs));
  await cp.fill('#dc-code', 'ZZZZ');
  await cp.click('[data-k=go]');
  await cp.waitForSelector('.notice-toast', { timeout: 8000 });
  const toast = await cp.textContent('.notice-toast');
  check('unknown room -> English error text from a server code', /Room not found/.test(toast) && !CJK.test(toast), toast);
  await c.close();

  // phone: navigator.share is preferred for the invite
  const m = await browser.newContext(MOBILE1);
  await m.addInitScript(() => { navigator.share = async (d) => { window.__shared = d; }; });
  const mp = await m.newPage();
  watch(mp, 'share');
  await mp.goto(`${BASE}/?create&name=Share&lang=en&nosfx`);
  await mp.waitForFunction(() => window.__game?.getState().roomCode, null, { timeout: 15000 });
  const label = await mp.textContent('.lobby .invite');
  await mp.click('.lobby .invite');
  await sleep(300);
  const shared = await mp.evaluate(() => window.__shared || null);
  const roomCode = (await st(mp)).roomCode;
  check('phone lobby offers "Share invite" and calls navigator.share with the room link', label === 'Share invite' && shared && shared.url.endsWith(`/?room=${roomCode}`) && shared.text.includes(roomCode), JSON.stringify({ label, shared }));
  await m.close();
  // no navigator.share (desktop): copies to the clipboard / falls back, with a toast
  const d = await browser.newContext({ ...DESKTOP, permissions: ['clipboard-read', 'clipboard-write'] });
  const dp = await d.newPage();
  watch(dp, 'copy');
  await dp.goto(`${BASE}/?create&name=Copy&lang=en&nosfx`);
  await dp.waitForFunction(() => window.__game?.getState().roomCode, null, { timeout: 15000 });
  const dlabel = await dp.textContent('.lobby .invite');
  await dp.click('.lobby .invite');
  await dp.waitForSelector('.notice-toast', { timeout: 5000 });
  const dtoast = await dp.textContent('.notice-toast');
  check('desktop lobby copies the invite link (toast in English)', dlabel === 'Copy invite link' && /Invite link copied/.test(dtoast), `${dlabel} / ${dtoast}`);
  await d.close();
}

// =====================================================================================================================
(async () => {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ARGS });
  try {
    if (ONLY.includes('shots')) await section_shots();
    if (ONLY.includes('touch')) await section_touch();
    if (ONLY.includes('audio')) await section_audio();
    if (ONLY.includes('multi')) await section_multi();
    if (ONLY.includes('menu')) await section_menu();
  } catch (e) {
    check('v02 script ran without exception', false, e.stack.split('\n').slice(0, 3).join(' '));
  }
  const benign = (e) => /WebSocket|closed|net::ERR_ABORTED/i.test(e);
  const real = errors.filter((e) => !benign(e));
  check('no console errors in any page', real.length === 0, real.slice(0, 5).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nscreenshots in ${OUT}: ${fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length} PNG files`);
  console.log(`${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
