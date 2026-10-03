// Pure client-side pieces of v0.3: settings, first-session hints, wheel maths, the iOS audio-session fix, the server wake-up probe.
import { describe, expect, it } from 'vitest';
import { AudioSessionFix, isIOS, silentWavDataUri } from '../src/client/audioSession';
import { HealthMonitor } from '../src/client/health';
import { HintManager, HintStore, HINTS_KEY, HINT_MS, type HintId } from '../src/client/hints';
import { QuickGate, pingForDigit, sliceDir, stepIndex, wheelIndex } from '../src/client/quickWheel';
import { Settings, SETTING_KEYS } from '../src/client/settings';
import { memoryStore } from '../src/client/storage';
import { PING_IDS } from '../src/shared/pings';

describe('Settings', () => {
  it('auto-gas defaults to on for touch and off for keyboards; the stored choice wins and persists', () => {
    const store = memoryStore();
    const s = new Settings({ store });
    expect(s.autoGas(true)).toBe(true);
    expect(s.autoGas(false)).toBe(false);
    s.setAutoGas(false);
    expect(s.autoGas(true)).toBe(false);
    expect(store.data.get(SETTING_KEYS.autoGas)).toBe('0');
    expect(new Settings({ store }).autoGas(true)).toBe(false); // a new page view remembers it
    new Settings({ store }).setAutoGas(true);
    expect(new Settings({ store }).autoGas(false)).toBe(true);
  });
  it('a URL override wins and is not saved', () => {
    const store = memoryStore();
    const s = new Settings({ store, forceAutoGas: false });
    expect(s.autoGas(true)).toBe(false);
    expect(store.data.size).toBe(0);
  });
  it('steadier rack and mute-chat default to off, persist, and notify', () => {
    const store = memoryStore();
    const s = new Settings({ store });
    let n = 0;
    s.onChange(() => n++);
    expect([s.steadyRack, s.muteChat]).toEqual([false, false]);
    s.steadyRack = true;
    s.muteChat = true;
    expect(n).toBe(2);
    const again = new Settings({ store });
    expect([again.steadyRack, again.muteChat]).toEqual([true, true]);
  });
  it('safeStorage never throws even when localStorage is missing', async () => {
    const { safeStorage } = await import('../src/client/storage');
    expect(() => safeStorage.setItem('x', '1')).not.toThrow(); // node has no localStorage: the guard swallows the ReferenceError
    expect(safeStorage.getItem('x')).toBeNull();
  });
});

describe('first-session hints', () => {
  function rig(store = memoryStore()) {
    const shown: HintId[] = [];
    const hidden: HintId[] = [];
    const hs = new HintStore(store);
    const mgr = new HintManager(hs, (id) => shown.push(id), (id) => hidden.push(id));
    return { store, hs, mgr, shown, hidden };
  }
  it('each hint appears once, one at a time and in the order requested', () => {
    const { mgr, shown, hidden } = rig();
    mgr.request('start');
    mgr.request('approach');
    mgr.request('start'); // duplicate: ignored
    mgr.update(0);
    expect(shown).toEqual(['start']);
    mgr.update(HINT_MS - 100);
    expect(shown).toEqual(['start']); // still on screen: the next one waits
    mgr.update(HINT_MS + 1);
    expect(hidden).toEqual(['start']);
    mgr.update(HINT_MS + 2000);
    expect(shown).toEqual(['start', 'approach']);
    mgr.request('start'); // seen already
    mgr.update(HINT_MS * 3);
    mgr.update(HINT_MS * 3 + 1000);
    expect(shown).toEqual(['start', 'approach']);
  });
  it('a reload (new manager, same storage) never repeats a hint that was shown', () => {
    const a = rig();
    for (const id of ['start', 'cargo'] as const) a.mgr.request(id);
    a.mgr.update(0);
    a.mgr.update(HINT_MS + 1);
    a.mgr.update(HINT_MS + 1000);
    expect(JSON.parse(a.store.data.get(HINTS_KEY)!)).toEqual(['start', 'cargo']);
    const b = rig(a.store);
    for (const id of ['start', 'cargo', 'crash'] as const) b.mgr.request(id);
    for (let t = 0; t < 40000; t += 500) b.mgr.update(t);
    expect(b.shown).toEqual(['crash']);
  });
  it('garbage in storage is ignored; clear() removes the hint on screen', () => {
    const r = rig(memoryStore({ [HINTS_KEY]: '{not json' }));
    expect(r.hs.list()).toEqual([]);
    r.mgr.request('salvage');
    r.mgr.update(0);
    expect(r.mgr.current).toBe('salvage');
    r.mgr.clear();
    expect(r.mgr.current).toBeNull();
    expect(r.hidden).toEqual(['salvage']);
  });
});

