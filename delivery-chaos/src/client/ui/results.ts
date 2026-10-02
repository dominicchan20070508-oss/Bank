// End-of-round screen: stars, team tips, awards and per-player stats.
import { PLAYER_COLORS } from '../../shared/constants';
import type { ResultsMsg } from '../../shared/protocol';
import { awardDetail, awardTitle, playerName, t } from '../i18n';
import { el, esc, hex } from './dom';

export class Results {
  readonly root = el('div', 'screen dim');

  constructor(parent: HTMLElement) {
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(r: ResultsMsg, myId: string, canRestart: boolean, cb: { onRestart(): void; onMenu(): void }): void {
    const stars = [0, 1, 2].map((i) => `<span class="${i < r.stars ? '' : 'off'}">⭐</span>`).join('');
    const rows = r.players
      .map(
        (p) => `<tr><td class="who"><span class="dot"></span>${esc(playerName(p))}${p.id === myId ? t('results.you') : ''}</td>
        <td>${p.stats.deliveries}</td><td>¥${p.stats.tips}</td><td>${p.stats.deliveries ? Math.round((p.stats.integritySum / p.stats.deliveries) * 100) + '%' : '-'}</td><td>${p.stats.crashes}</td><td>${p.stats.soupSpilled.toFixed(1)}</td><td>${p.stats.pizzasLost}</td><td>${p.stats.scoopsLost}</td><td>${p.stats.honks}</td></tr>`,
      )
      .join('');
    const awards = r.awards
      .map(
        (a, i) => `<div class="award" style="animation-delay:${0.15 * i + 0.3}s"><div class="ico">${a.icon}</div><div class="t">${esc(awardTitle(a.id))}</div><div class="p">${esc(playerName({ name: a.playerName, color: r.players.find((p) => p.id === a.playerId)?.color ?? 0 }))}</div><div class="d">${esc(awardDetail(a.id, a.value))}</div></div>`,
      )
      .join('');
    this.root.innerHTML = `
      <div class="card panel results">
        <h2>${t('results.title')}</h2>
        <div class="starrow">${stars}</div>
        <div class="total">${t('results.total', { n: r.teamTips })}</div>
        <div class="awards">${awards || `<div class="award"><div class="ico">🛵</div><div class="t">${t('results.none')}</div><div class="d">${t('results.noneDetail')}</div></div>`}</div>
        <div class="tablewrap"><table class="stats"><thead><tr><th>${t('results.col.rider')}</th><th>${t('results.col.delivered')}</th><th>${t('results.col.tips')}</th><th>${t('results.col.integrity')}</th><th>${t('results.col.crashes')}</th><th>${t('results.col.soup')}</th><th>${t('results.col.pizza')}</th><th>${t('results.col.scoops')}</th><th>${t('results.col.honks')}</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="row actions">
          <button class="btn" data-k="again" ${canRestart ? '' : 'disabled'}>${canRestart ? t('results.again') : t('results.waitHost')}</button>
          <button class="btn secondary" data-k="menu">${t('results.menu')}</button>
        </div>
      </div>`;
    // player colour dots (set from data, not inline in the template string)
    this.root.querySelectorAll<HTMLElement>('td.who .dot').forEach((d, i) => {
      d.style.background = hex(PLAYER_COLORS[r.players[i]?.color ?? 0] ?? 0xffffff);
    });
    this.root.querySelector('[data-k="again"]')!.addEventListener('click', () => cb.onRestart());
    this.root.querySelector('[data-k="menu"]')!.addEventListener('click', () => cb.onMenu());
    this.root.hidden = false;
  }
  hide(): void {
    this.root.hidden = true;
  }
  get visible(): boolean {
    return !this.root.hidden;
  }
}
