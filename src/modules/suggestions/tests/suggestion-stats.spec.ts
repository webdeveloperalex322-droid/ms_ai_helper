import { describe, it, expect, vi } from 'vitest';
import { SuggestionStatsService } from '../services/suggestion-stats.service';

const RN = 'rn-test';
const TARGET = 'WEB';

function makeService(
  options: {
    rows?: any[];
    error?: Error;
    windowDays?: number;
  } = {},
) {
  const groupBy = options.error
    ? vi.fn().mockRejectedValue(options.error)
    : vi
        .fn()
        .mockResolvedValue(options.rows ?? [{ suggestionId: 's1', shown: '100', clicked: '25' }]);

  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ groupBy }) }),
    }),
  };

  const config = {
    get: vi
      .fn()
      .mockImplementation((key: string) =>
        key === 'SUGGESTIONS_STATS_WINDOW_DAYS' ? options.windowDays : undefined,
      ),
  };

  return { service: new SuggestionStatsService(db as any, config as any), db, groupBy };
}

describe('SuggestionStatsService', () => {
  it('returns shown and clicked counts per suggestion', async () => {
    const { service } = makeService({
      rows: [
        { suggestionId: 's1', shown: '100', clicked: '25' },
        { suggestionId: 's2', shown: '40', clicked: '0' },
      ],
    });

    const stats = await service.forNetwork(RN, TARGET);

    expect(stats.get('s1')).toEqual({ shown: 100, clicked: 25 });
    expect(stats.get('s2')).toEqual({ shown: 40, clicked: 0 });
  });

  it('skips rows without a suggestion id', async () => {
    const { service } = makeService({
      rows: [{ suggestionId: null, shown: '10', clicked: '2' }],
    });

    const stats = await service.forNetwork(RN, TARGET);

    expect(stats.size).toBe(0);
  });

  it('serves repeated calls from the cache', async () => {
    const { service, groupBy } = makeService();

    await service.forNetwork(RN, TARGET);
    await service.forNetwork(RN, TARGET);

    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it('keys the cache by network and channel', async () => {
    const { service, groupBy } = makeService();

    await service.forNetwork(RN, 'WEB');
    await service.forNetwork(RN, 'APP');

    expect(groupBy).toHaveBeenCalledTimes(2);
  });

  it('degrades to empty statistics when the query fails', async () => {
    const { service } = makeService({ error: new Error('db down') });

    const stats = await service.forNetwork(RN, TARGET);

    expect(stats.size).toBe(0);
  });

  it('skips the query entirely for a zero-day window', async () => {
    const { service, groupBy } = makeService({ windowDays: 0 });

    const stats = await service.forNetwork(RN, TARGET);

    expect(stats.size).toBe(0);
    expect(groupBy).not.toHaveBeenCalled();
  });
});
