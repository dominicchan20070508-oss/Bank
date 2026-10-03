// Renders every game sound offline (the REAL Sfx graph in headless Chromium) to 16-bit mono WAVs for listening.
//
//   npm run build && npm start &          # any server serving dist/ works
//   node qa/audio-export.cjs [baseUrl] [outDir]     # defaults: http://localhost:8080  qa/audio
//
// Files: engine-idle / engine-half / engine-full (3 s each), horn, dog, splash-small, splash-big, crash, thud,
// pickup, chime (delivery), fail, plus (v0.3) salvage, confirm, ping-<preset> x6, ping (all six in a row), test-sound
// (horn + chime, the volume-slider test) and worst-case-mix (everything at once, through the limiter). Prints peak / RMS.
// The volume slider is at its 80% default, exactly what a player hears.
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
const OUT = process.argv[3] || path.join(__dirname, 'audio');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?nosfx`);
  await page.waitForFunction(() => window.__game && window.__game.Sfx, null, { timeout: 15000 });

  const all = { ...lab.SOUNDS, 'worst-case-mix': lab.WORST_CASE };
  let total = 0;
  console.log('file                  seconds   peak    RMS     RMS dBFS   bytes');
  for (const [name, spec] of Object.entries(all)) {
    const r = await lab.render(page, { ...spec, wantSamples: true });
    const buf = lab.wav(r.b64);
    fs.writeFileSync(path.join(OUT, `${name}.wav`), buf);
    total += buf.length;
    console.log(`${(name + '.wav').padEnd(21)} ${spec.duration.toFixed(2).padStart(6)}   ${r.peak.toFixed(3)}   ${r.rms.toFixed(4)}  ${lab.db(r.rms).padStart(7)}    ${buf.length}`);
  }
  console.log(`\n${Object.keys(all).length} files, ${(total / 1024 / 1024).toFixed(2)} MB total -> ${OUT}`);
  await browser.close();
  if (errors.length) {
    console.log('console errors:', errors.slice(0, 5));
    process.exit(1);
  }
})();
