// Shared by qa/v02.cjs and qa/audio-export.cjs: renders the REAL Sfx graph (window.__game.Sfx) in an
// OfflineAudioContext inside the page and reports peak / RMS (and optionally the samples).
//
// A "spec" is { duration, rmsWindow: [t0, t1], events: [{ t, call, args }] } where `call` is a Sfx method.
// Events are laid out on the timeline with sfx.clockOffset (the Sfx accepts an injected BaseAudioContext).

const SR = 44100;

/** per-sound recipes (nominal length = the RMS window) */
function engineEvents(speed, throttle, seconds) {
  const ev = [];
  for (let t = 0; t < seconds; t += 1 / 60) ev.push({ t, call: 'setEngine', args: [speed, throttle, true] }); // a call per frame, like the game
  return ev;
}

const SOUNDS = {
  'engine-idle': { duration: 3, rmsWindow: [0, 3], events: engineEvents(0, 0, 3) },
  'engine-half': { duration: 3, rmsWindow: [0.4, 3], events: engineEvents(0.5, 0.6, 3) },
  'engine-full': { duration: 3, rmsWindow: [0.4, 3], events: engineEvents(1, 1, 3) },
  horn: { duration: 0.85, rmsWindow: [0, 0.6], events: [{ t: 0.02, call: 'horn', args: [] }] },
  dog: { duration: 0.95, rmsWindow: [0, 0.8], events: [{ t: 0.02, call: 'dogBark', args: [] }] },
  'splash-small': { duration: 0.5, rmsWindow: [0, 0.3], events: [{ t: 0.02, call: 'spill', args: [0.03] }] },
  'splash-big': { duration: 0.95, rmsWindow: [0, 0.7], events: [{ t: 0.02, call: 'spill', args: [0.5] }] },
  crash: { duration: 0.95, rmsWindow: [0, 0.7], events: [{ t: 0.02, call: 'crash', args: [] }] },
  thud: { duration: 0.4, rmsWindow: [0, 0.25], events: [{ t: 0.02, call: 'thud', args: [0.7] }] },
  pickup: { duration: 0.5, rmsWindow: [0, 0.35], events: [{ t: 0.02, call: 'pickup', args: [] }] },
  chime: { duration: 1.1, rmsWindow: [0, 0.9], events: [{ t: 0.02, call: 'chime', args: [] }] },
  fail: { duration: 0.5, rmsWindow: [0, 0.35], events: [{ t: 0.02, call: 'fail', args: [] }] },
  // v0.3
  salvage: { duration: 0.7, rmsWindow: [0, 0.5], events: [{ t: 0.02, call: 'salvage', args: [] }] },
  confirm: { duration: 0.5, rmsWindow: [0, 0.35], events: [{ t: 0.02, call: 'confirm', args: [] }] },
};
const PING_IDS = ['claim', 'help', 'wait', 'follow', 'thanks', 'nice'];
for (const id of PING_IDS) SOUNDS[`ping-${id}`] = { duration: 0.6, rmsWindow: [0, 0.4], events: [{ t: 0.02, call: 'ping', args: [id] }] };
/** all six quick-chat sounds one after the other (for listening) */
SOUNDS.ping = { duration: 0.8 * PING_IDS.length, rmsWindow: [0, 0.4], events: PING_IDS.map((id, i) => ({ t: 0.02 + i * 0.8, call: 'ping', args: [id] })) };
/** volume-slider test sound: horn + chime */
SOUNDS['test-sound'] = { duration: 1.9, rmsWindow: [0, 1.5], events: [{ t: 0.02, call: 'testSound', args: [] }] };

/** the sounds that must be loud enough for a phone speaker: single-sound peak 0.6-0.8 at the default volume */
const MAIN_SOUNDS = ['horn', 'dog', 'crash', 'chime', 'pickup', 'salvage', 'ping-claim', 'ping-help', 'ping-nice'];

/** crash + big splash + horn + full-throttle engine + dog bark (+ chime, ping, salvage), all overlapping */
const WORST_CASE = {
  duration: 2.5,
  rmsWindow: [0.3, 1.5],
  events: [
    ...engineEvents(1, 1, 2.5),
    { t: 0.5, call: 'crash', args: [] },
    { t: 0.5, call: 'spill', args: [1, true] },
    { t: 0.5, call: 'horn', args: [] },
    { t: 0.55, call: 'dogBark', args: [] },
    { t: 0.55, call: 'thud', args: [1] },
    { t: 0.7, call: 'pop', args: [] },
    { t: 0.6, call: 'chime', args: [] },
    { t: 0.6, call: 'ping', args: ['help'] },
    { t: 0.65, call: 'salvage', args: [] },
  ],
};

/** runs inside the page */
async function inPage(spec) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(spec.duration * sr), sr);
  const sfx = new window.__game.Sfx(true, { ctx, muted: !!spec.muted, ...(spec.volume !== undefined ? { volume: spec.volume } : {}) });
  const events = [...spec.events].sort((a, b) => a.t - b.t);
  for (const ev of events) {
    if (ev.call === 'setMuted') {
      sfx.clockOffset = ev.t;
      sfx.setMuted(ev.args[0]);
      continue;
    }
    sfx.clockOffset = ev.t;
    sfx[ev.call](...ev.args);
  }
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  const stat = (a, b) => {
    const i0 = Math.max(0, Math.floor(a * sr));
    const i1 = Math.min(d.length, Math.ceil(b * sr));
    let peak = 0;
    let sum = 0;
    for (let i = i0; i < i1; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      sum += d[i] * d[i];
    }
    return { peak, rms: Math.sqrt(sum / Math.max(1, i1 - i0)) };
  };
  const all = stat(0, spec.duration);
  const win = stat(spec.rmsWindow[0], spec.rmsWindow[1]);
  const out = { peak: all.peak, rms: win.rms, windowPeak: win.peak, nan: d.some((v) => !Number.isFinite(v)) };
  if (spec.wantSamples) {
    const i16 = new Int16Array(d.length);
    for (let i = 0; i < d.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767)));
    const u8 = new Uint8Array(i16.buffer);
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    out.b64 = btoa(bin);
  }
  if (spec.windows) out.windows = spec.windows.map(([a, b]) => stat(a, b));
  return out;
}

async function render(page, spec) {
  return page.evaluate(inPage, spec);
}

/** 16-bit mono PCM -> WAV file buffer */
function wav(b64) {
  const pcm = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');

module.exports = { SOUNDS, WORST_CASE, MAIN_SOUNDS, PING_IDS, engineEvents, render, wav, db, SR };
