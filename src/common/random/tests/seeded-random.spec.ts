import { describe, it, expect } from 'vitest';
import { hashSeed, seededRandom, weightedSampleWithoutReplacement } from '../seeded-random';

describe('seededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRandom('visit-1');
    const b = seededRandom('visit-1');

    const left = [a(), a(), a(), a(), a()];
    const right = [b(), b(), b(), b(), b()];

    expect(left).toEqual(right);
  });

  it('produces different sequences for different seeds', () => {
    const a = seededRandom('visit-1');
    const b = seededRandom('visit-2');

    const left = [a(), a(), a(), a(), a()];
    const right = [b(), b(), b(), b(), b()];

    expect(left).not.toEqual(right);
  });

  it('stays inside [0, 1)', () => {
    const next = seededRandom('visit-3');

    for (let i = 0; i < 500; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('hashes equal strings to equal seeds and different strings apart', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});

describe('weightedSampleWithoutReplacement', () => {
  const items = [
    { id: 'a', w: 10 },
    { id: 'b', w: 1 },
    { id: 'c', w: 1 },
  ];

  it('never repeats an item', () => {
    const picked = weightedSampleWithoutReplacement(items, (i) => i.w, 3, seededRandom('seed'));

    expect(new Set(picked.map((i) => i.id)).size).toBe(3);
  });

  it('returns everything when asked for more than available', () => {
    const picked = weightedSampleWithoutReplacement(items, (i) => i.w, 10, seededRandom('seed'));

    expect(picked).toHaveLength(3);
  });

  it('favours heavier items across many seeds', () => {
    let firstIsA = 0;

    for (let i = 0; i < 200; i++) {
      const picked = weightedSampleWithoutReplacement(
        items,
        (it) => it.w,
        1,
        seededRandom(`seed-${i}`),
      );
      if (picked[0].id === 'a') firstIsA++;
    }

    // weight 10 against 1 + 1 — the heavy item should dominate but not be alone.
    expect(firstIsA).toBeGreaterThan(130);
    expect(firstIsA).toBeLessThan(200);
  });

  it('still draws when every weight is zero', () => {
    const picked = weightedSampleWithoutReplacement(items, () => 0, 2, seededRandom('seed'));

    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((i) => i.id)).size).toBe(2);
  });
});
