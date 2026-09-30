// Message types shared by client, LocalTransport, GameRoom and the (Phase B) WebSocket server (DESIGN §10.2).
// JSON over WebSocket at /ws; `type` discriminates every message.
import type { FoodKind } from './map';
import type { Order } from './orders';
import type { Award, PlayerStats } from './scoring';

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
      parts: string[];
      summary: string;
      quote: string;
      onTime: boolean;
    }
  | { ev: 'expire'; orderId: string }
  | { ev: 'honk'; playerId: string; p: Vec3; dog: boolean; orderId?: string }
  | { ev: 'debris'; playerId: string; kind: DebrisKind; p: Vec3; v: Vec3 }
  | { ev: 'crash'; playerId: string; p: Vec3 }
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
  | ({ type: 'event' } & GameEvent)
  | ResultsMsg
  | { type: 'error'; msg: string };
