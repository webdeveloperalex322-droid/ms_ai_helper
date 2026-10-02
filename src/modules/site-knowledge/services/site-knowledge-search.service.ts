import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { EmbeddingService } from '../../rag/services/embedding.service';

export interface KnowledgeSearchInput {
  query: string;
  rn: string;
  br: string;
  topK?: number;
}

export interface KnowledgePassage {
  chunkId: string;
  pageId: string;
  url: string;
  title: string;
  heading: string | null;
  text: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
}

/** Raw hit of one search branch. */
export interface KnowledgeHit {
  chunkId: string;
  pageId: string;
  url: string;
  title: string;
  heading: string | null;
  text: string;
  score: number;
}

export const SEMANTIC_WEIGHT = 0.7;
export const KEYWORD_WEIGHT = 0.3;
export const DEFAULT_TOP_K = 6;
const CANDIDATE_LIMIT = 20;

/**
 * Hybrid search over the site knowledge chunks of one city: pgvector cosine
 * plus Postgres full-text (russian), merged by chunk id. Keyword ranks are
 * normalized to the best hit so the two scales are comparable. Either branch
 * failing degrades to the other one; both empty → no passages.
 */
@Injectable()
export class SiteKnowledgeSearchService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    private readonly embeddings: EmbeddingService,
  ) {}

  async search(input: KnowledgeSearchInput): Promise<KnowledgePassage[]> {
    const topK = input.topK ?? DEFAULT_TOP_K;
    const query = input.query.trim();
    if (!query) return [];

    const queryVector = await this.embeddings.embedQuery(query);

    const none = (): KnowledgeHit[] => [];
    const [semantic, keyword] = await Promise.all([
      this.vectorSearch(queryVector, input.rn, input.br, CANDIDATE_LIMIT).catch(none),
      this.keywordSearch(query, input.rn, input.br, CANDIDATE_LIMIT).catch(none),
    ]);

    const maxKeyword = keyword.reduce((max, hit) => Math.max(max, hit.score), 0);
    const merged = new Map<string, KnowledgePassage>();

    for (const hit of semantic) {
      merged.set(hit.chunkId, { ...hit, semanticScore: hit.score, keywordScore: 0, score: 0 });
    }
    for (const hit of keyword) {
      const normalized = maxKeyword > 0 ? hit.score / maxKeyword : 0;
      const existing = merged.get(hit.chunkId);
      if (existing) {
        existing.keywordScore = normalized;
      } else {
        merged.set(hit.chunkId, { ...hit, semanticScore: 0, keywordScore: normalized, score: 0 });
      }
    }

    const passages = [...merged.values()].map((p) => ({
      ...p,
      score: SEMANTIC_WEIGHT * p.semanticScore + KEYWORD_WEIGHT * p.keywordScore,
    }));

    return passages.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  // --- data access (overridden in tests) ---------------------------------

  protected async vectorSearch(
    queryVector: number[],
    rn: string,
    br: string,
    limit: number,
  ): Promise<KnowledgeHit[]> {
    const vectorStr = `[${queryVector.join(',')}]`;

    const results = await this.db.execute(sql`
      SELECT
        c.id AS chunk_id,
        c.page_id,
        p.url,
        p.title,
        c.heading,
        c.text,
        1 - (e.embedding <=> ${vectorStr}::vector) AS score
      FROM site_page_embeddings e
      JOIN site_page_chunks c ON c.id = e.chunk_id
      JOIN site_pages p ON p.id = c.page_id AND p.is_active = true
      WHERE c.rn = ${rn}::uuid
        AND c.br = ${br}::uuid
        AND c.embedding_status = 'ready'
      ORDER BY e.embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);

    return toHits(results);
  }

  protected async keywordSearch(
    query: string,
    rn: string,
    br: string,
    limit: number,
  ): Promise<KnowledgeHit[]> {
    const tsQuery = buildTsQuery(query);
    if (!tsQuery) return [];

    const results = await this.db.execute(sql`
      SELECT
        c.id AS chunk_id,
        c.page_id,
        p.url,
        p.title,
        c.heading,
        c.text,
        ts_rank(to_tsvector('russian', c.text), to_tsquery('russian', ${tsQuery})) AS score
      FROM site_page_chunks c
      JOIN site_pages p ON p.id = c.page_id AND p.is_active = true
      WHERE c.rn = ${rn}::uuid
        AND c.br = ${br}::uuid
        AND to_tsvector('russian', c.text) @@ to_tsquery('russian', ${tsQuery})
      ORDER BY score DESC
      LIMIT ${limit}
    `);

    return toHits(results);
  }
}

/** `как оплатить заказ?` → `как:* & оплатить:* & заказ:*` (prefix match per word). */
export function buildTsQuery(query: string): string {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  return words.map((w) => `${w}:*`).join(' & ');
}

function toHits(results: unknown): KnowledgeHit[] {
  const rows = (results as any).rows ?? results;
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    chunkId: r.chunk_id,
    pageId: r.page_id,
    url: r.url,
    title: r.title,
    heading: r.heading ?? null,
    text: r.text,
    score: parseFloat(r.score),
  }));
}
