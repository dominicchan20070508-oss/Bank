// Input validation shared by GameRoom (which relays data to other clients) and the WebSocket server (which parses
// raw JSON). Everything coming from a socket is untrusted: one bad client must never be able to hurt its teammates.
import { isPingId } from './pings';
import type { ClientMsg, CargoSummary, DebrisKind, StatKey, Vec3 } from './protocol';

export const FOOD_KINDS = ['soup', 'pizza', 'ice'] as const;
export const DEBRIS_KINDS: readonly DebrisKind[] = ['pizza', 'scoop', 'drop'];
export const STAT_KEYS: readonly StatKey[] = ['soupSpilled', 'pizzasLost', 'scoopsLost', 'crashes', 'maxAirTime'];

/** Limits on what a client may relay (see GameRoom). */
export const LIMITS = {
  MAX_COORD: 2000, // |x|,|y|,|z| of any reported position / debris origin
  MAX_DEBRIS_SPEED: 40, // m/s, clamped
  DEBRIS_PER_SEC: 15, // per player, excess dropped
  HONK_BROADCASTS_PER_SEC: 4, // per player (every honk still counts in the stats)
  QUICK_PER_SEC: 3, // per player: quick-chat messages that are even looked at (on top of the 1.5 s cooldown)
  SALVAGE_PER_SEC: 4, // per player: salvage claims
  CAPS_PER_SEC: 1, // per player: device-facts messages
  NAME_LENGTH: 12,
  ID_LENGTH: 24,
} as const;

export const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A length-3 array of finite numbers within +-maxAbs, or null. */
export function sanitizeVec3(v: unknown, maxAbs: number = LIMITS.MAX_COORD): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const [x, y, z] = v as unknown[];
  if (!isFiniteNum(x) || !isFiniteNum(y) || !isFiniteNum(z)) return null;
  if (Math.abs(x) > maxAbs || Math.abs(y) > maxAbs || Math.abs(z) > maxAbs) return null;
  return [x, y, z];
}

/** Scale the vector down so that its length is at most `max`. */
export function clampLength(v: Vec3, max: number): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= max || len === 0) return v;
  const k = max / len;
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** The known cargo summary shape (valid kind, finite numbers) or null. Only these four fields ever leave the server. */
export function sanitizeCargo(c: unknown): CargoSummary | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !(FOOD_KINDS as readonly string[]).includes(o.kind)) return null;
  if (!isFiniteNum(o.a) || !isFiniteNum(o.b) || !isFiniteNum(o.c)) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { kind: o.kind as CargoSummary['kind'], a: clamp(o.a, 0, 50), b: clamp(o.b, -5, 5), c: clamp(o.c, -5, 5) };
}

export function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, LIMITS.NAME_LENGTH);
}

/** Simple token bucket: `rate` events per second, bursts up to `burst`. */
export class TokenBucket {
  private tokens: number;
  private last = -Infinity;
  constructor(
    private readonly rate: number,
    private readonly burst: number = rate,
  ) {
    this.tokens = burst;
  }
  /** true = allowed (and consumed) */
  take(now: number): boolean {
    if (this.last === -Infinity) this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + Math.max(0, now - this.last) * this.rate);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

const shortString = (v: unknown, max = LIMITS.ID_LENGTH): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * Turn an untrusted, already JSON-parsed value into a well-formed ClientMsg, or null (= drop it). Unknown types are
 * dropped. Only the fields the protocol defines are copied, so nothing else can ride along to other clients.
 */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case 'hello':
      return { type: 'hello', name: sanitizeName(m.name) };
    case 'createRoom':
      return { type: 'createRoom' };
    case 'joinRoom':
      return typeof m.code === 'string' ? { type: 'joinRoom', code: m.code.trim().toUpperCase().slice(0, 8) } : null;
    case 'startGame': {
      const out: Extract<ClientMsg, { type: 'startGame' }> = { type: 'startGame' };
      if (isFiniteNum(m.seed)) out.seed = Math.floor(m.seed);
      if (isFiniteNum(m.duration) && m.duration >= 1 && m.duration <= 3600) out.duration = m.duration;
      return out;
    }
    case 'backToLobby':
      return { type: 'backToLobby' };
    case 'ping':
      return isFiniteNum(m.t) ? { type: 'ping', t: m.t } : null;
    case 'state': {
      const p = sanitizeVec3(m.p);
      if (!p || !isFiniteNum(m.t) || !isFiniteNum(m.h) || !isFiniteNum(m.l) || !isFiniteNum(m.v)) return null;
      return { type: 'state', t: m.t, p, h: m.h, l: m.l, v: m.v, crashed: m.crashed === true, cargo: sanitizeCargo(m.cargo) };
    }
    case 'pickup':
      return shortString(m.orderId) ? { type: 'pickup', orderId: m.orderId } : null;
    case 'deliver':
      if (!shortString(m.orderId) || !isFiniteNum(m.integrity)) return null;
      return { type: 'deliver', orderId: m.orderId, integrity: m.integrity, crashedDuring: m.crashedDuring === true, honkedNear: m.honkedNear === true };
    case 'honk':
      return { type: 'honk' };
    case 'debris': {
      const p = sanitizeVec3(m.p);
      const v = sanitizeVec3(m.v, 1000);
      if (!p || !v || typeof m.kind !== 'string' || !(DEBRIS_KINDS as readonly string[]).includes(m.kind)) return null;
      return { type: 'debris', kind: m.kind as DebrisKind, p, v };
    }
    case 'stat':
      if (typeof m.key !== 'string' || !(STAT_KEYS as readonly string[]).includes(m.key) || !isFiniteNum(m.delta)) return null;
      return { type: 'stat', key: m.key as StatKey, delta: m.delta };
    case 'quick': {
      if (!isPingId(m.id)) return null;
      if (m.orderId === undefined || m.orderId === null) return { type: 'quick', id: m.id };
      return shortString(m.orderId) ? { type: 'quick', id: m.id, orderId: m.orderId } : null;
    }
    case 'salvage':
      return shortString(m.zoneId) ? { type: 'salvage', zoneId: m.zoneId } : null;
    case 'caps':
      return { type: 'caps', touch: m.touch === true, autoGas: m.autoGas === true };
    case 'debugGive':
      return m.orderId === undefined ? { type: 'debugGive' } : shortString(m.orderId) ? { type: 'debugGive', orderId: m.orderId } : null;
    default:
      return null;
  }
}
