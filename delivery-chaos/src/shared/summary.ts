// Anonymous per-round telemetry (DESIGN §14.4): ONE JSON line per online round, written to the server log.
// It contains counts only: no names, no ids, no IPs, nothing that identifies a person. Pure, so it is unit-tested.
import { GAME_VERSION } from './constants';
import { PING_IDS, type PingId } from './pings';

export interface RoundSummary {
  v: string; // game version
  evt: 'round';
  players: number;
  touchPlayers: number;
  durationS: number;
  deliveries: number;
  crashes: number;
  avgIntegrity: number; // 0..1, over all deliveries (0 when there were none)
  teamTips: number;
  stars: number;
  salvages: number;
  pings: Record<PingId, number>; // by preset id
  claims: number;
  autoGasPlayers: number;
}

export interface SummaryInput {
  players: { touch: boolean; autoGas: boolean; stats: { deliveries: number; crashes: number; integritySum: number; salvages: number } }[];
  durationS: number;
  teamTips: number;
  stars: number;
  pings: Record<PingId, number>;
  claims: number;
}

export function emptyPingCounts(): Record<PingId, number> {
  return Object.fromEntries(PING_IDS.map((id) => [id, 0])) as Record<PingId, number>;
}

export function buildRoundSummary(i: SummaryInput): RoundSummary {
  const deliveries = i.players.reduce((n, p) => n + p.stats.deliveries, 0);
  const integrity = i.players.reduce((n, p) => n + p.stats.integritySum, 0);
  const pings = emptyPingCounts();
  for (const id of PING_IDS) pings[id] = Math.max(0, Math.floor(i.pings[id] ?? 0));
  return {
    v: GAME_VERSION,
    evt: 'round',
    players: i.players.length,
    touchPlayers: i.players.filter((p) => p.touch).length,
    durationS: Math.round(i.durationS),
    deliveries,
    crashes: i.players.reduce((n, p) => n + p.stats.crashes, 0),
    avgIntegrity: deliveries > 0 ? Math.round((integrity / deliveries) * 100) / 100 : 0,
    teamTips: i.teamTips,
    stars: i.stars,
    salvages: i.players.reduce((n, p) => n + p.stats.salvages, 0),
    pings,
    claims: Math.max(0, Math.floor(i.claims)),
    autoGasPlayers: i.players.filter((p) => p.autoGas).length,
  };
}

/** The exact log line: a single line of JSON. */
export function formatRoundSummary(s: RoundSummary): string {
  return JSON.stringify(s);
}
