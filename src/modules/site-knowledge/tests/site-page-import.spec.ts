import { describe, it, expect, vi } from 'vitest';
import {
  SitePageImportService,
  type ExistingPage,
  type ExistingChunk,
  type PageWriteData,
} from '../services/site-page-import.service';
import type {
  SitePageIndexerService,
  IndexChunksResult,
} from '../services/site-page-indexer.service';
import type { PageChunkDraft } from '../services/page-chunker';
import {
  contentHash,
  SNAPSHOT_VERSION,
  type CrawlSnapshot,
  type CrawlSnapshotPage,
} from '../snapshot';
import type { EmbeddingProvider } from '../../rag/providers/embedding.provider.interface';

const RN = 'rn-1';
const BR = 'br-1';
const MODEL = 'test-model';
const SITE = 'https://tyumen.sushi-master.ru';

const provider = { modelName: () => MODEL } as unknown as EmbeddingProvider;

const LONG =
  'Достаточно длинный абзац текста страницы, чтобы фрагмент был содержательным и самостоятельным.';

function page(path: string, content: string, status: 'ok' | 'failed' = 'ok'): CrawlSnapshotPage {
  return {
    key: path.slice(1),
    path,
    url: `${SITE}${path}`,
    title: `Страница ${path}`,
    status,
    error: status === 'failed' ? 'timeout' : null,
    fetched_at: '2026-10-02T06:00:00.000Z',
    content_hash: status === 'ok' ? contentHash(content) : '',
    content: status === 'ok' ? content : '',
  };
}

function snapshot(pages: CrawlSnapshotPage[]): CrawlSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    site_url: SITE,
    rn: RN,
    br: BR,
    crawled_at: '2026-10-02T06:00:00.000Z',
    pages,
  };
}

const TWO_SECTIONS = `# Страница /delivery\n## Оплата\n${LONG}\n## Доставка\n${LONG}`;

interface Store {
  pages: Map<string, ExistingPage & { data: PageWriteData }>;
  chunks: Map<string, { pageId: string; drafts: PageChunkDraft[]; ids: string[] }>;
}

class TestImport extends SitePageImportService {
  store: Store = { pages: new Map(), chunks: new Map() };
  nextId = 1;
  calls: string[] = [];

  constructor(indexer: SitePageIndexerService) {
    super({} as any, indexer, provider);
  }

  seed(
    url: string,
    content: string,
    chunkStatuses: Array<{ status: string; model: string | null }>,
  ) {
    const id = `page-${this.nextId++}`;
    const ids = chunkStatuses.map(() => `chunk-${this.nextId++}`);
    const chunks: ExistingChunk[] = chunkStatuses.map((c, i) => ({
      id: ids[i],
      embeddingStatus: c.status,
      embeddingModel: c.model,
    }));
    this.store.pages.set(url, {
      id,
      contentHash: contentHash(content),
      chunks,
      data: {} as PageWriteData,
    });
    this.store.chunks.set(id, { pageId: id, drafts: [], ids });
    return { id, ids };
  }

  protected async findPage(_rn: string, _br: string, url: string): Promise<ExistingPage | null> {
    this.calls.push(`find ${url}`);
    const found = this.store.pages.get(url);
    return found ? { id: found.id, contentHash: found.contentHash, chunks: found.chunks } : null;
  }

  protected async insertPage(data: PageWriteData): Promise<string> {
    this.calls.push(`insert ${data.url}`);
    const id = `page-${this.nextId++}`;
    this.store.pages.set(data.url, { id, contentHash: data.contentHash, chunks: [], data });
    return id;
  }

  protected async updatePage(id: string, data: PageWriteData): Promise<void> {
    this.calls.push(`update ${data.url}`);
    const entry = [...this.store.pages.values()].find((p) => p.id === id)!;
    entry.contentHash = data.contentHash;
    entry.data = data;
  }

  protected async replaceChunks(
    pageId: string,
    _rn: string,
    _br: string,
    drafts: PageChunkDraft[],
  ): Promise<string[]> {
    this.calls.push(`replaceChunks ${pageId} x${drafts.length}`);
    const ids = drafts.map(() => `chunk-${this.nextId++}`);
    this.store.chunks.set(pageId, { pageId, drafts, ids });
    return ids;
  }
}

