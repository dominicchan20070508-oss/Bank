// A teammate's bike: interpolated 100 ms in the past, cargo drawn from the network summary (so you can watch their
// pizza tower wobble). Phase A has no remote players, but the wiring (snap -> RemoteBike) is already live in Game.
import * as THREE from 'three';
import { PLAYER_COLORS } from '../shared/constants';
import type { PlayerStateMsg, RoomPlayerInfo } from '../shared/protocol';
import { BikeModel } from './bikeModel';
import { CargoView } from './cargoView';
import { INTERP_DELAY, InterpBuffer, toSample } from './interp';

export class RemoteBike {
  readonly model: BikeModel;
  private readonly cargo = new CargoView();
  private readonly buffer = new InterpBuffer();
  private crashClock = 0;
  private lastCrashed = false;
  private prev: { x: number; z: number } | null = null;
  /** latest interpolated ground position (for the minimap / getState) */
  pos: [number, number, number] = [0, 0, 0];
  heading = 0;

  constructor(
    scene: THREE.Scene,
    readonly info: RoomPlayerInfo,
  ) {
    this.model = new BikeModel(PLAYER_COLORS[info.color] ?? PLAYER_COLORS[0]!, info.name);
    this.model.cargoMount.add(this.cargo.group);
    this.model.setVisible(false);
    scene.add(this.model.root);
  }

  push(serverTime: number, s: PlayerStateMsg, cargoSize: number): void {
    this.buffer.push(toSample(serverTime, s));
    const kind = s.cargo?.kind ?? null;
    if (kind !== this.cargo.currentKind) {
      if (kind) this.cargo.setKind(kind, cargoSize);
      else this.cargo.clear();
    }
  }

  update(dt: number, serverNow: number): void {
    const s = this.buffer.sample(serverNow - INTERP_DELAY);
    if (!s) return;
    this.model.setVisible(true);
    this.pos = [s.x, s.y, s.z];
    this.heading = s.h;
    if (s.crashed) this.crashClock = this.lastCrashed ? this.crashClock + dt : 0.0001;
    else this.crashClock = 0;
    this.lastCrashed = s.crashed;
    const speedFwd = this.prev ? Math.hypot(s.x - this.prev.x, s.z - this.prev.z) / Math.max(dt, 1e-3) : s.v;
    this.prev = { x: s.x, z: s.z };
    this.model.update(
      { x: s.x, y: s.y - 0.5, z: s.z, heading: s.h, lean: s.l, speedFwd: Math.min(speedFwd, 20), steer: 0, crashT: s.crashed ? Math.min(1, this.crashClock / 1.8) : 0, crashSide: s.l >= 0 ? 1 : -1 },
      dt,
    );
    this.cargo.apply(s.cargo);
  }

  dispose(): void {
    this.cargo.dispose();
    this.model.dispose();
  }
}
