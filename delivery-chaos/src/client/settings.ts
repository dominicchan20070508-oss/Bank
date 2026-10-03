// Player settings that live on this device (DESIGN §14): auto-gas, steadier rack, mute teammates' quick chat.
// (Volume and mute belong to the audio engine and are stored there.) Every read / write is guarded.
import { safeStorage, type KeyValueStore } from './storage';

export const SETTING_KEYS = { autoGas: 'dc.autogas', steadyRack: 'dc.steady', muteChat: 'dc.mutechat' } as const;

export interface SettingsOptions {
  store?: KeyValueStore;
  /** ?autogas=0|1 from the URL (QA): wins over the stored value and is never saved */
  forceAutoGas?: boolean;
}

export class Settings {
  private readonly store: KeyValueStore;
  private readonly forceAutoGas: boolean | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(opts: SettingsOptions = {}) {
    this.store = opts.store ?? safeStorage;
    this.forceAutoGas = opts.forceAutoGas;
  }

  private read(key: string): boolean | null {
    const v = this.store.getItem(key);
    return v === '1' ? true : v === '0' ? false : null;
  }
  private write(key: string, v: boolean): void {
    this.store.setItem(key, v ? '1' : '0');
    this.listeners.forEach((f) => f());
  }

  /** Auto-gas: on by default for touch devices, off for keyboards; the player's own choice wins. */
  autoGas(touchUI: boolean): boolean {
    if (this.forceAutoGas !== undefined) return this.forceAutoGas;
    return this.read(SETTING_KEYS.autoGas) ?? touchUI;
  }
  setAutoGas(v: boolean): void {
    this.write(SETTING_KEYS.autoGas, v);
  }

  get steadyRack(): boolean {
    return this.read(SETTING_KEYS.steadyRack) ?? false;
  }
  set steadyRack(v: boolean) {
    this.write(SETTING_KEYS.steadyRack, v);
  }

  get muteChat(): boolean {
    return this.read(SETTING_KEYS.muteChat) ?? false;
  }
  set muteChat(v: boolean) {
    this.write(SETTING_KEYS.muteChat, v);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
