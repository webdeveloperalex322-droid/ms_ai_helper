import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { categories } from '../../../database/schema';

export interface CategoryOption {
  slug: string;
  name: string;
}

export interface ResolvedCategory {
  /**
   * Values to match against products.category_id. Both the directory id and the slug are
   * returned, because different catalogs store different forms there.
   */
  categoryIds: string[];
  /**
   * Values to match against products.category_name. The live catalog stores the id of a
   * SUBcategory on the product (four distinct ids share the name "Роллы и суши") while the
   * directory keeps the top-level id, so the name is the only reliable link.
   */
  categoryNames: string[];
  /** Display names of the matched categories, for user-facing texts. */
  labels: string[];
  matched: boolean;
}

/** Slugs baked into seeded suggestion payloads before the catalog import existed. */
export const LEGACY_CATEGORY_SLUGS = ['roll', 'set', 'drink', 'sauce', 'dessert', 'hot'];

const LEGACY_CATEGORY_SYNONYMS: Record<string, string[]> = {
  roll: ['roll', 'rolls', 'ролл', 'роллы'],
  set: ['set', 'sets', 'сет', 'сеты'],
  drink: ['drink', 'drinks', 'напиток', 'напитки'],
  sauce: ['sauce', 'sauces', 'соус', 'соусы'],
  dessert: ['dessert', 'desserts', 'десерт', 'десерты'],
  hot: ['hot', 'горячее', 'горячие', 'горячие блюда'],
};

const MAX_OPTIONS = 40;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_SUBSTRING_LENGTH = 3;

const EMPTY_RESULT: ResolvedCategory = {
  categoryIds: [],
  categoryNames: [],
  labels: [],
  matched: false,
};

interface CategoryRow {
  categoryId: string;
  slug: string;
  name: string;
}

interface CacheEntry {
  rows: CategoryRow[];
  expiresAt: number;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Translates a category name coming from intent parsing or a suggestion payload into the
 * category identifiers actually stored on products. The slot carries a canonical slug
 * (`roll`, `set`) while `products.category_id` holds the catalog provider's own id, so a
 * direct comparison never matches on a real import.
 */
@Injectable()
export class CategoryResolverService {
  private readonly logger = new Logger(CategoryResolverService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async resolve(
    rn: string,
    target: string,
    value: string | null | undefined,
  ): Promise<ResolvedCategory> {
    if (!value || !value.trim()) return EMPTY_RESULT;

    const rows = await this.loadCategories(rn, target);
    if (!rows.length) return EMPTY_RESULT;

    const patterns = this.buildPatterns(value);
    if (!patterns.length) return EMPTY_RESULT;

    const matched = this.matchExact(rows, patterns);
    const chosen = matched.length ? matched : this.matchSubstring(rows, patterns);

    if (!chosen.length) return EMPTY_RESULT;

    const categoryIds: string[] = [];
    const categoryNames: string[] = [];
    const labels: string[] = [];
    for (const row of chosen) {
      if (labels.includes(row.name)) continue;
      for (const form of [row.categoryId, row.slug]) {
        if (form && !categoryIds.includes(form)) categoryIds.push(form);
      }
      if (row.name) categoryNames.push(row.name);
      labels.push(row.name);
    }

    return { categoryIds, categoryNames, labels, matched: true };
  }

  async listOptions(rn: string, target: string): Promise<CategoryOption[]> {
    const rows = await this.loadCategories(rn, target);

    if (!rows.length) {
      return LEGACY_CATEGORY_SLUGS.map((slug) => ({ slug, name: slug }));
    }

    return rows.slice(0, MAX_OPTIONS).map((row) => ({ slug: row.slug, name: row.name }));
  }

  /** Normalized forms of the input plus the synonyms of a legacy preset slug. */
  private buildPatterns(value: string): string[] {
    const raw = value.trim().toLowerCase();
    const candidates = [raw, ...(LEGACY_CATEGORY_SYNONYMS[raw] ?? [])];

    const patterns: string[] = [];
    for (const candidate of candidates) {
      const normalized = normalize(candidate);
      if (normalized && !patterns.includes(normalized)) patterns.push(normalized);
    }

    return patterns;
  }

  /** Whole-value or whole-word match on slug, provider id or display name. */
  private matchExact(rows: CategoryRow[], patterns: string[]): CategoryRow[] {
    return rows.filter((row) => {
      const forms = new Set<string>([
        normalize(row.slug),
        normalize(row.name),
        normalize(row.categoryId),
        ...tokenize(row.slug).map(normalize),
        ...tokenize(row.name).map(normalize),
      ]);

      return patterns.some((pattern) => forms.has(pattern));
    });
  }

  /** Last resort: the pattern is contained in the category (or the other way round). */
  private matchSubstring(rows: CategoryRow[], patterns: string[]): CategoryRow[] {
    return rows.filter((row) => {
      const haystacks = [normalize(row.slug), normalize(row.name)].filter(Boolean);

      return patterns.some((pattern) => {
        if (pattern.length < MIN_SUBSTRING_LENGTH) return false;
        return haystacks.some(
          (haystack) =>
            haystack.includes(pattern) ||
            (haystack.length >= MIN_SUBSTRING_LENGTH && pattern.includes(haystack)),
        );
      });
    });
  }

  private async loadCategories(rn: string, target: string): Promise<CategoryRow[]> {
    const key = `${rn}|${target}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;

    try {
      const rows = (await this.db
        .select({
          categoryId: categories.categoryId,
          slug: categories.slug,
          name: categories.name,
        })
        .from(categories)
        .where(
          and(eq(categories.rn, rn), eq(categories.target, target), eq(categories.isActive, true)),
        )) as CategoryRow[];

      this.cache.set(key, { rows, expiresAt: Date.now() + CACHE_TTL_MS });
      return rows;
    } catch (err) {
      // The assistant must keep answering: an unreachable catalog means "category unknown",
      // which drops the category filter instead of emptying the shortlist.
      this.logger.warn(`Failed to load categories for rn=${rn} target=${target}: ${err}`);
      return [];
    }
  }
}
