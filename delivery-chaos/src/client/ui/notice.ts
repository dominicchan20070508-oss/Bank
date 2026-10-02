// Toasts and the "connection lost" overlay that work on every screen (menu, lobby, game, results).
import { t } from '../i18n';
import { el } from './dom';

export class Notice {
  private toastEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly overlay: HTMLElement;
  private why: string | null = null;

  constructor(
    private readonly parent: HTMLElement,
    onMenu: () => void,
  ) {
    this.overlay = el('div', 'screen dim disconnect');
    this.overlay.hidden = true;
    this.renderOverlay();
    this.overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-k="menu"]')) {
        this.overlay.hidden = true;
        onMenu();
      }
    });
    parent.append(this.overlay);
  }

  private renderOverlay(): void {
    this.overlay.innerHTML = `
      <div class="card panel">
        <h1 class="title" style="font-size:40px">${t('disconnect.title')}</h1>
        <p class="help" data-k="why"></p>
        <button class="btn" data-k="menu">${t('results.menu')}</button>
      </div>`;
    (this.overlay.querySelector('[data-k="why"]') as HTMLElement).textContent = this.why ?? t('disconnect.body');
  }

  /** language changed */
  applyLang(): void {
    this.renderOverlay();
  }

  toast(text: string, ms = 3200): void {
    this.toastEl?.remove();
    if (this.timer) clearTimeout(this.timer);
    const tt = el('div', 'notice-toast');
    tt.textContent = text;
    this.parent.append(tt);
    this.toastEl = tt;
    this.timer = setTimeout(() => {
      tt.remove();
      if (this.toastEl === tt) this.toastEl = null;
    }, ms);
  }

  showDisconnected(reason?: string): void {
    this.why = reason ?? null;
    this.renderOverlay();
    this.overlay.hidden = false;
  }
  hideDisconnected(): void {
    this.overlay.hidden = true;
    this.why = null;
  }
  get disconnectedVisible(): boolean {
    return !this.overlay.hidden;
  }
}
