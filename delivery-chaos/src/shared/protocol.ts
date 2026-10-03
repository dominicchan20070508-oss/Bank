// Message types shared by client, LocalTransport, GameRoom and the (Phase B) WebSocket server (DESIGN §10.2).
// JSON over WebSocket at /ws; `type` discriminates every message.
import type { FoodKind } from './map';
import type { Order } from './orders';
import type { PingId } from './pings';
import type { Award, PlayerStats, QuoteKey, TipPart } from './scoring';

export type Vec3 = [number, number, number];

/** Compact, serialisable cargo summary. Meaning of a/b/c per kind:
 *  soup:  a = level (0..1),   b = surface tilt x, c = surface tilt z
 *  pizza: a = boxes left,     b = tower tilt x,   c = tower tilt z
 *  ice:   a = scoops left,    b = melt (0..1),    c = wobble
 */
export interface CargoSummary {
  kind: FoodKind;
  a: number;
  b: number;
  c: number;
}

/** A player's kinematic state; sent 20 Hz by clients, relayed in `snap`. */
export interface PlayerStateMsg {
  t: number; // sender clock (s)
  p: Vec3;
  h: number; // heading
  l: number; // lean
  v: number; // planar speed (m/s)
  crashed: boolean;
  cargo: CargoSummary | null;
}

export type StatKey = 'soupSpilled' | 'pizzasLost' | 'scoopsLost' | 'crashes' | 'maxAirTime';
export type DebrisKind = 'pizza' | 'scoop' | 'drop';
export type RoomPhase = 'lobby' | 'playing' | 'results';

// ---------------- client -> server ----------------
export type ClientMsg =
  | { type: 'hello'; name: string }
  | { type: 'createRoom' }
  | { type: 'joinRoom'; code: string }
  | { type: 'startGame'; seed?: number; duration?: number } // seed / duration honoured only when the room allows overrides
  | { type: 'backToLobby' }
  | ({ type: 'state' } & PlayerStateMsg)
  | { type: 'pickup'; orderId: string }
  | { type: 'deliver'; orderId: string; integrity: number; crashedDuring: boolean; honkedNear: boolean }
  | { type: 'honk' }
  | { type: 'debris'; kind: DebrisKind; p: Vec3; v: Vec3 }
  | { type: 'stat'; key: StatKey; delta: number }
  | { type: 'ping'; t: number } // clock sync: the server answers with `pong` carrying its own clock
  | { type: 'quick'; id: PingId; orderId?: string } // quick-chat preset (orderId: the card the player tapped, for "claim")
  | { type: 'salvage'; zoneId: string } // "I stopped in this salvage zone" (the server checks position / speed)
  | { type: 'caps'; touch: boolean; autoGas: boolean } // anonymous device facts for the round-summary log
  | { type: 'debugGive'; orderId?: string }; // test hook; ignored unless the room allows debug

// ---------------- server -> client ----------------
export interface RoomPlayerInfo {
  id: string;
  name: string;
  color: number; // index into PLAYER_COLORS
}

export interface PlayerResult extends RoomPlayerInfo {
  stats: PlayerStats;
}

export type ErrorCode = 'notFound' | 'playing' | 'full' | 'inRoom' | 'noRoom' | 'busy' | 'debugOff';

/** A salvage zone left behind by a teammate who crashed while carrying an order (DESIGN §14.3). Times are server seconds. */
export interface SalvageZoneInfo {
  id: string;
  ownerId: string;
  x: number;
  z: number;
  food: FoodKind;
  expiresAt: number;
}

export type RejectReason = 'taken' | 'busy' | 'far' | 'fast' | 'wrongDoor' | 'notCarrier' | 'state' | 'phase';

export type GameEvent =
  | { ev: 'pickup'; orderId: string; playerId: string }
  | {
      ev: 'deliver';
      orderId: string;
      playerId: string;
      customerId: string;
      food: FoodKind;
      request: Order['request'];
      requestOk: boolean | null;
      integrity: number;
      tip: number;
      teamTips: number;
      parts: TipPart[]; // structured: the client formats them in its own language
      quote: QuoteKey; // i18n key of the customer's reaction
      onTime: boolean;
    }
  | { ev: 'expire'; orderId: string }
  | { ev: 'honk'; playerId: string; p: Vec3; dog: boolean; orderId?: string }
  | { ev: 'debris'; playerId: string; kind: DebrisKind; p: Vec3; v: Vec3 }
  | { ev: 'crash'; playerId: string; p: Vec3 }
  | { ev: 'ping'; playerId: string; pingId: PingId; orderId?: string }
  | { ev: 'salvage'; zoneId: string; playerId: string; ownerId: string; tip: number; teamTips: number }
  | { ev: 'reject'; kind: 'pickup' | 'deliver'; orderId: string; reason: RejectReason };

export interface ResultsMsg {
  type: 'results';
  teamTips: number;
  stars: number;
  players: PlayerResult[];
  awards: Award[];
}

export type ServerMsg =
  | { type: 'welcome'; id: string }
  | { type: 'room'; code: string; hostId: string | null; phase: RoomPhase; players: RoomPlayerInfo[] }
  | { type: 'start'; seed: number; duration: number; serverTime: number }
  | { type: 'orders'; t: number; teamTips: number; list: Order[] }
  | { type: 'snap'; t: number; players: Record<string, PlayerStateMsg> }
  | { type: 'salvage'; t: number; list: SalvageZoneInfo[] } // the full list of open salvage zones, sent whenever it changes
  | ({ type: 'event' } & GameEvent)
  | ResultsMsg
  | { type: 'pong'; t: number; s: number } // t = the client's ping time echoed back, s = server clock (s)
  | { type: 'error'; code: ErrorCode }; // the client turns the code into text in its own language (i18n `err.*`)
