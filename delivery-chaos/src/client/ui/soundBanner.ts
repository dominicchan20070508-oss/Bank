// "Tap to turn sound on" (DESIGN §14.2): shown whenever sound is wanted but the AudioContext is not running (never unlocked,
// suspended, or interrupted by a call / app switch on iOS). Any tap anywhere also unlocks audio; tapping the banner plays a
// confirmation sound and hides it.
import { t } from '../i18n';
import { el } from './dom';

export class SoundBanner {
  readonly root = el('div', 'sound-banner');
  private shown = false;

  constructor(
    parent: HTMLElement,
    private readonly onTap: () => void,
  ) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'button');
    this.root.tabIndex = -1;
    this.applyLang();
    // pointerup + click: iOS only lets audio start inside the gesture's own event
    const tap = (e: Event) => {
      e.preventDefault();
      this.onTap();
    };
    this.root.addEventListener('pointerup', tap);
    this.root.addEventListener('click', tap);
    parent.append(this.root);
  }

  applyLang(): void {
    this.root.textContent = t('sound.banner');
  }

  get visible(): boolean {
    return this.shown;
  }

  set(visible: boolean): void {
    if (visible === this.shown) return;
    this.shown = visible;
    this.root.hidden = !visible;
  }
}
