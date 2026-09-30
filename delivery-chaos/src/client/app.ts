// Application shell: URL params, renderer, screens (menu / lobby / game / results) and the transport wiring.
import * as THREE from 'three';
import { PLAYER_COLORS } from '../shared/constants';
import type { ClientMsg, ResultsMsg, RoomPhase, RoomPlayerInfo, ServerMsg } from '../shared/protocol';
import { Sfx } from './audio';
import { Game } from './game';
import { Input } from './input';
import { LocalTransport } from './net/localTransport';
import type { Transport } from './net/transport';
import { WsTransport } from './net/wsTransport';
import { Hud } from './ui/hud';
import { Lobby } from './ui/lobby';
import { Menu, loadName } from './ui/menu';
import { Notice } from './ui/notice';
import { Results } from './ui/results';
import './ui/style.css';

export interface UrlParams {
  solo: boolean;
  seed?: number;
  autostart: boolean;
  debug: boolean;
  nosfx: boolean;
  noshadow: boolean;
  shadows: boolean;
  duration?: number;
  room?: string;
  create: boolean;
  name?: string;
}

export function parseParams(search: string): UrlParams {
  const q = new URLSearchParams(search);
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    solo: q.has('solo'),
    seed: num('seed'),
    autostart: q.has('autostart'),
    debug: q.has('debug'),
    nosfx: q.has('nosfx'),
    noshadow: q.has('noshadow'),
    shadows: q.has('shadows'),
    duration: num('duration'),
    room: q.get('room')?.toUpperCase() || undefined,
    create: q.has('create'),
    name: q.get('name') || undefined,
  };
}

export type AppPhase = 'menu' | 'lobby' | 'playing' | 'results';

interface RoomInfo {
  code: string;
  hostId: string | null;
  phase: RoomPhase;
  players: RoomPlayerInfo[];
}

export class App {
  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly hud: Hud;
  private readonly sfx: Sfx;
  private readonly input = new Input();
  private readonly menu: Menu;
  private readonly lobby: Lobby;
  private readonly results: Results;
  private readonly notice: Notice;
  private transport: Transport | null = null;
  private unsub: (() => void) | null = null;
  private game: Game | null = null;
  private phase: AppPhase = 'menu';
  private room: RoomInfo | null = null;
  private myId = '';
  private solo = false;
  private wantAutostart = false;
  private lastResults: ResultsMsg | null = null;
  private disconnected = false;

  constructor(private readonly params: UrlParams) {
    const ui = document.getElementById('ui')!;
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.shadowMap.enabled = !params.noshadow;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setClearColor(0x8fd3ff);
    } catch (err) {
      console.warn('WebGL unavailable', err);
    }
    this.renderer = renderer;
    this.sfx = new Sfx(!params.nosfx);
    this.hud = new Hud(ui, params.debug);
    this.notice = new Notice(ui, () => this.toMenu());
    this.menu = new Menu(
      ui,
      {
        onSolo: (name) => void this.startSolo(name, true),
        onCreate: (name) => void this.startOnline('create', name),
        onJoin: (name, code) => {
          if (!/^[A-Z]{4}$/.test(code)) this.notice.toast('请输入4位房间码');
          else void this.startOnline('join', name, code);
        },
      },
      params.name ?? loadName(),
      true,
    );
    this.lobby = new Lobby(ui, {
      onStart: () => this.transport?.send({ type: 'startGame', ...this.startOverrides() }),
      onLeave: () => this.toMenu(),
      onCopyInvite: (code) => void this.copyInvite(code),
    });
    this.results = new Results(ui);
    this.input.attach();
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** Decide the first screen from the URL. */
  boot(): void {
    const p = this.params;
    if (p.solo) {
      this.menu.hide();
      void this.startSolo(p.name ?? loadName(), p.autostart);
    } else if (p.create) {
      this.menu.hide();
      void this.startOnline('create', p.name ?? loadName());
    } else if (p.room) {
      this.menu.hide();
      void this.startOnline('join', p.name ?? loadName(), p.room);
    } else {
      this.menu.show();
    }
  }

