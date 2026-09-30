// Lobby screen: big room code, invite-link button, colour-coded player list, host's start button.
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
    private readonly cb: { onStart(): void; onLeave(): void; onCopyInvite(code: string): void },
  ) {
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(v: LobbyView): void {
    const isHost = v.hostId === v.myId;
    const rows = v.players
      .map(
        (p) =>
          `<li><span class="dot" style="background:${hex(PLAYER_COLORS[p.color] ?? 0xffffff)}"></span><span class="pname">${esc(p.name)}</span>${p.id === v.hostId ? '<span class="tag">房主</span>' : ''}${p.id === v.myId ? '<span class="tag you">你</span>' : ''}</li>`,
      )
      .join('');
    this.root.innerHTML = `
      <div class="card panel lobby">
        <h1 class="title" style="font-size:44px">${v.solo ? '单人练习' : '房间大厅'}</h1>
        ${
          v.solo
            ? ''
            : `<div class="subtitle">房间码 · 告诉朋友</div>
               <div class="code" data-k="code">${esc(v.code)}</div>
               <button class="btn secondary small" data-k="copy" style="width:auto;display:inline-block;padding:8px 18px">复制邀请链接</button>`
        }
        <ul class="plist" data-k="players">${rows}</ul>
        <div class="help" style="margin:0 0 6px">${v.solo ? '' : `${v.players.length} / 4 人`}</div>
        <button class="btn" data-k="start" role="button" ${isHost ? '' : 'disabled'}>${isHost ? '开始游戏' : '等待房主开始…'}</button>
        <button class="btn secondary small" data-k="leave">返回菜单</button>
      </div>`;
    this.root.querySelector('[data-k="start"]')!.addEventListener('click', () => this.cb.onStart());
    this.root.querySelector('[data-k="leave"]')!.addEventListener('click', () => this.cb.onLeave());
    this.root.querySelector('[data-k="copy"]')?.addEventListener('click', () => this.cb.onCopyInvite(v.code));
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
  get visible(): boolean {
    return !this.root.hidden;
  }
}
