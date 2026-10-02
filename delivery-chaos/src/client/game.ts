// The in-round game: fixed 60 Hz physics with an accumulator, rendering on rAF, glue between the local bike, the
// cargo models, the world, the HUD and the transport. Game RULES (orders, tips, timers) live in shared/rules.ts and
// are only *reported to* / *received from* the transport here.
import * as THREE from 'three';
import { AUDIO, BIKE, CARGO, GAME, PLAYER_COLORS, TOUCH, VIEW, ZONE } from '../shared/constants';
import { doorOf, generateCity, type CityMap, type Door } from '../shared/map';
import { REQUEST_INFO, targetDoor, type Order } from '../shared/orders';
import type { GameEvent, RejectReason, ResultsMsg, RoomPlayerInfo, ServerMsg, StatKey } from '../shared/protocol';
import { createCargo, type Cargo, type CargoEvent } from '../sim/cargo';
import { BikeController, type BikeEvent } from './bike';
import { BikeModel } from './bikeModel';
import type { Sfx } from './audio';
import { ChaseCamera } from './camera';
import { CargoView } from './cargoView';
import { DebrisManager } from './debris';
import type { Input, InputOverride } from './input';
import { Minimap, type MinimapMarker } from './minimap';
import type { Transport } from './net/transport';
import { Particles } from './particles';
import { RemoteBike } from './remoteBike';
import { createPhysics, FIXED_DT, type PhysicsWorld } from './physics';
import { formatCargoStatus, formatQuote, formatTipParts, placeName, playerName, t } from './i18n';
import type { TouchControls } from './touch';
import { isCompactScreen, type Hud, type ScreenRect } from './ui/hud';
import { World } from './world';

export interface GameDeps {
  renderer: THREE.WebGLRenderer;
  transport: Transport;
  hud: Hud;
  sfx: Sfx;
  input: Input;
  debug: boolean;
  shadows: boolean;
  /** on-screen controls (phones), or null on desktop */
  touch?: TouchControls | null;
  /** phone performance profile: fewer particles */
  lowPower?: boolean;
  /** shadows are skipped on software GL (headless / no GPU) because they more than halve the frame rate; ?shadows forces them on */
  forceShadows?: boolean;
}

export interface GameInit {
  seed: number;
  duration: number;
  startTime: number; // serverTime of the `start` message
  players: RoomPlayerInfo[];
  myId: string;
}

interface Carrying {
  order: Order;
  cargo: Cargo;
  honkedNear: boolean;
  crashedDuring: boolean;
}

interface ZoneTarget {
  kind: 'pickup' | 'deliver';
  order: Order;
  door: Door;
}

const REJECT_KEYS: Partial<Record<RejectReason, 'reject.taken' | 'reject.busy' | 'reject.far' | 'reject.fast'>> = {
  taken: 'reject.taken',
  busy: 'reject.busy',
  far: 'reject.far',
  fast: 'reject.fast',
};

const SPILL_KEYS = ['float.spill.1', 'float.spill.1', 'float.spill.2', 'float.spill.3'] as const;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const d2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

export class Game {
  readonly map: CityMap;
  readonly phys: PhysicsWorld;
  readonly world: World;
  readonly bike: BikeController;
  readonly bikeModel: BikeModel;
  readonly cargoView = new CargoView();
  readonly debris: DebrisManager;
  readonly particles = new Particles();
  readonly chase = new ChaseCamera();
  readonly minimap: Minimap;

  phase: 'playing' | 'results' = 'playing';
  private disposed = false;
  private frozen = false;
  private orders: Order[] = [];
  private teamTips = 0;
  private roster = new Map<string, RoomPlayerInfo>();
  private remotes = new Map<string, RemoteBike>();
  private carrying: Carrying | null = null;

  private raf = 0;
  private lastTs = 0;
  private acc = 0;
  private time = 0; // seconds since game object creation (render clock)
  private fps = 60;
  private fpsFrames = 0;
  private fpsTime = 0;

  private dwell = 0;
  private zone: ZoneTarget | null = null;
  private pending: { orderId: string; kind: 'pickup' | 'deliver'; until: number } | null = null;
  private wrongDwell = 0;
  private wrongHintAt = -99;

  private netAcc = 0;
  private statSoup = 0;
  private statFlushAt = 0;
  private spillAcc = 0;
  private spillPopupAt = -99;
  private spillSoundAcc = 0;
  private spillSoundAt = -99;
  private hudRects: ScreenRect[] = [];
  private hudRectsAt = -99;
  /** QA counters (window.__game.debug.counters) */
  readonly counters = { honks: 0, resets: 0 };
  private hudAcc = 0;
  private lastHonkAt = -99;
  private lastLandPopup = -99;
  private adaptTimer = 0;
  private lowFpsSeconds = 0;
  private pixelRatio: number;
  private readonly softwareGL: boolean;

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly restaurantDoors = new Map<string, Door>();
  private readonly interp = { x: 0, y: 0, z: 0, heading: 0, lean: 0 };
  private readonly onResize = () => this.resize();