  private startOverrides(): { seed?: number; duration?: number } {
    const o: { seed?: number; duration?: number } = {};
    if (this.params.seed !== undefined) o.seed = this.params.seed;
    if (this.params.duration !== undefined) o.duration = this.params.duration;
    return o;
  }

  private async startSolo(name: string, autostart: boolean): Promise<void> {
    if (!this.renderer) {
      this.menu.show();
      alert('你的浏览器不支持 WebGL，无法运行游戏。');
      return;
    }
    this.teardown();
    this.solo = true;
    this.wantAutostart = autostart;
    this.menu.hide();
    const t = new LocalTransport();
    this.attach(t);
    await t.connect(name);
  }

  private async startOnline(mode: 'create' | 'join', name: string, code = ''): Promise<void> {
    if (!this.renderer) {
      this.menu.show();
      alert('你的浏览器不支持 WebGL，无法运行游戏。');
      return;
    }
    this.teardown();
    this.solo = false;
    this.wantAutostart = false;
    this.menu.hide();
    const t = new WsTransport();
    this.attach(t);
    t.onClose((reason) => this.onDisconnected(reason));
    try {
      await t.connect(name);
    } catch (err) {
      if (this.transport === t) {
        this.toMenu();
        this.notice.toast(err instanceof Error ? err.message : '无法连接服务器');
      }
      return;
    }
    if (this.transport !== t) return; // the user left while we were connecting
    t.send(mode === 'create' ? { type: 'createRoom' } : { type: 'joinRoom', code });
  }

  private onDisconnected(reason: string): void {
    this.disconnected = true;
    this.game?.freeze();
    this.input.enabled = false;
    this.notice.showDisconnected(reason === '连接断开' ? '与服务器的连接已断开，这局无法继续了。' : reason);
  }

