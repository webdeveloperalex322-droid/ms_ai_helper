/**
 * Schema structure tests — verify Drizzle table definitions without a live DB.
 * Ensures all required columns and constraints are declared in the schema.
 */
import { describe, it, expect } from 'vitest';
import {
  products,
  cities,
  cityProducts,
  productChunks,
  productEmbeddings,
  assistantSuggestions,
  assistantSuggestionEvents,
  aiLogs,
  adminRules,
  importJobs,
  retailNetworks,
} from '../schema';

function columns(table: Record<string, any>): string[] {
  return Object.entries(table)
    .filter(([, v]) => v?.columnType !== undefined || v?.config !== undefined)
    .map(([k]) => k);
}

describe('Database schema structure', () => {
  it('retail_networks has required columns', () => {
    const cols = columns(retailNetworks);
    expect(cols).toContain('id');
    expect(cols).toContain('rn');
    expect(cols).toContain('name');
    expect(cols).toContain('isActive');
  });

  it('cities has rn+br unique constraint columns', () => {
    const cols = columns(cities);
    expect(cols).toContain('rn');
    expect(cols).toContain('br');
    expect(cols).toContain('name');
    expect(cols).toContain('isActive');
  });

  it('products has all catalog columns', () => {
    const cols = columns(products);
    [
      'id',
      'rn',
      'externalProductId',
      'name',
      'categoryId',
      'description',
      'ingredients',
      'allergens',
      'tags',
      'weight',
      'pieces',
      'calories',
      'protein',
      'fat',
      'carbs',
      'imageUrl',
    ].forEach((col) => {
      expect(cols, `products missing column: ${col}`).toContain(col);
    });
  });

  it('city_products has availability and price columns', () => {
    const cols = columns(cityProducts);
    ['rn', 'br', 'target', 'productId', 'price', 'isAvailable', 'isValid'].forEach((col) => {
      expect(cols, `city_products missing column: ${col}`).toContain(col);
    });
  });

  it('product_chunks has searchable_text and embedding_status', () => {
    const cols = columns(productChunks);
    expect(cols).toContain('searchableText');
    expect(cols).toContain('embeddingStatus');
    expect(cols).toContain('contentHash');
    expect(cols).toContain('metadata');
  });

  it('product_embeddings has vector column', () => {
    const cols = columns(productEmbeddings);
    expect(cols).toContain('embedding');
    expect(cols).toContain('modelName');
    expect(cols).toContain('contentHash');
  });

  it('assistant_suggestions has payload and availability_rules', () => {
    const cols = columns(assistantSuggestions);
    ['code', 'title', 'payload', 'availabilityRules', 'sortOrder', 'enabled'].forEach((col) => {
      expect(cols, `assistant_suggestions missing column: ${col}`).toContain(col);
    });
  });

  it('assistant_suggestion_events has event_type', () => {
    const cols = columns(assistantSuggestionEvents);
    expect(cols).toContain('eventType');
    expect(cols).toContain('suggestionId');
    expect(cols).toContain('sessionId');
  });

  it('ai_logs has all observability columns', () => {
    const cols = columns(aiLogs);
    [
      'requestId',
      'sessionId',
      'userMessage',
      'intent',
      'slots',
      'validationStatus',
      'fallbackUsed',
      'latencyMs',
    ].forEach((col) => {
      expect(cols, `ai_logs missing column: ${col}`).toContain(col);
    });
  });

  it('admin_rules has banned_phrases and max_cards', () => {
    const cols = columns(adminRules);
    expect(cols).toContain('bannedPhrases');
    expect(cols).toContain('maxCardsInResponse');
  });

  it('import_jobs tracks job lifecycle', () => {
    const cols = columns(importJobs);
    ['jobType', 'rn', 'status', 'startedAt', 'finishedAt', 'stats', 'error'].forEach((col) => {
      expect(cols, `import_jobs missing column: ${col}`).toContain(col);
    });
  });
});