describe('quick-chat wheel maths', () => {
  it('maps the pointer direction to six slices (0 = up, clockwise) and cancels in the centre', () => {
    expect(wheelIndex(0, -60)).toBe(0);
    expect(wheelIndex(52, -30)).toBe(1);
    expect(wheelIndex(52, 30)).toBe(2);
    expect(wheelIndex(0, 60)).toBe(3);
    expect(wheelIndex(-52, 30)).toBe(4);
    expect(wheelIndex(-52, -30)).toBe(5);
    expect(wheelIndex(5, -5)).toBeNull();
    expect(wheelIndex(0, 0)).toBeNull();
    expect(wheelIndex(Number.NaN, 10)).toBeNull();
    // 30 degrees off a slice centre is the boundary; a little either side flips the slice
    expect(wheelIndex(Math.sin(0.5), -Math.cos(0.5) * 1)).toBeNull(); // inside the dead zone (unit vector)
    expect(wheelIndex(100 * Math.sin((29 * Math.PI) / 180), -100 * Math.cos((29 * Math.PI) / 180))).toBe(0);
    expect(wheelIndex(100 * Math.sin((31 * Math.PI) / 180), -100 * Math.cos((31 * Math.PI) / 180))).toBe(1);
  });
  it('slice directions round-trip through wheelIndex', () => {
    for (let i = 0; i < 6; i++) {
      const d = sliceDir(i);
      expect(wheelIndex(d.x * 80, d.y * 80)).toBe(i);
    }
  });
  it('arrow keys step around the wheel', () => {
    expect(stepIndex(null, 1)).toBe(0);
    expect(stepIndex(null, -1)).toBe(5);
    expect(stepIndex(5, 1)).toBe(0);
    expect(stepIndex(0, -1)).toBe(5);
  });
  it('digits 1-6 (row and numpad) pick the presets in wheel order', () => {
    PING_IDS.forEach((id, i) => {
      expect(pingForDigit(`Digit${i + 1}`)).toBe(id);
      expect(pingForDigit(`Numpad${i + 1}`)).toBe(id);
    });
    expect(pingForDigit('Digit7')).toBeNull();
    expect(pingForDigit('Digit0')).toBeNull();
    expect(pingForDigit('KeyH')).toBeNull();
  });
  it('the sender throttle allows one message per 1.5 s', () => {
    const g = new QuickGate();
    expect(g.take(1000)).toBe(true);
    expect(g.take(2000)).toBe(false);
    expect(g.take(2499)).toBe(false);
    expect(g.take(2500)).toBe(true);
  });
});