function fakeIndexer(impl?: (ids: string[]) => IndexChunksResult) {
  const indexChunks = vi.fn(async (ids: string[]) =>
    impl ? impl(ids) : { indexed: ids.length, failed: 0, errors: [] },
  );
  return { indexer: { indexChunks } as unknown as SitePageIndexerService, indexChunks };
}

describe('SitePageImportService.importSnapshot', () => {
  it('inserts a new page, chunks it and indexes the chunks', async () => {
    const { indexer, indexChunks } = fakeIndexer();
    const service = new TestImport(indexer);

    const report = await service.importSnapshot(snapshot([page('/delivery', TWO_SECTIONS)]));

    expect(report.pages[0]).toMatchObject({
      url: `${SITE}/delivery`,
      action: 'inserted',
      chunks: 2,
    });
    expect(report).toMatchObject({
      inserted: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      ignored: 0,
      chunksIndexed: 2,
      chunksFailed: 0,
      dryRun: false,
    });
    expect(service.calls).toEqual([
      `find ${SITE}/delivery`,
      `insert ${SITE}/delivery`,
      expect.stringMatching(/^replaceChunks page-\d+ x2$/),
    ]);
    expect(indexChunks).toHaveBeenCalledTimes(1);
    expect(indexChunks.mock.calls[0][0]).toHaveLength(2);

    const stored = service.store.pages.get(`${SITE}/delivery`)!;
    expect(stored.data).toMatchObject({
      rn: RN,
      br: BR,
      pageKey: 'delivery',
      title: 'Страница /delivery',
      contentHash: contentHash(TWO_SECTIONS),
      source: 'crawler',
    });
    expect(stored.data.fetchedAt).toBeInstanceOf(Date);
  });

  it('skips a page whose hash matches and whose chunks are ready with the same model', async () => {
    const { indexer, indexChunks } = fakeIndexer();
    const service = new TestImport(indexer);
    service.seed(`${SITE}/delivery`, TWO_SECTIONS, [
      { status: 'ready', model: MODEL },
      { status: 'ready', model: MODEL },
    ]);

    const report = await service.importSnapshot(snapshot([page('/delivery', TWO_SECTIONS)]));

    expect(report.pages[0].action).toBe('skipped');
    expect(report.skipped).toBe(1);
    expect(indexChunks).not.toHaveBeenCalled();
    expect(service.calls).toEqual([`find ${SITE}/delivery`]);
  });

  it('re-indexes existing chunks (without recreating them) when a chunk is not ready', async () => {
    const { indexer, indexChunks } = fakeIndexer();
    const service = new TestImport(indexer);
    const { ids } = service.seed(`${SITE}/delivery`, TWO_SECTIONS, [
      { status: 'ready', model: MODEL },
      { status: 'failed', model: null },
    ]);

    const report = await service.importSnapshot(snapshot([page('/delivery', TWO_SECTIONS)]));

    expect(report.pages[0]).toMatchObject({ action: 'updated', chunks: 2 });
    expect(indexChunks).toHaveBeenCalledWith(ids);
    expect(service.calls.some((c) => c.startsWith('replaceChunks'))).toBe(false);
    expect(service.calls.some((c) => c.startsWith('update '))).toBe(false);
  });

  it('re-indexes when the embeddings were built with another model', async () => {
    const { indexer, indexChunks } = fakeIndexer();
    const service = new TestImport(indexer);
    service.seed(`${SITE}/delivery`, TWO_SECTIONS, [{ status: 'ready', model: 'old-model' }]);

    const report = await service.importSnapshot(snapshot([page('/delivery', TWO_SECTIONS)]));

    expect(report.pages[0].action).toBe('updated');
    expect(indexChunks).toHaveBeenCalledTimes(1);
  });

  it('replaces chunks and updates the page when the content changed', async () => {
    const { indexer, indexChunks } = fakeIndexer();
    const service = new TestImport(indexer);
    const { id } = service.seed(`${SITE}/delivery`, 'старый текст', [
      { status: 'ready', model: MODEL },
    ]);

    const report = await service.importSnapshot(snapshot([page('/delivery', TWO_SECTIONS)]));

    expect(report.pages[0]).toMatchObject({ action: 'updated', chunks: 2 });
    expect(service.calls).toEqual([
      `find ${SITE}/delivery`,
      `update ${SITE}/delivery`,
      `replaceChunks ${id} x2`,
    ]);
    expect(indexChunks.mock.calls[0][0]).toHaveLength(2);
  });

  it('treats --force like a content change', async () => {
    const { indexer, indexChunks } = fakeIndexer();
    const service = new TestImport(indexer);
    service.seed(`${SITE}/delivery`, TWO_SECTIONS, [
      { status: 'ready', model: MODEL },
      { status: 'ready', model: MODEL },
    ]);

    const report = await service.importSnapshot(snapshot([page('/delivery', TWO_SECTIONS)]), {
      force: true,
    });

    expect(report.pages[0].action).toBe('updated');
    expect(service.calls.some((c) => c.startsWith('replaceChunks'))).toBe(true);
    expect(indexChunks).toHaveBeenCalledTimes(1);
  });

  it('in dry-run mode counts actions without writing or indexing', async () => {
    const { indexer, indexChunks } = fakeIndexer();
    const service = new TestImport(indexer);
    service.seed(`${SITE}/about`, TWO_SECTIONS, [
      { status: 'ready', model: MODEL },
      { status: 'ready', model: MODEL },
    ]);

    const report = await service.importSnapshot(
      snapshot([
        page('/delivery', TWO_SECTIONS),
        page('/about', TWO_SECTIONS),
        page('/bonus', 'x', 'failed'),
      ]),
      { dryRun: true },
    );

    expect(report.dryRun).toBe(true);
    expect(report.pages.map((p) => p.action)).toEqual(['inserted', 'skipped', 'ignored']);
    expect(report.pages[0].chunks).toBe(2);
    expect(report).toMatchObject({ inserted: 1, skipped: 1, ignored: 1, chunksIndexed: 0 });
    expect(indexChunks).not.toHaveBeenCalled();
    expect(service.calls.filter((c) => !c.startsWith('find'))).toEqual([]);
  });

  it('ignores pages that failed in the snapshot and leaves the stored version alone', async () => {
    const { indexer } = fakeIndexer();
    const service = new TestImport(indexer);
    service.seed(`${SITE}/bonus`, 'старый текст', [{ status: 'ready', model: MODEL }]);

    const report = await service.importSnapshot(snapshot([page('/bonus', '', 'failed')]));

    expect(report.pages[0]).toMatchObject({ action: 'ignored', chunks: 0 });
    expect(report.ignored).toBe(1);
    expect(service.calls).toEqual([]);
    expect(service.store.pages.get(`${SITE}/bonus`)!.contentHash).toBe(contentHash('старый текст'));
  });

  it('records a page as failed when indexing throws, and continues with the next page', async () => {
    const indexChunks = vi.fn(async (ids: string[]) => {
      if (ids.length === 2) throw new Error('db down');
      return { indexed: ids.length, failed: 0, errors: [] };
    });
    const service = new TestImport({ indexChunks } as unknown as SitePageIndexerService);

    const report = await service.importSnapshot(
      snapshot([page('/delivery', TWO_SECTIONS), page('/about', `# Страница /about\n${LONG}`)]),
    );

    expect(report.pages[0]).toMatchObject({ action: 'failed', error: 'db down' });
    expect(report.pages[1].action).toBe('inserted');
    expect(report.failed).toBe(1);
    expect(report.inserted).toBe(1);
  });

  it('aggregates chunk failures reported by the indexer', async () => {
    const { indexer } = fakeIndexer((ids) => ({
      indexed: ids.length - 1,
      failed: 1,
      errors: ['chunk x: boom'],
    }));
    const service = new TestImport(indexer);

    const report = await service.importSnapshot(snapshot([page('/delivery', TWO_SECTIONS)]));

    expect(report.pages[0].action).toBe('inserted');
    expect(report.pages[0].error).toMatch(/boom/);
    expect(report).toMatchObject({ chunksIndexed: 1, chunksFailed: 1 });
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});
