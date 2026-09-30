// Deterministic RNG shared by client and server. Never use Math.random() in shared/ or sim/.

/** mulberry32: tiny fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly gen: () => number;
  constructor(seed: number) {
    this.gen = mulberry32(seed);
  }
  /** float in [0, 1) */
  next(): number {
    return this.gen();
  }
  /** float in [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.gen();
  }
  /** integer in [a, b] (inclusive) */
  int(a: number, b: number): number {
    return a + Math.floor(this.gen() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.gen() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.gen() * arr.length)]!;
  }
  /** Fisher-Yates, returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.gen() * (i + 1));
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }
}

/** Mix a seed with a salt so independent streams (map, orders, ...) don't correlate. */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
