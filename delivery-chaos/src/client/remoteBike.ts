// A teammate's bike: interpolated 100 ms in the past, cargo drawn from the network summary (so you can watch their
// pizza tower wobble). Phase A has no remote players, but the wiring (snap -> RemoteBike) is already live in Game.
import { playerName } from './i18n';
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
    this.model = new BikeModel(PLAYER_COLORS[info.color] ?? PLAYER_COLORS[0]!, playerName(info));
    this.model.cargoMount.add(this.cargo.group);
    this.model.setVisible(false);
    scene.add(this.model.root);
  }

  /** `t` = the state's own timestamp on the room clock. cargoSize = the order's size if known (else guessed from the summary). */
  push(s: PlayerStateMsg, cargoSize: number): void {
    const sample = toSample(s.t, s);
    if (!sample) return; // garbage from the network: ignore it
    this.buffer.push(sample);
    const kind = sample.cargo?.kind ?? null;
    if (kind !== this.cargo.currentKind) {
      if (kind) this.cargo.setKind(kind, kind === 'soup' ? 1 : Math.max(1, Math.round(cargoSize), Math.round(sample.cargo!.a)));
      else this.cargo.clear();
      this.model.setName(playerName(this.info), kind); // the tag shows what they are carrying
    }
  }

  /** where this rider is (interpolated) at the given room time; null until the first snapshot arrives */
  positionAt(serverNow: number): [number, number, number] | null {
    const s = this.buffer.sample(serverNow - INTERP_DELAY);
    return s ? [s.x, s.y, s.z] : null;
  }

  update(dt: number, serverNow: number, camera?: THREE.Vector3): void {
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
    // keep teammates easy to spot from afar: the bike grows a little with distance (up to 1.8x) and the name tag more
    if (camera) {
      const d = camera.distanceTo(this.model.root.position);
      const body = Math.min(1.8, Math.max(1, d / 22));
      this.model.root.scale.setScalar(body);
      this.model.setTagScale(Math.min(4.5, Math.max(1, d / 10)) / body);
    }
  }

  dispose(): void {
    this.cargo.dispose();
    this.model.dispose();
  }
}