describe('iOS silent-switch fix', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  it('uses navigator.audioSession.type = "playback" when the browser has it', () => {
    const nav = { audioSession: { type: 'auto' }, userAgent: IPHONE };
    const created: unknown[] = [];
    const fix = new AudioSessionFix(nav, { createElement: (t) => (created.push(t), {}) });
    expect(fix.apply()).toBe('audioSession');
    expect(nav.audioSession.type).toBe('playback');
    expect(created).toHaveLength(0); // no element needed
    expect(fix.apply()).toBe('audioSession'); // idempotent
  });
  it('falls back to a looping silent <audio> element on iOS without audioSession', () => {
    const plays: string[] = [];
    const el = { src: '', loop: false, setAttribute: () => {}, play: () => (plays.push('play'), Promise.resolve()), style: { display: '' } };
    const appended: unknown[] = [];
    const fix = new AudioSessionFix({ userAgent: IPHONE }, { createElement: () => el, body: { appendChild: (n) => appended.push(n) } });
    expect(fix.apply()).toBe('audioElement');
    expect(el.loop).toBe(true);
    expect(el.src.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(appended).toEqual([el]);
    fix.apply();
    expect(plays).toHaveLength(2); // retried on every gesture
    expect(appended).toHaveLength(1); // ... but only one element
  });
  it('recognises iPadOS (reports as a Mac with touch) and leaves desktop / Android alone', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile' })).toBe(false);
    const fix = new AudioSessionFix({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120' }, { createElement: () => { throw new Error('should not be created'); } });
    expect(fix.apply()).toBe('none');
  });
  it('never throws: a setter that throws, a play() that rejects or throws', () => {
    const thrower = { get audioSession(): never { throw new Error('nope'); }, userAgent: IPHONE } as unknown as { audioSession?: { type: string }; userAgent: string };
    const el = { src: '', loop: false, play: () => Promise.reject(new Error('NotAllowedError')) };
    expect(() => new AudioSessionFix(thrower, { createElement: () => el }).apply()).not.toThrow();
    const el2 = { src: '', loop: false, play: () => { throw new Error('boom'); } };
    expect(() => new AudioSessionFix({ userAgent: IPHONE }, { createElement: () => el2 }).apply()).not.toThrow();
    const frozen = Object.freeze({ type: 'auto' });
    expect(() => new AudioSessionFix({ audioSession: frozen, userAgent: IPHONE }, null).apply()).not.toThrow();
  });
  it('the silent clip is a valid tiny WAV', () => {
    const uri = silentWavDataUri(100, 8000);
    const bin = Buffer.from(uri.split(',')[1]!, 'base64');
    expect(bin.subarray(0, 4).toString()).toBe('RIFF');
    expect(bin.subarray(8, 12).toString()).toBe('WAVE');
    expect(bin.length).toBe(44 + 200);
    expect(bin.subarray(44).every((b) => b === 0)).toBe(true);
  });
});

describe('server wake-up probe', () => {
  function clock() {
    let t = 0;
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let id = 0;
    return {
      now: () => t,
      setTimer: (fn: () => void, ms: number) => {
        timers.push({ at: t + ms, fn, id: ++id });
        return id;
      },
      clearTimer: (h: unknown) => {
        const i = timers.findIndex((x) => x.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
      advance: async (ms: number) => {
        const end = t + ms;
        for (;;) {
          timers.sort((a, b) => a.at - b.at);
          const nxt = timers[0];
          if (!nxt || nxt.at > end) break;
          timers.shift();
          t = nxt.at;
          nxt.fn();
          await Promise.resolve();
          await Promise.resolve();
        }
        t = end;
      },
    };
  }
  it('keeps asking /healthz until it answers 200, counting the seconds waited', async () => {
    const c = clock();
    let calls = 0;
    const m = new HealthMonitor({
      ...c,
      fetchFn: async (url) => {
        calls++;
        expect(url).toBe('/healthz');
        if (calls < 4) throw new Error('503 / no route yet');
        return { ok: true };
      },
    });
    const states: string[] = [];
    m.onChange((s) => states.push(s));
    m.start();
    await c.advance(10);
    expect(m.state).toBe('checking');
    await c.advance(5000);
    expect(m.waitedSeconds()).toBeGreaterThanOrEqual(0);
    await c.advance(2000);
    expect(m.state).toBe('up');
    expect(states).toEqual(['up']);
    expect(calls).toBe(4);
    const waited = m.waitedSeconds();
    await c.advance(20000);
    expect(m.waitedSeconds()).toBe(waited); // frozen once up
    expect(calls).toBe(4);
  });
  it('treats a non-200 answer as "still waking" and a 200 as up', async () => {
    const c = clock();
    const answers = [{ ok: false }, { ok: true }];
    const m = new HealthMonitor({ ...c, fetchFn: async () => answers.shift()! });
    m.start();
    await c.advance(10);
    expect(m.up).toBe(false);
    await c.advance(2100);
    expect(m.up).toBe(true);
  });
});
