// Main menu (name + 单人练习 / 创建房间 / 加入房间).
export interface MenuCallbacks {
  onSolo(name: string): void;
  onCreate(name: string): void;
  onJoin(name: string, code: string): void;
}

import { el } from './dom';

export function loadName(): string {
  try {
    const n = localStorage.getItem('dc.name');
    if (n) return n;
  } catch {
    /* storage may be blocked */
  }
  return `骑手${Math.floor(10 + Math.random() * 90)}`;
}
function saveName(n: string): void {
  try {
    localStorage.setItem('dc.name', n);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ main menu
export class Menu {
  readonly root = el('div', 'screen');
  private readonly nameInput: HTMLInputElement;
  private readonly soon: HTMLElement;
  private readonly codeInput: HTMLInputElement;
  private readonly joinRow: HTMLElement;

  constructor(
    parent: HTMLElement,
    cb: MenuCallbacks,
    initialName: string,
    private readonly onlineAvailable: boolean,
  ) {
    this.root.innerHTML = `
      <div class="card panel">
        <h1 class="title">外卖大乱送</h1>
        <div class="subtitle">DELIVERY CHAOS</div>
        <div class="field"><label for="dc-name">你的名字</label><input id="dc-name" maxlength="12" autocomplete="off" /></div>
        <button class="btn" data-k="solo">单人练习</button>
        <div class="row">
          <button class="btn secondary" data-k="create">创建房间</button>
          <button class="btn secondary" data-k="join">加入房间</button>
        </div>
        <div class="field" data-k="joinrow" hidden><label for="dc-code">房间码</label><input id="dc-code" maxlength="4" autocomplete="off" placeholder="ABCD" style="text-transform:uppercase;width:110px;text-align:center;letter-spacing:4px" /><button class="btn small" data-k="go" style="width:auto;margin:0">加入</button></div>
        <div class="soon" data-k="soon">联机功能即将上线</div>
        <div class="help">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键 骑行 · <kbd>空格</kbd> 手刹甩尾 · <kbd>H</kbd> 喇叭 · <kbd>R</kbd> 扶正<br />
          去亮起的餐厅停下取餐，再送到顾客家门口停下交货。<br />货物会晃、会洒、会飞——开稳点，小费才多！
        </div>
      </div>`;
    parent.append(this.root);
    const q = <T extends HTMLElement>(k: string) => this.root.querySelector<T>(`[data-k="${k}"]`)!;
    this.nameInput = this.root.querySelector('#dc-name')!;
    this.nameInput.value = initialName;
    this.codeInput = this.root.querySelector('#dc-code')!;
    this.soon = q('soon');
    this.joinRow = q('joinrow');
    const name = () => {
      const n = this.nameInput.value.trim().slice(0, 12) || initialName;
      saveName(n);
      return n;
    };
    q('solo').addEventListener('click', () => cb.onSolo(name()));
    q('create').addEventListener('click', () => {
      if (this.onlineAvailable) cb.onCreate(name());
      else this.showSoon();
    });
    q('join').addEventListener('click', () => {
      if (!this.onlineAvailable) return this.showSoon();
      this.joinRow.hidden = false;
      this.codeInput.focus();
    });
    q('go').addEventListener('click', () => cb.onJoin(name(), this.codeInput.value.trim().toUpperCase()));
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cb.onSolo(name());
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cb.onJoin(name(), this.codeInput.value.trim().toUpperCase());
    });
  }

  showSoon(): void {
    this.soon.style.display = 'block';
    this.soon.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 250 });
  }

  getName(): string {
    return this.nameInput.value.trim().slice(0, 12);
  }
  show(): void {
    this.root.hidden = false;
  }
  hide(): void {
    this.root.hidden = true;
  }
}
