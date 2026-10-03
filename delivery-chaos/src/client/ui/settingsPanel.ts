// Settings popover (DESIGN §14): volume slider + test button, auto-gas, steadier rack, mute teammates' quick chat.
// Opened from the menu and from the in-game gear. Everything is stored on this device.
import { t } from '../i18n';
import { el } from './dom';

export interface SettingsBinding {
  getVolume(): number;
  setVolume(v: number): void;
  testSound(): void;
  getAutoGas(): boolean;
  setAutoGas(v: boolean): void;
  getSteadyRack(): boolean;
  setSteadyRack(v: boolean): void;
  getMuteChat(): boolean;
  setMuteChat(v: boolean): void;
  onClose?(): void;
}

export class SettingsPanel {
  readonly root = el('div', 'settings-pop');
  private open = false;

  constructor(
    parent: HTMLElement,
    private readonly b: SettingsBinding,
  ) {
    this.root.hidden = true;
    parent.append(this.root);
    // taps on the dim backdrop close it
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  render(): void {
    const vol = Math.round(this.b.getVolume() * 100);
    this.root.innerHTML = `
      <div class="settings-card panel" role="dialog" aria-label="${t('settings.title')}">
        <h3>${t('settings.title')}</h3>
        <div class="set-row vol">
          <label for="dc-vol">${t('sound.volume')}</label>
          <input id="dc-vol" type="range" min="0" max="100" step="1" value="${vol}" />
          <output data-k="volv">${vol}%</output>
          <button class="btn small" data-k="test">${t('sound.test')}</button>
        </div>
        <label class="set-row tog"><input type="checkbox" data-k="autogas" ${this.b.getAutoGas() ? 'checked' : ''} /><span><b>${t('settings.autoGas')}</b><small>${t('settings.autoGas.desc')}</small></span></label>
        <label class="set-row tog"><input type="checkbox" data-k="steady" ${this.b.getSteadyRack() ? 'checked' : ''} /><span><b>${t('settings.steadyRack')}</b><small>${t('settings.steadyRack.desc')}</small></span></label>
        <label class="set-row tog"><input type="checkbox" data-k="mutechat" ${this.b.getMuteChat() ? 'checked' : ''} /><span><b>${t('settings.muteChat')}</b></span></label>
        <button class="btn" data-k="done">${t('settings.done')}</button>
      </div>`;
    const q = <T extends HTMLElement>(k: string) => this.root.querySelector<T>(`[data-k="${k}"]`)!;
    const slider = this.root.querySelector<HTMLInputElement>('#dc-vol')!;
    slider.addEventListener('input', () => {
      this.b.setVolume(Number(slider.value) / 100);
      q('volv').textContent = `${slider.value}%`;
    });
    q('test').addEventListener('click', () => this.b.testSound());
    q<HTMLInputElement>('autogas').addEventListener('change', (e) => this.b.setAutoGas((e.target as HTMLInputElement).checked));
    q<HTMLInputElement>('steady').addEventListener('change', (e) => this.b.setSteadyRack((e.target as HTMLInputElement).checked));
    q<HTMLInputElement>('mutechat').addEventListener('change', (e) => this.b.setMuteChat((e.target as HTMLInputElement).checked));
    q('done').addEventListener('click', () => this.hide());
  }

  show(): void {
    this.render();
    this.root.hidden = false;
    this.open = true;
  }

  hide(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.open = false;
    this.b.onClose?.();
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  /** language changed while open */
  applyLang(): void {
    if (this.open) this.render();
  }
}
