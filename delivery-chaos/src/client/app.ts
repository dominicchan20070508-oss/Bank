// Application shell: URL params, renderer, screens (menu / lobby / game / results) and the transport wiring.
import * as THREE from 'three';
import { PLAYER_COLORS, TOUCH } from '../shared/constants';
import type { ClientMsg, ResultsMsg, RoomPhase, RoomPlayerInfo, ServerMsg } from '../shared/protocol';
import { Sfx } from './audio';
import { Game, type GameDeps } from './game';
import { errorText, getLang, initLang, netText, onLangChange, setLang, t, type Lang } from './i18n';
import { Input } from './input';
import { LocalTransport } from './net/localTransport';
import type { Transport } from './net/transport';
import { WsTransport } from './net/wsTransport';
import { TouchControls, detectTouchDevice } from './touch';
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
  /** force the on-screen touch controls (QA on a desktop browser) */
  touch: boolean;
  /** ?lang=zh|en (handled by i18n.initLang; kept here for completeness) */
  lang?: Lang;
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
    touch: q.has('touch'),
    lang: q.get('lang') === 'zh' ? 'zh' : q.get('lang') === 'en' ? 'en' : undefined,
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
  private touchUI = false;
  private touch: TouchControls | null = null;
  private gameDeps: GameDeps | null = null;
  private readonly rotateEl: HTMLElement;

  constructor(private readonly params: UrlParams) {
    initLang(window.location.search);
    this.touchUI = params.touch || detectTouchDevice();
    document.body.classList.toggle('touch', this.touchUI);
    const ui = document.getElementById('ui')!;
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.touchUI ? TOUCH.PIXEL_RATIO_MAX : 1.5));
      renderer.shadowMap.enabled = !params.noshadow;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setClearColor(0x8fd3ff);
    } catch (err) {
      console.warn('WebGL unavailable', err);
    }
    this.renderer = renderer;
    this.sfx = new Sfx(!params.nosfx);
    this.sfx.attachLifecycle(); // gesture unlocking (iOS), hidden-tab silence
    this.hud = new Hud(ui, params.debug);
    this.hud.setMuteHandler(() => this.toggleMute());
    // the order cards (top right) must stay above the touch buttons (bottom right)
    this.hud.setBottomLimit(() => (this.touch?.rects().filter((r) => r.x0 > window.innerWidth / 2).reduce((m, r) => Math.min(m, r.y0), Infinity) ?? Infinity));
    this.rotateEl = document.createElement('div');
    this.rotateEl.className = 'rotate';
    this.rotateEl.hidden = true;
    ui.append(this.rotateEl);
    this.renderRotate();
    this.notice = new Notice(ui, () => this.toMenu());
    this.menu = new Menu(
      ui,
      {
        onSolo: (name) => void this.startSolo(name, true),
        onCreate: (name) => void this.startOnline('create', name),
        onJoin: (name, code) => {
          if (!/^[A-Z]{4}$/.test(code)) this.notice.toast(t('toast.codeInvalid'));
          else void this.startOnline('join', name, code);
        },
        onToggleMute: () => this.toggleMute(),
      },
      params.name ?? loadName(),
      true,
    );
    this.lobby = new Lobby(ui, {
      onStart: () => {
        this.tryFullscreen();
        this.transport?.send({ type: 'startGame', ...this.startOverrides() });
      },
      onLeave: () => this.toMenu(),
      onInvite: (code) => void this.invite(code),
    });
    this.results = new Results(ui);
    this.input.attach();
    if (this.touchUI) this.enableTouchUI();
    this.updateMuteUi();
    // phones that were not detected as touch devices (touch-screen laptops): switch on the first real touch
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.touchUI) this.enableTouchUI();
      },
      { capture: true, passive: true },
    );
    // M = mute
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.toggleMute();
    });
    // iOS Safari: no pinch / double-tap zoom, whatever the viewport meta says
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => {
      if (this.touchUI) e.preventDefault();
    });
    window.addEventListener('resize', () => this.updateRotate());
    window.addEventListener('orientationchange', () => this.updateRotate());
    onLangChange(() => {
      this.notice.applyLang();
      this.touch?.applyLang();
      this.renderRotate();
      this.lobby.refresh();
      if (this.results.visible) this.showResults();
      this.updateMuteUi();
    });
  }

  // ------------------------------------------------------------------ touch / mute / fullscreen helpers
  private enableTouchUI(): void {
    this.touchUI = true;
    document.body.classList.add('touch');
    if (!this.touch) {
      this.touch = new TouchControls(document.getElementById('ui')!);
      this.input.setTouchSource(this.touch);
    }
    if (this.gameDeps) this.gameDeps.touch = this.touch;
    if (this.phase === 'playing' && this.game && !this.disconnected) this.touch.setVisible(true);
    this.updateRotate();
  }

  private toggleMute(): void {
    this.sfx.toggleMuted();
    this.updateMuteUi();
  }

  private updateMuteUi(): void {
    const m = this.sfx.isMuted();
    this.hud.setMuted(m);
    this.menu.setMuted(m);
  }

  /** Android: go fullscreen (and try to lock landscape) when a game is started from a tap. Failure is fine. */
  private tryFullscreen(): void {
    if (!this.touchUI) return;
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        void el
          .requestFullscreen({ navigationUI: 'hide' })
          .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}))
          .catch(() => {});
      }
    } catch {
      /* iOS Safari has no fullscreen API for pages */
    }
  }

  private renderRotate(): void {
    this.rotateEl.innerHTML = `<div class="r-phone">📱</div><div class="r-title">${t('touch.rotate.title')}</div><div class="r-sub">${t('touch.rotate.sub')}</div>`;
  }

  /** portrait phone during a round: ask for landscape */
  private updateRotate(): void {
    const portrait = window.innerHeight > window.innerWidth;
    this.rotateEl.hidden = !(this.touchUI && portrait && this.phase === 'playing');
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
      alert(t('err.noWebgl'));
      return;
    }
    this.tryFullscreen();
    this.teardown();
    this.solo = true;
    this.wantAutostart = autostart;
    this.menu.hide();
    const tr = new LocalTransport();
    this.attach(tr);
    await tr.connect(name);
  }

  private async startOnline(mode: 'create' | 'join', name: string, code = ''): Promise<void> {
    if (!this.renderer) {
      this.menu.show();
      alert(t('err.noWebgl'));
      return;
    }
    this.tryFullscreen();
    this.teardown();
    this.solo = false;
    this.wantAutostart = false;
    this.menu.hide();
    const tr = new WsTransport();
    this.attach(tr);
    tr.onClose((reason) => this.onDisconnected(reason));
    try {
      await tr.connect(name);
    } catch (err) {
      if (this.transport === tr) {
        this.toMenu();
        this.notice.toast(netText(err instanceof Error ? err.message : 'unreachable'));
      }
      return;
    }
    if (this.transport !== tr) return; // the user left while we were connecting
    tr.send(mode === 'create' ? { type: 'createRoom' } : { type: 'joinRoom', code });
  }

  private onDisconnected(reason: string): void {
    this.disconnected = true;
    this.game?.freeze();
    this.input.enabled = false;
    this.touch?.setVisible(false);
    this.notice.showDisconnected(reason === 'closed' ? t('disconnect.game') : netText(reason));
  }

  /** Invite a friend: the system share sheet on phones, otherwise copy the link. */
  private async invite(code: string): Promise<void> {
    const link = `${window.location.origin}/?room=${code}`;
    if (this.canShare()) {
      try {
        await navigator.share({ title: t('share.title'), text: t('share.text', { code }), url: link });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // the player closed the sheet
        // share failed for another reason: fall back to copying
      }
    }
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
    this.notice.toast(t(ok ? 'toast.copied' : 'toast.copyManual', { link }));
  }

  private canShare(): boolean {
    return this.touchUI && typeof navigator.share === 'function';
  }

  private attach(tr: Transport): void {
    this.transport = tr;
    this.unsub = tr.onMessage((m) => this.onMessage(m));
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
    this.touch?.setVisible(false);
    this.sfx.setEngine(0, 0, false);
  }

  private toMenu(): void {
    this.teardown();
    this.phase = 'menu';
    this.menu.show();
    this.updateRotate();
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
        this.notice.toast(errorText(msg.code));
        break;
      default:
        break;
    }
    this.game?.handleMessage(msg);
    this.updateRotate();
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
    this.lobby.show({ code: room.code, solo: this.solo, hostId: room.hostId, myId: this.myId, players: room.players, canShare: this.canShare() });
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
    const lowPower = this.touchUI;
    this.gameDeps = {
      renderer: this.renderer,
      transport: this.transport,
      hud: this.hud,
      sfx: this.sfx,
      input: this.input,
      debug: this.params.debug,
      shadows: !this.params.noshadow && !lowPower, // phones: no shadows (unless ?shadows)
      forceShadows: this.params.shadows,
      touch: this.touch,
      lowPower,
    };
    if (this.params.shadows) this.gameDeps.shadows = true;
    this.game = new Game(
      this.gameDeps,
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
      lang: getLang(),
      touch: this.touchUI,
      muted: this.sfx.isMuted(),
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
    /** QA: audio graph state (context state, mute, engine gain, output RMS) */
    audio: () => this.sfx.info(),
    hudRects: () => this.game?.debug.hudRects() ?? { hud: [], touch: [] },
    counters: () => this.game?.counters ?? { honks: 0, resets: 0 },
    setLang: (l: Lang) => setLang(l, false),
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
