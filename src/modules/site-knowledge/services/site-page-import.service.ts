import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { sitePageChunks, sitePageEmbeddings, sitePages } from '../../../database/schema';
import {
  EMBEDDING_PROVIDER_TOKEN,
  EmbeddingProvider,
} from '../../rag/providers/embedding.provider.interface';
import { contentHash, type CrawlSnapshot, type CrawlSnapshotPage } from '../snapshot';
import { chunkPage, type PageChunkDraft } from './page-chunker';
import { SitePageIndexerService } from './site-page-indexer.service';

export interface ImportOptions {
  force?: boolean;
  dryRun?: boolean;
}

export type ImportAction = 'inserted' | 'updated' | 'skipped' | 'failed' | 'ignored';

export interface ImportPageResult {
  url: string;
  action: ImportAction;
  chunks: number;
  error?: string;
}

export interface ImportReport {
  pages: ImportPageResult[];
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  ignored: number;
  chunksIndexed: number;
  chunksFailed: number;
  durationMs: number;
  dryRun: boolean;
}

export interface ExistingChunk {
  id: string;
  embeddingStatus: string;
  embeddingModel: string | null;
}

export interface ExistingPage {
  id: string;
  contentHash: string;
  chunks: ExistingChunk[];
}

export interface PageWriteData {
  rn: string;
  br: string;
  url: string;
  pageKey: string;
  title: string;
  content: string;
  contentHash: string;
  source: string;
  fetchedAt: Date;
}

/**
 * Loads a crawl snapshot into site_pages / site_page_chunks and indexes the
 * chunks. A page is skipped when its content hash matches and every chunk is
 * `ready` under the current embedding model (same rule as the product bulk
 * indexer, ADR-010); changed content replaces the chunks wholesale.
 */
@Injectable()
export class SitePageImportService {
  private readonly logger = new Logger(SitePageImportService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    private readonly indexer: SitePageIndexerService,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly provider: EmbeddingProvider,
  ) {}

  async importSnapshot(
    snapshot: CrawlSnapshot,
    options: ImportOptions = {},
  ): Promise<ImportReport> {
    const startedAt = Date.now();
    const force = options.force ?? false;
    const dryRun = options.dryRun ?? false;
    const modelName = this.provider.modelName();

    const report: ImportReport = {
      pages: [],
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      ignored: 0,
      chunksIndexed: 0,
      chunksFailed: 0,
      durationMs: 0,
      dryRun,
    };

    for (const page of snapshot.pages) {
      const result = await this.importPage(snapshot, page, { force, dryRun, modelName }, report);
      report.pages.push(result);
      report[result.action]++;
    }

    report.durationMs = Date.now() - startedAt;
    return report;
  }

