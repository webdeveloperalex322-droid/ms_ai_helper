import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CategoryResolverService,
  LEGACY_CATEGORY_SLUGS,
} from '../services/category-resolver.service';

const RN = 'rn-test';
const TARGET = 'WEB';

const CATEGORIES = [
  { categoryId: 'CAT-MAIN', slug: 'main', name: 'Для вас', isActive: true },
  { categoryId: 'CAT-ROLL', slug: 'rolly', name: 'Роллы', isActive: true },
  {
    categoryId: 'CAT-ROLL-PREMIUM',
    slug: 'premium-rolly',
    name: 'Премиальные роллы',
    isActive: true,
  },
  { categoryId: 'CAT-SET', slug: 'sety', name: 'Сеты', isActive: true },
  { categoryId: 'CAT-DRINK', slug: 'napitki', name: 'Напитки', isActive: true },
];

function makeDb(rows: any[] = CATEGORIES) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where };
}

function makeFailingDb(error = new Error('connection refused')) {
  const where = vi.fn().mockRejectedValue(error);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where };
}

describe('CategoryResolverService.resolve', () => {
  let db: ReturnType<typeof makeDb>;
  let service: CategoryResolverService;

  beforeEach(() => {
    db = makeDb();
    service = new CategoryResolverService(db as any);
  });

  it('matches by catalog slug', async () => {
    const result = await service.resolve(RN, TARGET, 'napitki');

    expect(result.matched).toBe(true);
    expect(result.categoryIds).toEqual(['CAT-DRINK']);
    expect(result.labels).toEqual(['Напитки']);
  });

  it('matches by supplier category id', async () => {
    const result = await service.resolve(RN, TARGET, 'CAT-SET');

    expect(result.categoryIds).toEqual(['CAT-SET']);
  });

  it('matches by display name', async () => {
    const result = await service.resolve(RN, TARGET, 'Для вас');

    expect(result.categoryIds).toEqual(['CAT-MAIN']);
  });

  it('ignores case and surrounding whitespace', async () => {
    const result = await service.resolve(RN, TARGET, '  РОЛЛЫ  ');

    expect(result.categoryIds).toContain('CAT-ROLL');
  });

  it('returns every matching category when several match', async () => {
    const result = await service.resolve(RN, TARGET, 'роллы');

    expect(result.categoryIds).toEqual(['CAT-ROLL', 'CAT-ROLL-PREMIUM']);
    expect(result.labels).toEqual(['Роллы', 'Премиальные роллы']);
  });

  it('reports no match for an unknown category', async () => {
    const result = await service.resolve(RN, TARGET, 'фывапролдж');

    expect(result.matched).toBe(false);
    expect(result.categoryIds).toEqual([]);
  });

  it('reports no match for empty input', async () => {
    expect((await service.resolve(RN, TARGET, '')).matched).toBe(false);
    expect((await service.resolve(RN, TARGET, null)).matched).toBe(false);
    expect((await service.resolve(RN, TARGET, undefined)).matched).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('degrades to no match when the catalog lookup fails', async () => {
    const failing = makeFailingDb();
    const degraded = new CategoryResolverService(failing as any);

    const result = await degraded.resolve(RN, TARGET, 'роллы');

    expect(result.matched).toBe(false);
    expect(result.categoryIds).toEqual([]);
  });

  it('caches the catalog lookup across calls', async () => {
    await service.resolve(RN, TARGET, 'роллы');
    await service.resolve(RN, TARGET, 'сеты');

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed lookup', async () => {
    const failing = makeFailingDb();
    const degraded = new CategoryResolverService(failing as any);

    await degraded.resolve(RN, TARGET, 'роллы');
    await degraded.resolve(RN, TARGET, 'роллы');

    expect(failing.select).toHaveBeenCalledTimes(2);
  });
});

describe('CategoryResolverService.resolve — match tiers', () => {
  it('matches a separate word of a multi-word category name', async () => {
    const db = makeDb([
      { categoryId: 'CAT-D', slug: 'goryachie-blyuda', name: 'Горячие блюда', isActive: true },
      { categoryId: 'CAT-E', slug: 'napitki', name: 'Напитки', isActive: true },
    ]);
    const service = new CategoryResolverService(db as any);

    const result = await service.resolve(RN, TARGET, 'блюда');

    expect(result.categoryIds).toEqual(['CAT-D']);
  });

  it('prefers a word match and does not add substring-only categories', async () => {
    const db = makeDb([
      { categoryId: 'CAT-A', slug: 'roll', name: 'Ролл', isActive: true },
      { categoryId: 'CAT-B', slug: 'rolly', name: 'Роллы', isActive: true },
    ]);
    const service = new CategoryResolverService(db as any);

    const result = await service.resolve(RN, TARGET, 'ролл');

    expect(result.categoryIds).toEqual(['CAT-A']);
  });

  it('falls back to a substring match only when no word match exists', async () => {
    const db = makeDb([
      { categoryId: 'CAT-B', slug: 'rolly', name: 'Роллы', isActive: true },
      { categoryId: 'CAT-E', slug: 'napitki', name: 'Напитки', isActive: true },
    ]);
    const service = new CategoryResolverService(db as any);

    const result = await service.resolve(RN, TARGET, 'ролл');

    expect(result.categoryIds).toEqual(['CAT-B']);
  });

  it('resolves the legacy preset slug "roll" against a russian catalog', async () => {
    const service = new CategoryResolverService(makeDb() as any);

    const result = await service.resolve(RN, TARGET, 'roll');

    expect(result.categoryIds).toEqual(['CAT-ROLL', 'CAT-ROLL-PREMIUM']);
  });

  it('resolves the legacy preset slug "set" against a russian catalog', async () => {
    const service = new CategoryResolverService(makeDb() as any);

    const result = await service.resolve(RN, TARGET, 'set');

    expect(result.categoryIds).toEqual(['CAT-SET']);
  });

  it('resolves the legacy preset slug "drink" against a russian catalog', async () => {
    const service = new CategoryResolverService(makeDb() as any);

    const result = await service.resolve(RN, TARGET, 'drink');

    expect(result.categoryIds).toEqual(['CAT-DRINK']);
  });

  it('still resolves seeded catalogs where category_id equals the slot value', async () => {
    const db = makeDb([{ categoryId: 'roll', slug: 'roll', name: 'Роллы', isActive: true }]);
    const service = new CategoryResolverService(db as any);

    const result = await service.resolve(RN, TARGET, 'roll');

    expect(result.categoryIds).toEqual(['roll']);
  });
});

describe('CategoryResolverService.listOptions', () => {
  it('returns catalog categories as slug/name pairs', async () => {
    const service = new CategoryResolverService(makeDb() as any);

    const options = await service.listOptions(RN, TARGET);

    expect(options).toContainEqual({ slug: 'rolly', name: 'Роллы' });
    expect(options).toHaveLength(CATEGORIES.length);
  });

  it('caps the list so the prompt cannot grow unbounded', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      categoryId: `CAT-${i}`,
      slug: `slug-${i}`,
      name: `Категория ${i}`,
      isActive: true,
    }));
    const service = new CategoryResolverService(makeDb(many) as any);

    const options = await service.listOptions(RN, TARGET);

    expect(options).toHaveLength(40);
  });

  it('falls back to the legacy slugs when the catalog has no categories', async () => {
    const service = new CategoryResolverService(makeDb([]) as any);

    const options = await service.listOptions(RN, TARGET);

    expect(options.map((o) => o.slug)).toEqual([...LEGACY_CATEGORY_SLUGS]);
  });

  it('falls back to the legacy slugs when the catalog lookup fails', async () => {
    const service = new CategoryResolverService(makeFailingDb() as any);

    const options = await service.listOptions(RN, TARGET);

    expect(options.map((o) => o.slug)).toEqual([...LEGACY_CATEGORY_SLUGS]);
  });
});
