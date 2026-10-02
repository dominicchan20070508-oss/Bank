// Main menu (name + solo / create room / join room), language switch and mute button.
import { getLang, onLangChange, setLang, t, type Lang } from '../i18n';
import { el, esc } from './dom';

export interface MenuCallbacks {
  onSolo(name: string): void;
  onCreate(name: string): void;
  onJoin(name: string, code: string): void;
  onToggleMute(): void;
}

/** The player's saved name ('' = none: every client then shows its own language's "Rider N"). */
export function loadName(): string {
  try {
    return localStorage.getItem('dc.name') ?? '';
  } catch {
    return '';
  }
}
function saveName(n: string): void {
  try {
    localStorage.setItem('dc.name', n);
  } catch {
    /* ignore */
  }
}

export class Menu {
  readonly root = el('div', 'screen');
  private nameValue: string;
  private codeValue = '';
  private joinOpen = false;
  private soonShown = false;
  private muted = false;
  private cb: MenuCallbacks;

  constructor(
    parent: HTMLElement,
    cb: MenuCallbacks,
    initialName: string,
    private readonly onlineAvailable: boolean,
  ) {
    this.cb = cb;
    this.nameValue = initialName;
    parent.append(this.root);
    this.render();
    onLangChange(() => this.render());
  }

  private name(): string {
    const input = this.root.querySelector<HTMLInputElement>('#dc-name');
    if (input) this.nameValue = input.value.trim().slice(0, 12);
    saveName(this.nameValue);
    return this.nameValue;
  }

  /** (Re)build the menu in the current language, keeping what was typed. */
  render(): void {
    const cur = this.root.querySelector<HTMLInputElement>('#dc-name');
    if (cur) this.nameValue = cur.value;
    const code = this.root.querySelector<HTMLInputElement>('#dc-code');
    if (code) this.codeValue = code.value;
    const hidden = this.root.hidden;
    const lang = getLang();
    this.root.innerHTML = `
      <div class="menu-tools">
        <div class="langsw" role="group" aria-label="${esc(t('lang.switch'))}">
          <button data-lang="zh" class="${lang === 'zh' ? 'on' : ''}">${t('lang.zh')}</button><button data-lang="en" class="${lang === 'en' ? 'on' : ''}">${t('lang.en')}</button>
        </div>
        <button class="icon-btn" data-k="mute" aria-label="${esc(t(this.muted ? 'sound.unmute' : 'sound.mute'))}">${this.muted ? '🔇' : '🔊'}</button>
      </div>
      <div class="card panel">
        <h1 class="title">${t('menu.title')}</h1>
        <div class="subtitle">${t('menu.subtitle')}</div>
        <div class="field"><label for="dc-name">${t('menu.name')}</label><input id="dc-name" maxlength="12" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="${esc(t('menu.namePlaceholder'))}" /></div>
        <button class="btn" data-k="solo">${t('menu.solo')}</button>
        <div class="row">
          <button class="btn secondary" data-k="create">${t('menu.create')}</button>
          <button class="btn secondary" data-k="join">${t('menu.join')}</button>
        </div>
        <div class="field" data-k="joinrow" ${this.joinOpen ? '' : 'hidden'}><label for="dc-code">${t('menu.code')}</label><input id="dc-code" class="code-input" maxlength="4" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text" placeholder="ABCD" /><button class="btn small" data-k="go">${t('menu.go')}</button></div>
        <div class="soon" data-k="soon" style="display:${this.soonShown ? 'block' : 'none'}">${t('menu.soon')}</div>
        <div class="help">
          <span class="help-kbd"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / ${t('menu.arrows')} ${t('menu.ride')} · <kbd>${t('menu.key.space')}</kbd> ${t('menu.handbrake')} · <kbd>H</kbd> ${t('menu.horn')} · <kbd>R</kbd> ${t('menu.reset')}<br /></span>
          <span class="help-touch">${t('menu.help.touch')}<br /></span>
          ${t('menu.help.goal')}<br />${t('menu.help.tip')}
        </div>
      </div>`;
    this.root.hidden = hidden;
    const q = <T extends HTMLElement>(k: string) => this.root.querySelector<T>(`[data-k="${k}"]`)!;
    const nameInput = this.root.querySelector<HTMLInputElement>('#dc-name')!;
    const codeInput = this.root.querySelector<HTMLInputElement>('#dc-code')!;
    nameInput.value = this.nameValue;
    codeInput.value = this.codeValue;
    const joinRow = q('joinrow');

    this.root.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        setLang(b.dataset.lang as Lang); // re-renders through onLangChange
      }),
    );
    q('mute').addEventListener('click', () => this.cb.onToggleMute());
    q('solo').addEventListener('click', () => this.cb.onSolo(this.name()));
    q('create').addEventListener('click', () => {
      if (this.onlineAvailable) this.cb.onCreate(this.name());
      else this.showSoon();
    });
    q('join').addEventListener('click', () => {
      if (!this.onlineAvailable) return this.showSoon();
      this.joinOpen = true;
      joinRow.hidden = false;
      codeInput.focus();
    });
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
    q('go').addEventListener('click', () => this.cb.onJoin(this.name(), codeInput.value.trim().toUpperCase()));
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cb.onSolo(this.name());
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.cb.onJoin(this.name(), codeInput.value.trim().toUpperCase());
    });
  }

  showSoon(): void {
    this.soonShown = true;
    const soon = this.root.querySelector<HTMLElement>('[data-k="soon"]')!;
    soon.style.display = 'block';
    soon.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 250 });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    const b = this.root.querySelector<HTMLElement>('[data-k="mute"]');
    if (b) {
      b.textContent = m ? '🔇' : '🔊';
      b.setAttribute('aria-label', t(m ? 'sound.unmute' : 'sound.mute'));
    }
  }

  getName(): string {
    return this.name();
  }
  show(): void {
    this.root.hidden = false;
  }
  hide(): void {
    this.root.hidden = true;
  }
}