  private async copyInvite(code: string): Promise<void> {
    const link = `${window.location.origin}/?room=${code}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(link);
      ok = true;
    } catch {
      // clipboard API needs https / localhost: fall back to a temporary textarea
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
    }
    this.notice.toast(ok ? `已复制邀请链接：${link}` : `请手动复制：${link}`);
  }

  private attach(t: Transport): void {
    this.transport = t;
    this.unsub = t.onMessage((m) => this.onMessage(m));
  }

  /** drop the current game + connection (back to a clean slate) */
  private teardown(): void {
    this.game?.dispose();
    this.game = null;
    this.unsub?.();
    this.unsub = null;
    this.transport?.close();
    this.transport = null;
    this.room = null;
    this.myId = '';
    this.lastResults = null;
    this.disconnected = false;
    this.results.hide();
    this.lobby.hide();
    this.notice.hideDisconnected();
    this.input.enabled = true;
  }

  private toMenu(): void {
    this.teardown();
    this.phase = 'menu';
    this.menu.show();
  }

  send(msg: ClientMsg): void {
    this.transport?.send(msg);
  }

  // ------------------------------------------------------------------ messages
  private onMessage(msg: ServerMsg): void {
    switch (msg.type) {
      case 'welcome':
        this.myId = msg.id;
        break;
      case 'room':
        this.room = { code: msg.code, hostId: msg.hostId, phase: msg.phase, players: msg.players };
        this.onRoom(this.room);
        break;
      case 'start':
        this.beginGame(msg);
        break;
      case 'results':
        this.lastResults = msg;
        this.phase = 'results';
        this.game?.finish(msg);
        this.showResults();
        break;
      case 'error':
        if (!this.room && this.transport?.kind === 'ws') {
          // couldn't get into a room (wrong code, full, already playing ...): back to the menu with the reason
          this.toMenu();
        }
        this.notice.toast(msg.msg);
        break;
      default:
        break;
    }
    this.game?.handleMessage(msg);
  }

  private onRoom(room: RoomInfo): void {
    if (room.phase === 'playing') return; // the running game tracks its own roster
    if (room.phase === 'results' && this.phase === 'results' && this.lastResults) {
      this.showResults(); // the host may have changed: refresh the buttons
      return;
    }
    // lobby, or we joined between rounds: wait in the lobby for the host
    this.game?.dispose();
    this.game = null;
    this.results.hide();
    if (this.wantAutostart) {
      this.wantAutostart = false;
      this.transport?.send({ type: 'startGame', ...this.startOverrides() });
      return;
    }
    this.phase = 'lobby';
    this.lobby.show({ code: room.code, solo: this.solo, hostId: room.hostId, myId: this.myId, players: room.players });
  }

  private showResults(): void {
    if (!this.lastResults) return;
    this.results.show(this.lastResults, this.myId, this.isHost(), {
      onRestart: () => this.restart(),
      onMenu: () => this.toMenu(),
    });
  }

  private isHost(): boolean {
    return this.room?.hostId === this.myId;
  }

  /** host's "再来一局": straight into a fresh round for everybody (no detour through the lobby) */
  private restart(): void {
    this.transport?.send({ type: 'startGame', ...this.startOverrides() });
  }

  private beginGame(msg: Extract<ServerMsg, { type: 'start' }>): void {
    if (!this.renderer || !this.transport) return;
    this.game?.dispose();
    this.lobby.hide();
    this.menu.hide();
    this.results.hide();
    this.lastResults = null;
    this.input.enabled = true;
    this.input.setOverride(null); // a new round starts with clean controls
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); // Space must not re-press a menu button
    this.phase = 'playing';
    this.game = new Game(
      { renderer: this.renderer, transport: this.transport, hud: this.hud, sfx: this.sfx, input: this.input, debug: this.params.debug, shadows: !this.params.noshadow, forceShadows: this.params.shadows },
      { seed: msg.seed, duration: msg.duration, startTime: msg.serverTime, players: this.room?.players ?? [], myId: this.myId },
    );
    this.game.start();
  }

  // ------------------------------------------------------------------ test hooks
  getState() {
    const g = this.game;
    const base = {
      phase: this.phase,
      roomCode: this.room?.code,
      myId: this.myId || undefined,
      results: this.lastResults ?? undefined,
      disconnected: this.disconnected || undefined,
    };
    if (!g) {
      return {
        ...base,
        timeLeft: 0,
        teamTips: 0,
        // lobby / menu: the roster from the room (no positions yet)
        players: (this.room?.players ?? []).map((p) => ({ id: p.id, name: p.name, color: PLAYER_COLORS[p.color] ?? 0, pos: [0, 0, 0] as [number, number, number], carrying: undefined as string | undefined })),
        orders: [] as unknown[],
        bike: { pos: [0, 0, 0], heading: 0, speed: 0, lean: 0, crashed: false, airborne: false },
        cargo: null,
        fps: 0,
      };
    }
    return { ...base, ...g.getState() };
  }

  readonly debug = {
    setInput: (p: Parameters<Input['setOverride']>[0]) => this.input.setOverride(p),
    teleport: (x: number, z: number, heading?: number) => this.game?.debug.teleport(x, z, heading),
    forceCrash: () => this.game?.debug.forceCrash(),
    giveOrder: (orderId?: string) => this.game?.debug.giveOrder(orderId),
    location: (id: string): [number, number] | null => this.game?.debug.location(id) ?? null,
    honk: () => this.game?.debug.honk(),
    map: () => this.game?.debug.map() ?? null,
    targetFor: (orderId?: string) => this.game?.debug.targetFor(orderId) ?? null,
    /** feed a server message to the client as if it arrived from the transport (simulate teammates, events, ...) */
    inject: (msg: ServerMsg) => this.onMessage(msg),
    /** end the round immediately (solo only) */
    endGame: () => {
      if (this.transport instanceof LocalTransport) this.transport.debugEndNow();
    },
  };
}
