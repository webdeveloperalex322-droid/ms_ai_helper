/**
 * Deterministic pseudo-random numbers from a string seed.
 *
 * The suggestion set has to be stable inside one visit and different between
 * visits (spec 012, FR-012). Seeding from the session id gives both without
 * storing the issued set anywhere.
 */

/** FNV-1a, 32 bit. Same string always yields the same seed. */
export function hashSeed(value: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * mulberry32: small, fast, good enough for picking items out of a list.
 * Returns values in [0, 1).
 */
export function seededRandom(seed: string | number): () => number {
  let state = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks `count` items without repetition, each item's chance proportional to
 * its weight. Items with a non-positive weight are still reachable, but only
 * once everything else is taken.
 */
export function weightedSampleWithoutReplacement<T>(
  items: T[],
  weightOf: (item: T) => number,
  count: number,
  random: () => number,
): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const take = Math.min(count, pool.length);

  for (let i = 0; i < take; i++) {
    const weights = pool.map((item) => Math.max(weightOf(item), 0));
    const total = weights.reduce((sum, w) => sum + w, 0);

    let index = 0;

    if (total <= 0) {
      // Every remaining candidate is weightless — fall back to a plain draw.
      index = Math.floor(random() * pool.length);
      if (index >= pool.length) index = pool.length - 1;
    } else {
      let threshold = random() * total;
      for (let j = 0; j < pool.length; j++) {
        threshold -= weights[j];
        if (threshold <= 0) {
          index = j;
          break;
        }
        index = j;
      }
    }

    picked.push(pool[index]);
    pool.splice(index, 1);
  }

  return picked;
}
