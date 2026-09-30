// Toasts and the "connection lost" overlay that work on every screen (menu, lobby, game, results).
import { el } from './dom';

export class Notice {
  private toastEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly overlay: HTMLElement;

  constructor(
    private readonly parent: HTMLElement,
    onMenu: () => void,
  ) {
    this.overlay = el('div', 'screen dim disconnect');
    this.overlay.hidden = true;
    this.overlay.innerHTML = `
      <div class="card panel">
        <h1 class="title" style="font-size:40px">连接断开</h1>
        <p class="help" data-k="why">与服务器的连接已断开。</p>
        <button class="btn" data-k="menu">返回菜单</button>
      </div>`;
    this.overlay.querySelector('[data-k="menu"]')!.addEventListener('click', () => {
      this.overlay.hidden = true;
      onMenu();
    });
    parent.append(this.overlay);
  }

  toast(text: string, ms = 3200): void {
    this.toastEl?.remove();
    if (this.timer) clearTimeout(this.timer);
    const t = el('div', 'notice-toast');
    t.textContent = text;
    this.parent.append(t);
    this.toastEl = t;
    this.timer = setTimeout(() => {
      t.remove();
      if (this.toastEl === t) this.toastEl = null;
    }, ms);
  }

  showDisconnected(reason = '与服务器的连接已断开。'): void {
    (this.overlay.querySelector('[data-k="why"]') as HTMLElement).textContent = reason;
    this.overlay.hidden = false;
  }
  hideDisconnected(): void {
    this.overlay.hidden = true;
  }
  get disconnectedVisible(): boolean {
    return !this.overlay.hidden;
  }
}
