// iPhone silent-switch fix (DESIGN §14.2). Web Audio on iOS follows the "ringer" category, so the side mute switch silences
// the whole game. Two cures, both guarded by try/catch and both injectable for tests:
//   1. navigator.audioSession.type = 'playback'   (Safari 16.4+): the page then plays like a media player.
//   2. otherwise, on iOS: play a looping silent <audio> element inside a user gesture (the classic "unmute" trick).
// Desktop and Android Chrome need neither (and an <audio> element there would only add a media notification).

export type AudioSessionPath = 'audioSession' | 'audioElement' | 'none';

interface NavLike {
  audioSession?: { type: string };
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}
interface AudioLike {
  src: string;
  loop: boolean;
  muted?: boolean;
  preload?: string;
  setAttribute?(k: string, v: string): void;
  play(): Promise<void> | void;
  pause?(): void;
  style?: { display: string };
}
interface DocLike {
  createElement(tag: string): unknown;
  body?: { appendChild(n: unknown): unknown } | null;
}

/** A tiny all-zero 16-bit mono WAV as a data: URI (about 0.1 s of silence). */
export function silentWavDataUri(samples = 4410, sampleRate = 44100): string {
  const n = samples * 2;
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => (bytes[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n, true);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export function isIOS(nav: NavLike): boolean {
  const ua = nav.userAgent ?? '';
  return /iP(hone|ad|od)/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1); // iPadOS reports as a Mac
}

export class AudioSessionFix {
  path: AudioSessionPath = 'none';
  private el: AudioLike | null = null;

  constructor(
    private readonly nav: NavLike = typeof navigator !== 'undefined' ? (navigator as unknown as NavLike) : {},
    private readonly doc: DocLike | null = typeof document !== 'undefined' ? (document as unknown as DocLike) : null,
  ) {}

  /** Call from a user gesture (cheap to call repeatedly). Returns which path is in use. */
  apply(): AudioSessionPath {
    try {
      if (this.nav.audioSession) {
        if (this.nav.audioSession.type !== 'playback') this.nav.audioSession.type = 'playback';
        this.path = 'audioSession';
        return this.path;
      }
    } catch {
      /* fall through to the element trick */
    }
    try {
      if (isIOS(this.nav) && this.doc) {
        if (!this.el) {
          const el = this.doc.createElement('audio') as AudioLike;
          el.src = silentWavDataUri();
          el.loop = true;
          el.preload = 'auto';
          el.setAttribute?.('playsinline', '');
          el.setAttribute?.('x-webkit-airplay', 'deny');
          if (el.style) el.style.display = 'none';
          this.doc.body?.appendChild(el);
          this.el = el;
        }
        const r = this.el.play();
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
        this.path = 'audioElement';
      }
    } catch {
      /* audio stays best-effort */
    }
    return this.path;
  }

  dispose(): void {
    try {
      this.el?.pause?.();
    } catch {
      /* ignore */
    }
    this.el = null;
  }
}
