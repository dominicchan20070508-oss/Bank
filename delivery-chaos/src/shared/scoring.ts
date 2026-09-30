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
  parts: string[]; // human readable pieces (Simplified Chinese)
  summary: string; // "+¥23  完整度 72% · 提前 18s · 狗被吵醒 −8"
}

const REQ_LABEL: Record<RequestId, { ok: string; fail: string }> = {
  noHorn: { ok: '没吵醒小狗', fail: '狗被吵醒' },
  gentle: { ok: '轻拿轻放', fail: '奶奶被吓醒' },
  backDoor: { ok: '后门送达', fail: '走错门' },
  rush: { ok: '火速送达', fail: '太慢了' },
};

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

  const parts: string[] = [`完整度 ${Math.round(integrity * 100)}%`];
  parts.push(onTime ? `提前 ${Math.max(0, secondsDelta)}s` : `超时 ${Math.abs(secondsDelta)}s`);
  if (i.request) {
    const label = REQ_LABEL[i.request];
    parts.push(`${i.requestOk ? label.ok : label.fail} ${reqBonus >= 0 ? '+' : '−'}${Math.abs(reqBonus)}`);
  }
  return {
    tip,
    base,
    integrity,
    timeMult,
    onTime,
    secondsDelta,
    reqBonus,
    parts,
    summary: `+¥${tip}  ${parts.join(' · ')}`,
  };
}

/** Customer's reaction when the food arrives (DESIGN §7). */
export function integrityQuote(food: FoodKind, integrity: number): string {
  if (integrity <= 0) return '我的外卖呢？？';
  if (integrity >= 0.9) return '五星好评！';
  if (integrity >= 0.6) return '还行吧…';
  if (integrity >= 0.3) {
    if (food === 'soup') return '汤怎么只剩一半？';
    if (food === 'pizza') return '披萨怎么少了几盒？';
    return '冰淇淋怎么都化了？';
  }
  return '这是什么鬼？？';
}

export function starThresholds(playerCount: number): number[] {
  return GAME.STAR_PER_PLAYER.map((t) => t * Math.max(1, playerCount));
}

export function starsFor(teamTips: number, playerCount: number): number {
  return starThresholds(playerCount).filter((t) => teamTips >= t).length;
}

// ---------- awards ----------

export interface Award {
  id: string;
  icon: string;
  title: string;
  playerId: string;
  playerName: string;
  detail: string;
}

interface AwardDef {
  id: string;
  icon: string;
  title: string;
  value: (s: PlayerStats) => number;
  min: number;
  detail: (v: number) => string;
}

const AWARD_DEFS: AwardDef[] = [
  { id: 'tips', icon: '💰', title: '小费王', value: (s) => s.tips, min: 1, detail: (v) => `赚了 ¥${Math.round(v)}` },
  { id: 'crash', icon: '💥', title: '翻车王', value: (s) => s.crashes, min: 1, detail: (v) => `翻车 ${v} 次` },
  { id: 'soup', icon: '🍲', title: '洒汤王', value: (s) => s.soupSpilled, min: 0.2, detail: (v) => `洒了 ${v.toFixed(1)} 碗汤` },
  { id: 'air', icon: '🛫', title: '飞行员', value: (s) => s.maxAirTime, min: 0.5, detail: (v) => `最长滞空 ${v.toFixed(1)} 秒` },
  { id: 'honk', icon: '📯', title: '喇叭狂魔', value: (s) => s.honks, min: 3, detail: (v) => `按了 ${v} 次喇叭` },
  {
    id: 'steady',
    icon: '🛡️',
    title: '最稳车手',
    value: (s) => (s.deliveries > 0 ? s.integritySum / s.deliveries : 0),
    min: 0.001,
    detail: (v) => `平均完整度 ${Math.round(v * 100)}%`,
  },
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
    if (best) out.push({ id: def.id, icon: def.icon, title: def.title, playerId: best.p.id, playerName: best.p.name, detail: def.detail(best.v) });
    if (out.length >= max) break;
  }
  return out;
}
