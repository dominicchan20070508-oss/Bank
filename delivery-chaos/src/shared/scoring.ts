// Tip formula, stars and awards (DESIGN §7). Pure functions.
import { GAME, TIP } from './constants';
import type { FoodKind } from './map';
import type { RequestId } from './orders';

export interface PlayerStats {
  deliveries: number;
  tips: number;
  crashes: number;
  soupSpilled: number; // bowls
  pizzasLost: number;
  scoopsLost: number;
  honks: number;
  maxAirTime: number; // seconds
  integritySum: number;
}

export function emptyStats(): PlayerStats {
  return { deliveries: 0, tips: 0, crashes: 0, soupSpilled: 0, pizzasLost: 0, scoopsLost: 0, honks: 0, maxAirTime: 0, integritySum: 0 };
}

export function baseTip(distance: number, food: FoodKind, size: number): number {
  let base = TIP.BASE + distance * TIP.PER_METER;
  if (food === 'pizza') base += TIP.PIZZA_PER_EXTRA_BOX * Math.max(0, size - 1);
  if (food === 'ice') base += TIP.ICE_PER_EXTRA_SCOOP * Math.max(0, size - 1);
  return base;
}

export interface TipInput {
  distance: number;
  food: FoodKind;
  size: number;
  integrity: number; // 0..1
  elapsed: number; // s since pickup
  timeLimit: number; // s
  request: RequestId | null;
  requestOk: boolean | null; // null when there was no request
}

export interface TipBreakdown {
  tip: number;
  base: number;
  integrity: number;
  timeMult: number;
  onTime: boolean;
  secondsDelta: number; // +early / -late (whole seconds)
  reqBonus: number;
  /** structured pieces of the tip line; the client turns each into text in its own language (i18n `tip.*` keys) */
  parts: TipPart[];
}

export type TipPartKey =
  | 'tip.integrity'
  | 'tip.early'
  | 'tip.late'
  | 'tip.noHorn.ok'
  | 'tip.noHorn.fail'
  | 'tip.gentle.ok'
  | 'tip.gentle.fail'
  | 'tip.backDoor.ok'
  | 'tip.backDoor.fail'
  | 'tip.rush.ok'
  | 'tip.rush.fail';

/** One piece of the tip breakdown: a message key plus numeric params (pct: 0..100, secs: whole seconds, bonus: signed tip points). */
export interface TipPart {
  key: TipPartKey;
  pct?: number;
  secs?: number;
  bonus?: number;
}

export function computeTip(i: TipInput): TipBreakdown {
  const integrity = Math.min(1, Math.max(0, i.integrity));
  const base = baseTip(i.distance, i.food, i.size);
  const remaining = i.timeLimit > 0 ? Math.max(0, i.timeLimit - i.elapsed) / i.timeLimit : 0;
  const onTime = i.elapsed <= i.timeLimit;
  const timeMult = onTime ? 1 + TIP.EARLY_BONUS * remaining : TIP.LATE_MULT;
  let reqBonus = 0;
  if (i.request) reqBonus = i.requestOk ? (i.request === 'rush' ? TIP.REQ_RUSH_OK : TIP.REQ_OK) : TIP.REQ_FAIL;
  const raw = base * (TIP.INTEGRITY_FLOOR + TIP.INTEGRITY_SLOPE * integrity) * timeMult + reqBonus;
  const tip = integrity <= 0 ? 0 : Math.max(0, Math.round(raw));
  const secondsDelta = Math.round(i.timeLimit - i.elapsed);

  const parts: TipPart[] = [{ key: 'tip.integrity', pct: Math.round(integrity * 100) }];
  parts.push(onTime ? { key: 'tip.early', secs: Math.max(0, secondsDelta) } : { key: 'tip.late', secs: Math.abs(secondsDelta) });
  if (i.request) parts.push({ key: `tip.${i.request}.${i.requestOk ? 'ok' : 'fail'}`, bonus: reqBonus });
  return {
    tip,
    base,
    integrity,
    timeMult,
    onTime,
    secondsDelta,
    reqBonus,
    parts,
  };
}

export type QuoteKey = 'quote.none' | 'quote.five' | 'quote.ok' | 'quote.mid.soup' | 'quote.mid.pizza' | 'quote.mid.ice' | 'quote.bad';

/** Customer's reaction when the food arrives (DESIGN §7), as an i18n key. */
export function integrityQuote(food: FoodKind, integrity: number): QuoteKey {
  if (integrity <= 0) return 'quote.none';
  if (integrity >= 0.9) return 'quote.five';
  if (integrity >= 0.6) return 'quote.ok';
  if (integrity >= 0.3) return `quote.mid.${food}`;
  return 'quote.bad';
}

export function starThresholds(playerCount: number): number[] {
  return GAME.STAR_PER_PLAYER.map((t) => t * Math.max(1, playerCount));
}

export function starsFor(teamTips: number, playerCount: number): number {
  return starThresholds(playerCount).filter((t) => teamTips >= t).length;
}

// ---------- awards ----------

export type AwardId = 'tips' | 'crash' | 'soup' | 'air' | 'honk' | 'steady';

/** An end-of-round award. Titles / detail lines are rendered by the client from `id` and `value` (i18n `award.*`). */
export interface Award {
  id: AwardId;
  icon: string;
  playerId: string;
  playerName: string; // as the player typed it ('' = unnamed: the client shows "Rider N")
  /** tips: ¥; crash / honk: count; soup: bowls; air: seconds; steady: average integrity 0..1 */
  value: number;
}

interface AwardDef {
  id: AwardId;
  icon: string;
  value: (s: PlayerStats) => number;
  min: number;
}

const AWARD_DEFS: AwardDef[] = [
  { id: 'tips', icon: '💰', value: (s) => s.tips, min: 1 },
  { id: 'crash', icon: '💥', value: (s) => s.crashes, min: 1 },
  { id: 'soup', icon: '🍲', value: (s) => s.soupSpilled, min: 0.2 },
  { id: 'air', icon: '🛫', value: (s) => s.maxAirTime, min: 0.5 },
  { id: 'honk', icon: '📯', value: (s) => s.honks, min: 3 },
  { id: 'steady', icon: '🛡️', value: (s) => (s.deliveries > 0 ? s.integritySum / s.deliveries : 0), min: 0.001 },
];

/** Pick up to `max` awards, best matching player per category; ties go to the earlier player. */
export function pickAwards(players: { id: string; name: string; stats: PlayerStats }[], max = 4): Award[] {
  const out: Award[] = [];
  for (const def of AWARD_DEFS) {
    let best: { p: (typeof players)[number]; v: number } | null = null;
    for (const p of players) {
      const v = def.value(p.stats);
      if (v >= def.min && (!best || v > best.v)) best = { p, v };
    }
    if (best) out.push({ id: def.id, icon: def.icon, playerId: best.p.id, playerName: best.p.name, value: best.v });
    if (out.length >= max) break;
  }
  return out;
}
