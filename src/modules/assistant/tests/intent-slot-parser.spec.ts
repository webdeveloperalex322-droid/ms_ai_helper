import { describe, it, expect, vi } from 'vitest';
import { IntentSlotParserService } from '../services/intent-slot-parser.service';
import { LEGACY_CATEGORY_SLUGS } from '../../catalog/services/category-resolver.service';

const RN = 'rn-test';
const TARGET = 'WEB';

function makeService(options: CategoryOptionStub[] | Error) {
  const llmProvider = {
    parseIntent: vi.fn().mockResolvedValue({
      intent: 'product_recommendation',
      slots: {},
      need_clarification: false,
      clarification_question: null,
      confidence: 0.9,
    }),
  };
  const categoryResolver = {
    listOptions:
      options instanceof Error
        ? vi.fn().mockRejectedValue(options)
        : vi.fn().mockResolvedValue(options),
  };
  const service = new IntentSlotParserService(llmProvider as any, categoryResolver as any);
  return { service, llmProvider, categoryResolver };
}

interface CategoryOptionStub {
  slug: string;
  name: string;
}

describe('IntentSlotParserService — known categories', () => {
  it('passes the catalog categories to the LLM', async () => {
    const { service, llmProvider, categoryResolver } = makeService([
      { slug: 'rolly', name: 'Роллы' },
      { slug: 'sety', name: 'Сеты' },
    ]);

    await service.parse('какие у вас есть роллы', { rn: RN, target: TARGET });

    expect(categoryResolver.listOptions).toHaveBeenCalledWith(RN, TARGET);
    expect(llmProvider.parseIntent.mock.calls[0][0].knownCategories).toEqual(['rolly', 'sety']);
  });

  it('falls back to the legacy slugs when the catalog has no categories', async () => {
    const { service, llmProvider } = makeService([]);

    await service.parse('какие у вас есть роллы', { rn: RN, target: TARGET });

    expect(llmProvider.parseIntent.mock.calls[0][0].knownCategories).toEqual([
      ...LEGACY_CATEGORY_SLUGS,
    ]);
  });

  it('falls back to the legacy slugs when the catalog lookup throws', async () => {
    const { service, llmProvider } = makeService(new Error('db down'));

    await service.parse('какие у вас есть роллы', { rn: RN, target: TARGET });

    expect(llmProvider.parseIntent.mock.calls[0][0].knownCategories).toEqual([
      ...LEGACY_CATEGORY_SLUGS,
    ]);
  });

  it('caps the category list so the prompt cannot grow unbounded', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      slug: `slug-${i}`,
      name: `Категория ${i}`,
    }));
    const { service, llmProvider } = makeService(many);

    await service.parse('роллы', { rn: RN, target: TARGET });

    expect(llmProvider.parseIntent.mock.calls[0][0].knownCategories.length).toBeLessThanOrEqual(40);
  });

  it('keeps passing the screen context and channel through', async () => {
    const { service, llmProvider } = makeService([{ slug: 'rolly', name: 'Роллы' }]);

    await service.parse('роллы', { rn: RN, target: TARGET, screenContext: 'catalog' });

    expect(llmProvider.parseIntent.mock.calls[0][0]).toMatchObject({
      message: 'роллы',
      screenContext: 'catalog',
      target: TARGET,
    });
  });
});
