// Chase camera: 6 m behind, 3 m up, smooth yaw follow, speed-based FOV, screen shake.
import * as THREE from 'three';
import { BIKE, VIEW } from '../shared/constants';
import { pointInRect, type CityMap } from '../shared/map';

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(VIEW.FOV_MIN, 16 / 9, 0.3, 700);
  private yaw = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private shake = 0;
  private shakeT = 0;
  private fov: number = VIEW.FOV_MIN;
  private initialised = false;

  /** add screen shake (0..1). Shakes stack up to 1. */
  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  snapTo(x: number, y: number, z: number, heading: number): void {
    this.yaw = heading;
    this.initialised = false;
    this.pos.set(x, y, z);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Pull the camera in front of any building between it and the bike, so walls never cut the view open. */
  private avoidBuildings(map: CityMap, fx: number, fy: number, fz: number): void {
    const cam = this.camera.position;
    for (let t = 1; t >= 0.15; t -= 0.12) {
      const x = fx + (cam.x - fx) * t;
      const y = fy + (cam.y - fy) * t;
      const z = fz + (cam.z - fz) * t;
      let blocked = false;
      for (const b of map.buildings) {
        if (y < b.h + 0.5 && pointInRect(b, x, z, 0.6)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        if (t < 1) cam.set(x, y, z);
        return;
      }
    }
    cam.set(fx, fy + 0.5, fz);
  }

  update(dt: number, x: number, y: number, z: number, heading: number, speed: number, map?: CityMap): void {
    if (!this.initialised) {
      this.yaw = heading;
      this.initialised = true;
      this.pos.set(x - Math.sin(heading) * VIEW.CAM_BACK, y + VIEW.CAM_HEIGHT, z - Math.cos(heading) * VIEW.CAM_BACK);
    }
    this.yaw += angleDiff(heading, this.yaw) * (1 - Math.exp(-VIEW.CAM_YAW_RATE * dt));
    const tx = x - Math.sin(this.yaw) * VIEW.CAM_BACK;
    const tz = z - Math.cos(this.yaw) * VIEW.CAM_BACK;
    const ty = y + VIEW.CAM_HEIGHT;
    const k = 1 - Math.exp(-VIEW.CAM_POS_RATE * dt);
    this.pos.x += (tx - this.pos.x) * k;
    this.pos.y += (ty - this.pos.y) * k;
    this.pos.z += (tz - this.pos.z) * k;

    this.look.set(x + Math.sin(this.yaw) * VIEW.CAM_LOOK_AHEAD, y + VIEW.CAM_LOOK_HEIGHT, z + Math.cos(this.yaw) * VIEW.CAM_LOOK_AHEAD);

    // shake
    this.shakeT += dt * 55;
    const s = this.shake * this.shake;
    const ox = (Math.sin(this.shakeT * 1.3) + Math.sin(this.shakeT * 2.7)) * 0.5 * s * 0.5;
    const oy = (Math.sin(this.shakeT * 1.9 + 1) + Math.sin(this.shakeT * 3.1)) * 0.5 * s * 0.4;
    this.shake = Math.max(0, this.shake - dt * 1.6);

    this.camera.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z);
    if (map) this.avoidBuildings(map, x, y + 1.4, z);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(ox * 0.05);

    const targetFov = VIEW.FOV_MIN + (VIEW.FOV_MAX - VIEW.FOV_MIN) * Math.min(1, speed / BIKE.VMAX);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
