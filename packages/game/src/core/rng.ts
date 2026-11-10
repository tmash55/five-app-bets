/**
 * Seeded random numbers, so a round can be replayed and tests are repeatable.
 * The seed is plain data that lives in session state, which keeps the session
 * reducer pure.
 */
export type Rng = {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** One item of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy of the list. */
  shuffle<T>(items: readonly T[]): T[];
  /** The seed to continue from after the numbers drawn so far. */
  readonly seed: number;
};

/** mulberry32: small, fast and good enough for games. */
function step(seed: number): { value: number; seed: number } {
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, seed: nextSeed };
}

export function createRng(seed: number): Rng {
  let current = seed | 0;
  const next = () => {
    const result = step(current);
    current = result.seed;
    return result.value;
  };
  const int = (min: number, max: number) => {
    if (max < min) throw new Error(`rng.int: max ${max} is below min ${min}`);
    return min + Math.floor(next() * (max - min + 1));
  };
  return {
    next,
    int,
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: empty list');
      return items[int(0, items.length - 1)];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    get seed() {
      return current;
    },
  };
}

/** A fresh seed for a new round when the caller does not pass one. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
