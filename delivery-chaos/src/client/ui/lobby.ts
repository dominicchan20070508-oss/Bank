// Lobby screen: room code + player list + start button (solo practice reuses it without the code).
import { PLAYER_COLORS } from '../../shared/constants';
import type { RoomPlayerInfo } from '../../shared/protocol';
import { el, esc, hex } from './dom';

export interface LobbyView {
  code: string;
  solo: boolean;
  hostId: string | null;
  myId: string;
  players: RoomPlayerInfo[];
}

export class Lobby {
  readonly root = el('div', 'screen');

  constructor(
    parent: HTMLElement,
    private readonly cb: { onStart(): void; onLeave(): void },
  ) {
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(v: LobbyView): void {
    const isHost = v.hostId === v.myId;
    this.root.innerHTML = `
      <div class="card panel">
        <h1 class="title" style="font-size:44px">${v.solo ? '单人练习' : '房间大厅'}</h1>
        ${v.solo ? '' : `<div class="subtitle">房间码</div><div class="code">${v.code}</div>`}
        <ul class="plist">${v.players.map((p) => `<li><span class="dot" style="background:${hex(PLAYER_COLORS[p.color] ?? 0xffffff)}"></span>${esc(p.name)}${p.id === v.hostId ? ' 👑' : ''}${p.id === v.myId ? '（你）' : ''}</li>`).join('')}</ul>
        <button class="btn" data-k="start" ${isHost ? '' : 'disabled'}>${isHost ? '开始送外卖！' : '等待房主开始…'}</button>
        <button class="btn secondary small" data-k="leave">返回菜单</button>
      </div>`;
    this.root.querySelector('[data-k="start"]')!.addEventListener('click', () => this.cb.onStart());
    this.root.querySelector('[data-k="leave"]')!.addEventListener('click', () => this.cb.onLeave());
    this.root.hidden = false;
  }
  hide(): void {
    this.root.hidden = true;
  }
}