  constructor(
    private readonly deps: GameDeps,
    private readonly init: GameInit,
  ) {
    this.pixelRatio = deps.renderer.getPixelRatio();
    this.softwareGL = isSoftwareRenderer(deps.renderer);
    const shadows = deps.shadows && (!this.softwareGL || !!deps.forceShadows);
    deps.renderer.shadowMap.enabled = shadows;
    this.map = generateCity(init.seed);
    this.phys = createPhysics(this.map);
    this.world = new World(this.map, { shadows });
    for (const p of init.players) this.roster.set(p.id, p);
    const meIdx = Math.max(0, init.players.findIndex((p) => p.id === init.myId));
    const me = init.players[meIdx];
    const color = PLAYER_COLORS[me?.color ?? 0] ?? PLAYER_COLORS[0]!;
    this.bike = new BikeController(this.phys, this.map, 1 + meIdx * 7919);
    this.bikeModel = new BikeModel(color); // no name tag on your own bike: it would sit over the view and the tip popup
    this.bikeModel.cargoMount.add(this.cargoView.group);
    this.debris = new DebrisManager(this.world.scene, this.phys);
    this.minimap = new Minimap(this.map, deps.lowPower ? 132 : 176);
    if (deps.lowPower) this.particles.countScale = TOUCH.PARTICLE_SCALE;
    this.world.scene.add(this.bikeModel.root, this.particles.points);
    for (const r of this.map.restaurants) this.restaurantDoors.set(r.id, r.door);

    const sp = this.map.spawns[meIdx % this.map.spawns.length]!;
    this.bike.place(sp.x, sp.z, sp.heading);
    this.chase.snapTo(sp.x, 0.5, sp.z, sp.heading);
    deps.hud.mountMinimap(this.minimap.canvas);
    deps.touch?.setVisible(true);
    deps.hud.popups.project = (x, y, z) => this.project(x, y, z);
    deps.hud.setVisible(true);
    deps.hud.setTips(0, init.players.length);
    deps.hud.setTime(init.duration);
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.sendState();
    deps.hud.popups.floatText(t('float.go'), { color: '#ffe08a', size: 'big', jitter: 0 });
  }

  // ------------------------------------------------------------------ lifecycle
  start(): void {
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(ts);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.deps.hud.popups.project = null;
    this.deps.hud.setVisible(false);
    this.deps.touch?.setVisible(false);
    this.deps.sfx.setEngine(0, 0, false);
    this.remotes.forEach((r) => r.dispose());
    this.remotes.clear();
    this.debris.dispose();
    this.particles.dispose();
    this.bikeModel.dispose();
    this.cargoView.dispose();
    this.world.dispose();
  }

  /** the connection died: stop simulating, keep the last picture on screen */
  freeze(): void {
    this.frozen = true;
    this.deps.touch?.setVisible(false);
    this.deps.sfx.setEngine(0, 0, false);
    this.deps.hud.setArrow(null);
    this.deps.hud.setZone(null);
  }

  finish(_r: ResultsMsg): void {
    this.phase = 'results';
    this.deps.input.enabled = false;
    this.deps.touch?.setVisible(false);
    this.deps.hud.setArrow(null);
    this.deps.hud.setZone(null);
    this.deps.sfx.setEngine(0, 0, false);
    this.carrying = null;
    this.cargoView.clear();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.deps.renderer.setSize(w, h, false);
    this.chase.resize(w, h);
  }

  // ------------------------------------------------------------------ helpers
  private now(): number {
    return this.deps.transport.serverNow();
  }
  private get me(): string {
    return this.init.myId;
  }
  private nameOf(id: string): string {
    const info = this.roster.get(id);
    return info ? playerName(info) : t('player.default', { n: '' }).trim();
  }
  timeLeft(): number {
    return this.phase === 'playing' ? Math.max(0, this.init.startTime + this.init.duration - this.now()) : 0;
  }

