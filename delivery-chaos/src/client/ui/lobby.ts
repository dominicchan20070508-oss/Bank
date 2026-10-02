// Lobby screen: big room code, invite-link button, colour-coded player list, host's start button.
import { PLAYER_COLORS } from '../../shared/constants';
import type { RoomPlayerInfo } from '../../shared/protocol';
import { playerName, t } from '../i18n';
import { el, esc, hex } from './dom';

export interface LobbyView {
  code: string;
  solo: boolean;
  hostId: string | null;
  myId: string;
  players: RoomPlayerInfo[];
  /** use the system share sheet (navigator.share) for the invite instead of copying the link */
  canShare: boolean;
}

export class Lobby {
  readonly root = el('div', 'screen');
  private last: LobbyView | null = null;

  constructor(
    parent: HTMLElement,
    private readonly cb: { onStart(): void; onLeave(): void; onInvite(code: string): void },
  ) {
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** re-render with the last view (language switch) */
  refresh(): void {
    if (this.last && !this.root.hidden) this.show(this.last);
  }

  show(v: LobbyView): void {
    this.last = v;
    const isHost = v.hostId === v.myId;
    const rows = v.players
      .map(
        (p) =>
          `<li><span class="dot" style="background:${hex(PLAYER_COLORS[p.color] ?? 0xffffff)}"></span><span class="pname">${esc(playerName(p))}</span>${p.id === v.hostId ? `<span class="tag">${t('lobby.host')}</span>` : ''}${p.id === v.myId ? `<span class="tag you">${t('lobby.you')}</span>` : ''}</li>`,
      )
      .join('');
    this.root.innerHTML = `
      <div class="card panel lobby">
        <h1 class="title">${v.solo ? t('lobby.solo') : t('lobby.title')}</h1>
        ${
          v.solo
            ? ''
            : `<div class="subtitle">${t('lobby.codeHint')}</div>
               <div class="code" data-k="code">${esc(v.code)}</div>
               <button class="btn secondary small invite" data-k="copy">${v.canShare ? t('lobby.share') : t('lobby.copy')}</button>`
        }
        <ul class="plist" data-k="players">${rows}</ul>
        <div class="help count">${v.solo ? '' : t('lobby.count', { n: v.players.length })}</div>
        <button class="btn" data-k="start" role="button" ${isHost ? '' : 'disabled'}>${isHost ? t('lobby.start') : t('lobby.waiting')}</button>
        <button class="btn secondary small" data-k="leave">${t('lobby.leave')}</button>
      </div>`;
    this.root.querySelector('[data-k="start"]')!.addEventListener('click', () => this.cb.onStart());
    this.root.querySelector('[data-k="leave"]')!.addEventListener('click', () => this.cb.onLeave());
    this.root.querySelector('[data-k="copy"]')?.addEventListener('click', () => this.cb.onInvite(v.code));
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
  get visible(): boolean {
    return !this.root.hidden;
  }
}