  private async importPage(
    snapshot: CrawlSnapshot,
    page: CrawlSnapshotPage,
    ctx: { force: boolean; dryRun: boolean; modelName: string },
    report: ImportReport,
  ): Promise<ImportPageResult> {
    if (page.status !== 'ok') {
      return { url: page.url, action: 'ignored', chunks: 0 };
    }

    try {
      const existing = await this.findPage(snapshot.rn, snapshot.br, page.url);
      const drafts = chunkPage({ title: page.title, content: page.content });
      const hash = page.content_hash || contentHash(page.content);

      if (existing && !ctx.force && existing.contentHash === hash) {
        const upToDate =
          existing.chunks.length > 0 &&
          existing.chunks.every(
            (c) => c.embeddingStatus === 'ready' && c.embeddingModel === ctx.modelName,
          );
        if (upToDate) {
          return { url: page.url, action: 'skipped', chunks: existing.chunks.length };
        }

        // Same text, stale or missing embeddings: re-embed what is there.
        if (existing.chunks.length > 0) {
          if (ctx.dryRun)
            return { url: page.url, action: 'updated', chunks: existing.chunks.length };
          const error = await this.index(
            existing.chunks.map((c) => c.id),
            report,
          );
          return {
            url: page.url,
            action: 'updated',
            chunks: existing.chunks.length,
            ...(error && { error }),
          };
        }
      }

      const action: ImportAction = existing ? 'updated' : 'inserted';
      if (ctx.dryRun) {
        return { url: page.url, action, chunks: drafts.length };
      }

      const data: PageWriteData = {
        rn: snapshot.rn,
        br: snapshot.br,
        url: page.url,
        pageKey: page.key,
        title: page.title,
        content: page.content,
        contentHash: hash,
        source: 'crawler',
        fetchedAt: new Date(page.fetched_at),
      };

      const pageId = existing ? existing.id : await this.insertPage(data);
      if (existing) await this.updatePage(existing.id, data);

      const chunkIds = await this.replaceChunks(pageId, snapshot.rn, snapshot.br, drafts);
      const error = await this.index(chunkIds, report);

      return { url: page.url, action, chunks: chunkIds.length, ...(error && { error }) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Import of ${page.url} failed: ${message}`);
      return { url: page.url, action: 'failed', chunks: 0, error: message };
    }
  }

  /** Runs the indexer and folds its counters into the report; returns a summary of chunk errors. */
  private async index(chunkIds: string[], report: ImportReport): Promise<string | undefined> {
    const result = await this.indexer.indexChunks(chunkIds);
    report.chunksIndexed += result.indexed;
    report.chunksFailed += result.failed;
    return result.errors.length ? result.errors.join('; ') : undefined;
  }

  // --- data access (overridden in tests) ---------------------------------

  protected async findPage(rn: string, br: string, url: string): Promise<ExistingPage | null> {
    const [row] = await this.db
      .select({ id: sitePages.id, contentHash: sitePages.contentHash })
      .from(sitePages)
      .where(and(eq(sitePages.rn, rn), eq(sitePages.br, br), eq(sitePages.url, url)))
      .limit(1);
    if (!row) return null;

    const chunks = await this.db
      .select({
        id: sitePageChunks.id,
        embeddingStatus: sitePageChunks.embeddingStatus,
        embeddingModel: sitePageEmbeddings.modelName,
      })
      .from(sitePageChunks)
      .leftJoin(sitePageEmbeddings, eq(sitePageEmbeddings.chunkId, sitePageChunks.id))
      .where(eq(sitePageChunks.pageId, row.id))
      .orderBy(sitePageChunks.chunkIndex);

    return { id: row.id, contentHash: row.contentHash, chunks };
  }

  protected async insertPage(data: PageWriteData): Promise<string> {
    const [row] = await this.db
      .insert(sitePages)
      .values({ ...data, isActive: true })
      .returning({ id: sitePages.id });
    return row.id;
  }

  protected async updatePage(id: string, data: PageWriteData): Promise<void> {
    await this.db
      .update(sitePages)
      .set({
        pageKey: data.pageKey,
        title: data.title,
        content: data.content,
        contentHash: data.contentHash,
        source: data.source,
        fetchedAt: data.fetchedAt,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(sitePages.id, id));
  }

  /** Deletes the page's chunks (embeddings cascade) and inserts the new ones as `pending`. */
  protected async replaceChunks(
    pageId: string,
    rn: string,
    br: string,
    drafts: PageChunkDraft[],
  ): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await tx.delete(sitePageChunks).where(eq(sitePageChunks.pageId, pageId));
      if (drafts.length === 0) return [];
      const rows = await tx
        .insert(sitePageChunks)
        .values(
          drafts.map((draft) => ({
            pageId,
            rn,
            br,
            chunkIndex: draft.index,
            heading: draft.heading,
            text: draft.text,
            contentHash: contentHash(draft.text),
            embeddingStatus: 'pending',
          })),
        )
        .returning({ id: sitePageChunks.id });
      return rows.map((r) => r.id);
    });
  }
}
