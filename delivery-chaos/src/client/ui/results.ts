// End-of-round screen: stars, team tips, awards and per-player stats.
import { PLAYER_COLORS } from '../../shared/constants';
import type { ResultsMsg } from '../../shared/protocol';
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
        (p) => `<tr><td><span class="dot" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${hex(PLAYER_COLORS[p.color] ?? 0xffffff)};border:2px solid #2b2a33;margin-right:6px"></span>${esc(p.name)}${p.id === myId ? '（你）' : ''}</td>
        <td>${p.stats.deliveries}</td><td>¥${p.stats.tips}</td><td>${p.stats.deliveries ? Math.round((p.stats.integritySum / p.stats.deliveries) * 100) + '%' : '-'}</td><td>${p.stats.crashes}</td><td>${p.stats.soupSpilled.toFixed(1)}</td><td>${p.stats.pizzasLost}</td><td>${p.stats.scoopsLost}</td><td>${p.stats.honks}</td></tr>`,
      )
      .join('');
    const awards = r.awards
      .map(
        (a, i) => `<div class="award" style="animation-delay:${0.15 * i + 0.3}s"><div class="ico">${a.icon}</div><div class="t">${a.title}</div><div class="p">${esc(a.playerName)}</div><div class="d">${a.detail}</div></div>`,
      )
      .join('');
    this.root.innerHTML = `
      <div class="card panel results">
        <h2>本局结算</h2>
        <div class="starrow">${stars}</div>
        <div class="total">团队小费 ¥${r.teamTips}</div>
        <div class="awards">${awards || '<div class="award"><div class="ico">🛵</div><div class="t">还没送成一单</div><div class="d">下局加油！</div></div>'}</div>
        <table class="stats"><thead><tr><th>骑手</th><th>送达</th><th>小费</th><th>平均完整度</th><th>翻车</th><th>洒汤(碗)</th><th>丢披萨</th><th>掉冰淇淋</th><th>喇叭</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="row" style="margin-top:14px">
          <button class="btn" data-k="again" ${canRestart ? '' : 'disabled'}>${canRestart ? '再来一局' : '等待房主…'}</button>
          <button class="btn secondary" data-k="menu">返回菜单</button>
        </div>
      </div>`;
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
