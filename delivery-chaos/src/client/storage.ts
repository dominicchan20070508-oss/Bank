// localStorage that never throws (private windows, blocked site data, sandboxed iframes ...) and can be replaced in tests.
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const safeStorage: KeyValueStore = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage may be blocked: the setting then lasts for this page view only */
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** An in-memory store (tests, and the fallback when storage is blocked) */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