  private project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = this.tmpV.set(x, y, z).project(this.chase.camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 };
  }

  private send(msg: Parameters<Transport['send']>[0]): void {
    this.deps.transport.send(msg);
  }

  private stat(key: StatKey, delta: number): void {
    this.send({ type: 'stat', key, delta });
  }

  private sendState(): void {
    const p = this.bike.pos;
    this.send({
      type: 'state',
      t: this.now(),
      p: [p.x, p.y, p.z],
      h: this.bike.heading,
      l: this.bike.lean,
      v: this.bike.speed,
      crashed: this.bike.crashed,
      cargo: this.carrying ? this.carrying.cargo.summary() : null,
    });
  }

  // ------------------------------------------------------------------ incoming messages
  handleMessage(msg: ServerMsg): void {
    switch (msg.type) {
      case 'room':
        this.roster.clear();
        for (const p of msg.players) this.roster.set(p.id, p);
        for (const [id, r] of this.remotes) {
          if (!this.roster.has(id)) {
            r.dispose();
            this.remotes.delete(id);
          }
        }
        break;
      case 'orders':
        this.orders = msg.list;
        this.teamTips = msg.teamTips;
        this.pending = null;
        this.deps.hud.setOrders(this.orders, { map: this.map, myId: this.me, nameOf: (id) => this.nameOf(id) });
        this.deps.hud.setTips(this.teamTips, Math.max(1, this.roster.size));
        // our carried order vanished from under us (e.g. server side expiry)?
        if (this.carrying) {
          const o = this.orders.find((x) => x.id === this.carrying!.order.id);
          if (o && o.status !== 'carrying') this.dropCargo();
        }
        break;
      case 'snap':
        for (const [id, s] of Object.entries(msg.players)) {
          if (id === this.me) continue;
          let r = this.remotes.get(id);
          if (!r) {
            const info = this.roster.get(id);
            if (!info) continue;
            r = new RemoteBike(this.world.scene, info);
            this.remotes.set(id, r);
          }
          const carried = this.orders.find((o) => o.carrierId === id && o.status === 'carrying');
          r.push(s, carried?.size ?? 0);
        }
        break;
      case 'event':
        this.handleEvent(msg);
        break;
      default:
        break;
    }
  }

  private dropCargo(): void {
    this.carrying = null;
    this.cargoView.clear();
  }

  private handleEvent(ev: GameEvent): void {
    switch (ev.ev) {
      case 'pickup': {
        if (ev.playerId !== this.me) break;
        const o = this.orders.find((x) => x.id === ev.orderId);
        if (!o) break;
        this.pending = null;
        this.carrying = { order: o, cargo: createCargo(o.food, o.size), honkedNear: false, crashedDuring: false };
        this.cargoView.setKind(o.food, o.size);
        this.cargoView.apply(this.carrying.cargo.summary());
        this.deps.sfx.pickup();
        const cu = this.map.customers.find((c) => c.id === o.customerId)!;
        this.deps.hud.popups.floatText(t('float.pickup'), { world: this.above(2.6), color: '#7dff9b' });
        this.deps.hud.popups.toast(t('toast.deliverTo', { dest: placeName(cu), req: o.request ? ' · ' + t(`req.${o.request}.text`) : '' }));
        this.particles.burst(this.bike.pos.x, 1.2, this.bike.pos.z, 14, 0x7dff9b, { spread: 3, life: 0.7, gravity: 6 });
        break;
      }
      case 'deliver': {
        const cu = this.map.customers.find((c) => c.id === ev.customerId)!;
        const door = ev.request === 'backDoor' ? cu.back : cu.front;
        const wall: [number, number, number] = [door.wallX + door.nx * 0.8, 4.2, door.wallZ + door.nz * 0.8];
        this.deps.hud.popups.bubble(formatQuote(ev.quote), wall, placeName(cu), 3200);
        this.deps.sfx.chime();
        for (let k = 0; k < 4; k++) {
          const colors = [0xffc93c, 0xe63946, 0x2a7de1, 0x2fbf71];
          this.particles.burst(door.x, 1.5, door.z, 10, colors[k]!, { spread: 4.5, dir: [0, 5, 0], life: 1.3, gravity: 9 });
        }
        if (ev.playerId === this.me) {
          this.deps.hud.popups.tip(ev.tip, formatTipParts(ev.parts), t('tipcard.who', { dest: placeName(cu) }));
          if (ev.request === 'noHorn' && ev.requestOk === false) this.deps.hud.popups.floatText(t('float.dogWoke'), { color: '#ff8a8a', size: 'small', jitter: 10 });
          this.pending = null;
          this.dropCargo();
        }
        this.teamTips = ev.teamTips;
        this.deps.hud.setTips(this.teamTips, Math.max(1, this.roster.size));
        break;
      }
      case 'honk': {
        if (ev.playerId !== this.me) {
          const dx = ev.p[0] - this.bike.pos.x;
          const dz = ev.p[2] - this.bike.pos.z;
          const dist = Math.hypot(dx, dz);
          this.deps.sfx.horn(Number.isFinite(dist) ? Math.max(0.12, 1 - dist / 90) : 0.3); // quieter the farther away
        }
        if (ev.dog) {
          const o = this.orders.find((x) => x.id === ev.orderId);
          const cu = o ? this.map.customers.find((c) => c.id === o.customerId) : undefined;
          this.deps.sfx.dogBark();
          const at: [number, number, number] = cu ? [cu.front.wallX, 3, cu.front.wallZ] : this.above(3);
          this.deps.hud.popups.floatText(t('float.dog'), { world: at, color: '#ffd35c', size: 'big', jitter: 20 });
          this.deps.hud.popups.bubble(t('bubble.dog'), at, t('bubble.dogWho'), 2200);
        }
        break;
      }
      case 'reject': {
        this.pending = null;
        this.dwell = 0;
        const rk = REJECT_KEYS[ev.reason];
        let text = rk ? t(rk) : undefined;
        if (ev.reason === 'wrongDoor') {
          const o = this.carrying?.order;
          text = t(o?.request === 'backDoor' ? 'reject.wrongDoor.back' : 'reject.wrongDoor.front');
        }
        if (ev.reason === 'notCarrier' && this.carrying && this.carrying.order.id === ev.orderId) this.dropCargo();
        if (text) {
          this.deps.hud.popups.toast(text);
          this.deps.sfx.fail();
        }
        break;
      }
      case 'debris':
        if (ev.playerId !== this.me) this.debris.spawn(ev.kind, ev.p, ev.v);
        break;
      case 'crash':
        if (ev.playerId !== this.me && Number.isFinite(ev.p[0]) && Number.isFinite(ev.p[2])) {
          this.particles.burst(ev.p[0], 1, ev.p[2], 20, 0xffe08a, { spread: 5, life: 0.9 });
          this.deps.sfx.thud(0.6);
        }
        break;
      default:
        break;
    }
  }

  /** world position a bit above the local bike, for popups */
  private above(h: number): [number, number, number] {
    const p = this.bike.pos;
    return [p.x, p.y + h, p.z];
  }

  // ------------------------------------------------------------------ main loop
  private frame(ts: number): void {
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, VIEW.MAX_FRAME_DT);
    this.time += dt;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    this.deps.transport.update(); // ticks the local room; may deliver messages (results! or a restart that disposes us)
    if (this.disposed) return;
    this.adaptQuality(dt);

    if (this.phase === 'playing' && !this.frozen) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < VIEW.MAX_SUBSTEPS) {
        this.fixedStep(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps >= VIEW.MAX_SUBSTEPS) this.acc = 0; // can't keep up: drop the backlog instead of spiralling
    }
    this.render(dt, this.phase === 'playing' ? this.acc / FIXED_DT : 1);
  }

  /** Real GPUs only: if the frame rate stays low, render at a lower resolution instead of stuttering. */
  private adaptQuality(dt: number): void {
    if (this.softwareGL || this.phase !== 'playing') return;
    this.adaptTimer += dt;
    if (this.adaptTimer < 1) return;
    this.adaptTimer = 0;
    this.lowFpsSeconds = this.fps < 45 ? this.lowFpsSeconds + 1 : 0;
    if (this.lowFpsSeconds >= 3 && this.pixelRatio > 0.6) {
      this.pixelRatio = Math.max(0.6, this.pixelRatio * 0.82);
      this.deps.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
      this.lowFpsSeconds = 0;
    }
  }

  // ------------------------------------------------------------------ fixed step (60 Hz)
  private fixedStep(dt: number): void {
    const input = this.deps.input;
    if (input.consumeReset()) {
      if (this.bike.reset()) {
        this.counters.resets++;
        this.deps.hud.popups.floatText(t('float.reset'), { world: this.above(2.4), color: '#9bd7ff', size: 'small' });
      }
    }
    if (input.consumeHonk()) this.honk();

    const bike = this.bike;
    bike.syncPrev();
    bike.preStep(dt, input.read());
    this.phys.world.step(dt);
    bike.postStep(dt);

    for (const e of bike.drainEvents()) this.onBikeEvent(e);

    const c = this.carrying;
    if (c) {
      const events = c.cargo.update(dt, bike.aLocal, bike.lean, bike.speed);
      for (const e of events) this.onCargoEvent(e, false);
    }

    this.updateZone(dt);

    this.netAcc += dt;
    if (this.netAcc >= 1 / GAME.STATE_HZ) {
      this.netAcc = 0;
      this.sendState();
    }
    // batched soup stat
    if (this.statSoup > 0 && this.time - this.statFlushAt > 0.5) {
      this.stat('soupSpilled', this.statSoup);
      this.statSoup = 0;
      this.statFlushAt = this.time;
    }
  }

  private honk(): void {
    if (this.time - this.lastHonkAt < BIKE.HONK_COOLDOWN) return;
    this.lastHonkAt = this.time;
    this.counters.honks++;
    this.deps.sfx.horn();
    this.deps.hud.popups.floatText(t('float.honk'), { world: this.above(2.6), color: '#ffe08a', size: 'small', jitter: 12 });
    const c = this.carrying;
    if (c && c.order.request === 'noHorn') {
      const d = targetDoor(this.map, c.order);
      if (d2(this.bike.pos.x, this.bike.pos.z, d.x, d.z) <= ZONE.HONK_RADIUS * ZONE.HONK_RADIUS) c.honkedNear = true;
    }
    this.send({ type: 'honk' });
  }

  private onBikeEvent(e: BikeEvent): void {
    const hud = this.deps.hud;
    const p = this.bike.pos;
    switch (e.type) {
      case 'crash': {
        hud.popups.floatText(t('float.crash'), { world: this.above(2.2), color: '#ff6b6b', size: 'big', jitter: 10 });
        hud.popups.flash();
        this.chase.addShake(VIEW.SHAKE_CRASH);
        this.deps.sfx.crash();
        this.particles.burst(p.x, 0.8, p.z, 26, 0xffe08a, { spread: 5, dir: [0, 2, 0], life: 0.9 });
        this.particles.burst(p.x, 0.6, p.z, 16, 0xcfc7b6, { spread: 3, life: 1.1, gravity: 2 });
        this.stat('crashes', 1);
        if (this.carrying) {
          this.carrying.crashedDuring = true;
          for (const ce of this.carrying.cargo.onCrash()) this.onCargoEvent(ce, true);
        }
        break;
      }
      case 'wallHit':
        this.chase.addShake(VIEW.SHAKE_HIT * Math.min(1, e.speed / 8));
        this.deps.sfx.thud(Math.min(1, e.speed / 8));
        this.particles.burst(p.x + e.nx * 0.5, 0.7, p.z + e.nz * 0.5, 10, 0xffdd66, { spread: 2.5, life: 0.5 });
        if (e.speed > 4.5) hud.popups.floatText(t('float.bang'), { world: this.above(2.4), color: '#ffe08a', size: 'small', jitter: 30 });
        break;
      case 'bump':
        this.deps.sfx.thud(Math.min(1, e.strength / 60));
        this.chase.addShake(0.08);
        break;
      case 'landed':
        this.chase.addShake(Math.min(0.5, VIEW.SHAKE_LAND * (e.impact / 8)));
        this.deps.sfx.thud(Math.min(1, e.impact / 10));
        this.particles.burst(p.x, 0.3, p.z, 14, 0xd9cfb8, { spread: 3.5, life: 0.8, gravity: 3 });
        this.stat('maxAirTime', e.airTime);
        if (e.airTime > 0.4 && this.time - this.lastLandPopup > 1) {
          this.lastLandPopup = this.time;
          hud.popups.floatText(t('float.air', { s: e.airTime.toFixed(1) }), { world: this.above(2.6), color: '#9bd7ff', size: 'small' });
        }
        break;
      case 'reset':
        break;
      case 'recovered':
        break;
      case 'takeoff':
        break;
    }
  }

  private onCargoEvent(e: CargoEvent, fromCrash: boolean): void {
    const hud = this.deps.hud;
    const b = this.bike;
    const h = b.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = -Math.cos(h);
    const rz = Math.sin(h);
    const v = b.body.velocity;
    const pos = this.tmpV2;
    switch (e.type) {
      case 'spill': {
        this.statSoup += e.amount;
        this.spillAcc += e.amount;
        // droplets from the heaped side of the bowl
        this.cargoView.slotWorldPosition(0, pos);
        const n = Math.min(12, Math.ceil(e.amount * 60));
        const dirR = Math.sign(e.dirX) * 1.8;
        const dirF = Math.sign(e.dirZ) * 1.8;
        this.particles.burst(pos.x, pos.y + 0.3, pos.z, n, 0xffa63d, {
          spread: 1.4,
          dir: [rx * dirR + fx * dirF + v.x * 0.5, 2.2, rz * dirR + fz * dirF + v.z * 0.5],
          life: 0.8,
          gravity: 14,
        });
        if (e.crash) {
          for (let i = 0; i < CARGO.SOUP.CRASH_DROPS; i++) {
            const a = Math.random() * Math.PI * 2;
            this.debris.spawn('drop', [pos.x, pos.y + 0.3, pos.z], [v.x * 0.6 + Math.cos(a) * 3, 3 + Math.random() * 3, v.z * 0.6 + Math.sin(a) * 3], 3);
          }
          this.deps.sfx.spill(1, true);
          this.spillAcc = 0;
          this.spillSoundAcc = 0;
          this.spillSoundAt = this.time;
          this.spillPopupAt = this.time;
          hud.popups.floatText(t('float.splash'), { world: this.above(3.2), color: '#ffb84d', jitter: 30 });
        } else {
          // a continuous spill: a light drip tick, or a real splash only for a big gulp; never faster than the sfx gap
          this.spillSoundAcc += e.amount;
          if (this.spillSoundAcc > 0.004 && this.time - this.spillSoundAt >= AUDIO.SPLASH_MIN_GAP_MS / 1000) {
            this.spillSoundAt = this.time;
            this.deps.sfx.spill(this.spillSoundAcc);
            this.spillSoundAcc = 0;
          }
          if (this.spillAcc > 0.05 && this.time - this.spillPopupAt > 1.1) {
            this.spillPopupAt = this.time;
            hud.popups.floatText(t(SPILL_KEYS[Math.floor(Math.random() * SPILL_KEYS.length)]!), { world: this.above(3.0), color: '#ffb84d' });
            this.spillAcc = 0;
          }
        }
        break;
      }
      case 'boxLost': {
        this.cargoView.slotWorldPosition(e.index, pos);
        const spread = fromCrash ? 5.5 : 3.2;
        const vel: [number, number, number] = [
          v.x + (rx * e.dirX + fx * e.dirZ) * spread + (Math.random() - 0.5) * 2,
          3 + Math.random() * 2.5,
          v.z + (rz * e.dirX + fz * e.dirZ) * spread + (Math.random() - 0.5) * 2,
        ];
        this.debris.spawn('pizza', [pos.x, pos.y, pos.z], vel, 8);
        this.send({ type: 'debris', kind: 'pizza', p: [pos.x, pos.y, pos.z], v: vel });
        this.stat('pizzasLost', 1);
        if (!fromCrash || e.index === 0) {
          hud.popups.floatText(t('float.pizza'), { world: this.above(3.2), color: '#ffd35c', jitter: 30 });
          this.deps.sfx.pop();
        }
        break;
      }
      case 'scoopLost': {
        this.cargoView.slotWorldPosition(e.index, pos);
        const vel: [number, number, number] = [v.x * 0.9 + (Math.random() - 0.5) * 3, 3 + Math.random() * 2, v.z * 0.9 + (Math.random() - 0.5) * 3];
        this.debris.spawn('scoop', [pos.x, pos.y, pos.z], vel, 5);
        this.send({ type: 'debris', kind: 'scoop', p: [pos.x, pos.y, pos.z], v: vel });
        this.stat('scoopsLost', 1);
        hud.popups.floatText(t('float.scoop'), { world: this.above(3.2), color: '#ff9cc8', jitter: 30 });
        this.deps.sfx.pop();
        break;
      }
    }
  }

  // ------------------------------------------------------------------ pickup / delivery zones
  private findZone(): ZoneTarget | null {
    const px = this.bike.pos.x;
    const pz = this.bike.pos.z;
    const R2 = ZONE.RADIUS * ZONE.RADIUS;
    if (this.carrying) {
      const o = this.carrying.order;
      const d = targetDoor(this.map, o);
      return d2(px, pz, d.x, d.z) <= R2 ? { kind: 'deliver', order: o, door: d } : null;
    }
    let best: ZoneTarget | null = null;
    for (const o of this.orders) {
      if (o.status !== 'waiting') continue;
      const d = this.restaurantDoors.get(o.restaurantId)!;
      if (d2(px, pz, d.x, d.z) <= R2 && (!best || o.createdAt < best.order.createdAt)) best = { kind: 'pickup', order: o, door: d };
    }
    return best;
  }

  private updateZone(dt: number): void {
    const b = this.bike;
    const z = this.findZone();
    this.zone = z;
    const slow = b.speed < ZONE.MAX_SPEED && !b.crashed && !b.airborne;
    if (z && slow) this.dwell += dt;
    else this.dwell = 0;

    if (this.pending && this.time > this.pending.until) this.pending = null;
    if (z && this.dwell >= ZONE.DWELL && !this.pending) {
      this.pending = { orderId: z.order.id, kind: z.kind, until: this.time + 1.2 };
      if (z.kind === 'pickup') this.send({ type: 'pickup', orderId: z.order.id });
      else {
        const c = this.carrying!;
        this.send({ type: 'deliver', orderId: z.order.id, integrity: c.cargo.integrity, crashedDuring: c.crashedDuring, honkedNear: c.honkedNear });
      }
    }

    // friendly hint when someone stops at the wrong door of the right house
    const c = this.carrying;
    if (c && !z) {
      const cu = this.map.customers.find((x) => x.id === c.order.customerId)!;
      const other = c.order.request === 'backDoor' ? cu.front : cu.back;
      if (slow && d2(b.pos.x, b.pos.z, other.x, other.z) <= ZONE.RADIUS * ZONE.RADIUS) this.wrongDwell += dt;
      else this.wrongDwell = 0;
      if (this.wrongDwell > 0.6 && this.time - this.wrongHintAt > 4) {
        this.wrongHintAt = this.time;
        this.deps.hud.popups.toast(t(c.order.request === 'backDoor' ? 'reject.wrongDoor.back' : 'reject.wrongDoor.front'));
      }
    } else this.wrongDwell = 0;
  }

  // ------------------------------------------------------------------ render
  private primaryTarget(): { door: Door; color: number; kind: 'pickup' | 'deliver' } | null {
    const bx = this.bike.pos.x;
    const bz = this.bike.pos.z;
    if (this.carrying) return { door: targetDoor(this.map, this.carrying.order), color: 0xffffff, kind: 'deliver' };
    let best: { door: Door; color: number; kind: 'pickup' } | null = null;
    let bd = Infinity;
    const seen = new Set<string>();
    for (const o of this.orders) {
      if (o.status !== 'waiting' || seen.has(o.restaurantId)) continue;
      seen.add(o.restaurantId);
      const r = this.map.restaurants.find((x) => x.id === o.restaurantId)!;
      const d = d2(bx, bz, r.door.x, r.door.z);
      if (d < bd) {
        bd = d;
        best = { door: r.door, color: r.color, kind: 'pickup' };
      }
    }
    return best;
  }

  private render(dt: number, alpha: number): void {
    const { bike, deps } = this;
    const hud = deps.hud;
    const playing = this.phase === 'playing';

    // interpolate the bike between physics ticks
    const it = this.interp;
    it.x = bike.prevPos.x + (bike.pos.x - bike.prevPos.x) * alpha;
    it.y = bike.prevPos.y + (bike.pos.y - bike.prevPos.y) * alpha;
    it.z = bike.prevPos.z + (bike.pos.z - bike.prevPos.z) * alpha;
    it.heading = bike.prevHeading + (bike.heading - bike.prevHeading) * alpha;
    it.lean = bike.prevLean + (bike.lean - bike.prevLean) * alpha;

    this.bikeModel.update(
      {
        x: it.x,
        y: it.y - BIKE.RADIUS,
        z: it.z,
        heading: it.heading,
        lean: it.lean,
        speedFwd: bike.speedFwd,
        steer: bike.steerSmooth,
        crashT: bike.crashProgress,
        crashSide: bike.crashSide,
      },
      dt,
    );
    if (this.carrying) this.cargoView.apply(this.carrying.cargo.summary());

    // melting ice cream drips
    const c = this.carrying;
    if (c && c.cargo.kind === 'ice' && playing) {
      const melt = c.cargo.summary().b;
      if (melt > 0.25 && Math.random() < melt * 0.25) {
        this.cargoView.slotWorldPosition(0, this.tmpV2);
        this.particles.burst(this.tmpV2.x, this.tmpV2.y - 0.1, this.tmpV2.z, 1, 0xff9cc8, { spread: 0.3, life: 0.6, gravity: 9 });
      }
    }

    for (const r of this.remotes.values()) r.update(dt, this.now(), this.chase.camera.position);
    this.debris.update(dt);
    this.particles.update(dt);
    this.chase.update(dt, it.x, it.y - BIKE.RADIUS, it.z, it.heading, bike.speed, this.map);
    this.world.followSun(this.tmpV.set(it.x, 0, it.z));
    this.world.update(this.time, this.chase.camera.position);

    this.updateGuidance(hud);
    hud.popups.update();

    // HUD text (cheap)
    hud.setTime(this.timeLeft());
    const resetReady = Math.max(0, 1 - bike.resetCooldown / BIKE.RESET_COOLDOWN);
    hud.setSpeed(bike.speed, resetReady);
    deps.touch?.setResetReady(resetReady);
    if (c) hud.setCargo({ kind: c.cargo.kind, integrity: c.cargo.integrity, detail: formatCargoStatus(c.cargo.status) }, this.cargoHint(c));
    else hud.setCargo(null, t(this.orders.some((o) => o.status === 'waiting') ? 'hud.hintPickup' : 'hud.hintWait'));
    this.hudAcc += dt;
    if (this.hudAcc > 0.1) {
      this.hudAcc = 0;
      hud.updateOrderBars(this.now());
    }

    // minimap
    const players = [{ x: it.x, z: it.z, heading: it.heading, color: this.bikeModel.color, me: true }];
    for (const r of this.remotes.values()) players.push({ x: r.pos[0], z: r.pos[2], heading: r.heading, color: PLAYER_COLORS[r.info.color] ?? 0xffffff, me: false });
    const active = new Set<string>();
    if (!this.carrying) for (const o of this.orders) if (o.status === 'waiting') active.add(o.restaurantId);
    const targets: MinimapMarker[] = [];
    const pt = this.primaryTarget();
    if (pt) targets.push({ x: pt.door.x, z: pt.door.z, color: pt.kind === 'deliver' ? 0x1b1b1b : pt.color, pulse: true });
    this.minimap.draw(players, active, targets, this.time);

    // audio
    deps.sfx.setEngine(bike.speed / BIKE.VMAX, playing && !bike.crashed ? deps.input.read().throttle : 0, playing && !bike.crashed);

    if (deps.debug) {
      hud.setDebug(
        `FPS ${this.fps.toFixed(0)}  calls ${deps.renderer.info.render.calls}  tris ${(deps.renderer.info.render.triangles / 1000).toFixed(0)}k  debris ${this.debris.count}  px ${this.pixelRatio.toFixed(2)}  shadows ${deps.renderer.shadowMap.enabled ? 'on' : 'off'}${this.softwareGL ? '  [software GL]' : ''}\n` +
          `pos ${bike.pos.x.toFixed(1)},${bike.pos.z.toFixed(1)}  v ${bike.speed.toFixed(1)}  lean ${bike.lean.toFixed(2)}  air ${bike.airborne ? bike.airTime.toFixed(2) : '-'}\n` +
          `aLocal ${bike.aLocal.x.toFixed(1)}, ${bike.aLocal.y.toFixed(1)}, ${bike.aLocal.z.toFixed(1)}  dwell ${this.dwell.toFixed(2)}  ${c ? formatCargoStatus(c.cargo.status) : 'no cargo'}`,
      );
    }

    deps.renderer.render(this.world.scene, this.chase.camera);
  }

  private cargoHint(c: Carrying): string {
    const cu = this.map.customers.find((x) => x.id === c.order.customerId)!;
    const req = c.order.request ? ` · ${REQUEST_INFO[c.order.request].icon} ${t(`req.${c.order.request}.short`)}` : '';
    return t('hud.hintDeliver', { dest: placeName(cu), req });
  }

  /** HUD panels + touch buttons the target arrow must stay out of (re-measured a few times a second) */
  private panelRects(): ScreenRect[] {
    if (this.time - this.hudRectsAt > 0.3) {
      this.hudRectsAt = this.time;
      this.hudRects = [...this.deps.hud.rects(), ...(this.deps.touch?.rects() ?? [])];
    }
    return this.hudRects;
  }

  /** pillars, minimap-independent screen guidance: edge arrow + zone progress ring */
  private updateGuidance(hud: Hud): void {
    const w = this.world;
    const carrying = this.carrying;
    const waitingBy = new Set(this.orders.filter((o) => o.status === 'waiting').map((o) => o.restaurantId));
    this.map.restaurants.forEach((r, i) => w.restaurantMarkers[i]!.setVisible(!carrying && waitingBy.has(r.id)));
    if (carrying) {
      const d = targetDoor(this.map, carrying.order);
      w.customerMarker.setPosition(d.x, d.z);
      w.customerMarker.setVisible(true);
    } else w.customerMarker.setVisible(false);

    // arrow to the primary target when it is off-screen
    const pt = this.phase === 'playing' ? this.primaryTarget() : null;
    if (pt) {
      const cam = this.chase.camera;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const v = this.tmpV.set(pt.door.x, 3, pt.door.z);
      const inView = v.clone().applyMatrix4(cam.matrixWorldInverse); // camera space: looks down -z
      const ndc = v.clone().project(cam);
      const onScreen = inView.z < 0 && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.82;
      if (onScreen) hud.setArrow(null);
      else {
        let dx = inView.x;
        let dy = -inView.y;
        if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) dy = 1;
        const m = isCompactScreen() ? 44 : 70;
        const k = Math.min((W / 2 - m) / Math.max(1e-6, Math.abs(dx)), (H / 2 - m) / Math.max(1e-6, Math.abs(dy)));
        const [ax, ay] = avoidHud(W / 2 + dx * k, H / 2 + dy * k, W, H, m, this.panelRects());
        hud.setArrow({
          x: ax,
          y: ay,
          angle: Math.atan2(dx, -dy),
          color: hex(pt.color),
          dist: Math.hypot(pt.door.x - this.bike.pos.x, pt.door.z - this.bike.pos.z),
        });
      }
    } else hud.setArrow(null);

    // progress ring around the bike while stopping in a zone
    if (this.zone && this.phase === 'playing') {
      const p = this.project(this.bike.pos.x, this.bike.pos.y + 1.6, this.bike.pos.z);
      const slow = this.bike.speed < ZONE.MAX_SPEED;
      hud.setZone({
        x: p.x,
        y: p.y,
        progress: this.pending ? 1 : this.dwell / ZONE.DWELL,
        label: this.pending ? '…' : slow ? t(this.zone.kind === 'pickup' ? 'zone.pickup' : 'zone.deliver') : t('zone.stop'),
      });
    } else hud.setZone(null);
  }

  // ------------------------------------------------------------------ test hooks (DESIGN §10.4)
  getState() {
    const b = this.bike;
    // everyone in the room, in join order; teammates' positions are sampled on demand from their interpolation buffers
    const carrier = (id: string) => this.orders.find((o) => o.carrierId === id && o.status === 'carrying')?.id;
    const players: { id: string; name: string; color: number; pos: [number, number, number]; carrying: string | undefined }[] = [];
    for (const info of this.roster.values()) {
      const color = PLAYER_COLORS[info.color] ?? PLAYER_COLORS[0]!;
      if (info.id === this.me) players.push({ id: info.id, name: info.name, color, pos: [b.pos.x, b.pos.y, b.pos.z], carrying: this.carrying?.order.id ?? carrier(info.id) });
      else players.push({ id: info.id, name: info.name, color, pos: this.remotes.get(info.id)?.positionAt(this.now()) ?? [0, 0, 0], carrying: carrier(info.id) });
    }
    const c = this.carrying;
    return {
      timeLeft: this.timeLeft(),
      teamTips: this.teamTips,
      players,
      orders: this.orders,
      bike: { pos: [b.pos.x, b.pos.y, b.pos.z] as [number, number, number], heading: b.heading, speed: b.speed, lean: b.lean, crashed: b.crashed, airborne: b.airborne },
      cargo: c ? { kind: c.cargo.kind, integrity: c.cargo.integrity, detail: formatCargoStatus(c.cargo.status), summary: c.cargo.summary() } : null,
      input: { ...this.deps.input.last },
      counters: { ...this.counters },
      fps: Math.round(this.fps),
    };
  }

  readonly debug = {
    setInput: (p: InputOverride | null) => this.deps.input.setOverride(p),
    teleport: (x: number, z: number, heading?: number) => {
      this.bike.place(x, z, heading ?? this.bike.heading);
      this.dwell = 0;
      this.pending = null;
      this.chase.snapTo(x, 0.5, z, this.bike.heading);
      this.sendState();
    },
    forceCrash: () => this.bike.forceCrash('forced'),
    giveOrder: (orderId?: string) => this.send({ type: 'debugGive', orderId }),
    location: (id: string): [number, number] | null => {
      const d = doorOf(this.map, id);
      return d ? [d.x, d.z] : null;
    },
    honk: () => this.honk(),
    /** screen rectangles of the HUD panels and touch buttons (QA: nothing may overlap the buttons) */
    hudRects: () => ({ hud: this.deps.hud.rects(), touch: this.deps.touch?.rects() ?? [] }),
    /** static map summary for test scripts (positions in metres) */
    map: () => ({
      seed: this.map.seed,
      half: this.map.half,
      restaurants: this.map.restaurants.map((r) => ({ id: r.id, name: r.name, nameEn: r.nameEn, food: r.food, x: r.door.x, z: r.door.z })),
      customers: this.map.customers.map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn, front: [c.front.x, c.front.z], back: [c.back.x, c.back.z] })),
      ramps: this.map.ramps.map((r) => ({ x: r.x, z: r.z, dir: r.dir, len: r.len, width: r.width, height: r.height })),
      bumps: this.map.bumps.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
      obstacles: this.map.obstacles.map((o) => ({ x: o.x, z: o.z, kind: o.kind })),
      spawns: this.map.spawns,
    }),
    /** where the given order (default: the carried one) needs to go next: [x, z] */
    targetFor: (orderId?: string): [number, number] | null => {
      const o = orderId ? this.orders.find((x) => x.id === orderId) : (this.carrying?.order ?? this.orders.find((x) => x.status === 'waiting'));
      if (!o) return null;
      const mine = this.carrying?.order.id === o.id; // (the copy we hold predates the status change)
      const d = mine || o.status === 'carrying' ? targetDoor(this.map, o) : this.restaurantDoors.get(o.restaurantId)!;
      return [d.x, d.z];
    },
  };
}

/**
 * Keep the edge arrow out of the HUD panels and touch buttons: if the ideal spot is covered, slide it along the
 * (inset) screen border to the nearest spot that is free.
 */
function avoidHud(x: number, y: number, W: number, H: number, m: number, panels: ScreenRect[]): [number, number] {
  const pad = 36; // half the arrow plus a little air
  const hit = (px: number, py: number) => panels.some((r) => px > r.x0 - pad && px < r.x1 + pad && py > r.y0 - pad && py < r.y1 + pad);
  if (!hit(x, y)) return [x, y];
  let best: [number, number] | null = null;
  let bestD = Infinity;
  const step = 8;
  const consider = (px: number, py: number) => {
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bestD && !hit(px, py)) {
      bestD = d;
      best = [px, py];
    }
  };
  for (let px = m; px <= W - m; px += step) {
    consider(px, m);
    consider(px, H - m);
  }
  for (let py = m; py <= H - m; py += step) {
    consider(m, py);
    consider(W - m, py);
  }
  return best ?? [x, y];
}

function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch {
    return false;
  }
}
