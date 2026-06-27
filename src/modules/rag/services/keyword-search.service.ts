import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { sql } from 'drizzle-orm';

export interface KeywordSearchResult {
  chunkId: string;
  productId: string;
  score: number;
}

@Injectable()
export class KeywordSearchService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async search(
    query: string,
    rn: string,
    br: string,
    target: string,
    topK = 50,
  ): Promise<KeywordSearchResult[]> {
    const tsQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w + ':*')
      .join(' & ');

    try {
      const results = await this.db.execute<{
        chunk_id: string;
        product_id: string;
        score: number;
      }>(sql`
        SELECT
          pc.id AS chunk_id,
          pc.product_id,
          ts_rank(to_tsvector('russian', pc.searchable_text), to_tsquery('russian', ${tsQuery})) AS score
        FROM product_chunks pc
        JOIN city_products cp ON cp.product_id = pc.product_id
          AND cp.rn = ${rn}::uuid
          AND cp.br = ${br}::uuid
          AND cp.target = ${target}
          AND cp.is_available = true
          AND cp.is_valid = true
        WHERE pc.rn = ${rn}::uuid
          AND pc.br = ${br}::uuid
          AND pc.target = ${target}
          AND to_tsvector('russian', pc.searchable_text) @@ to_tsquery('russian', ${tsQuery})
        ORDER BY score DESC
        LIMIT ${topK}
      `);

      const rows = (results as any).rows ?? (results as any);
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        chunkId: r.chunk_id,
        productId: r.product_id,
        score: parseFloat(r.score),
      }));
    } catch {
      // Fallback to simple ILIKE if tsquery fails
      return this.fallbackSearch(query, rn, br, target, topK);
    }
  }

  private async fallbackSearch(
    query: string,
    rn: string,
    br: string,
    target: string,
    topK: number,
  ): Promise<KeywordSearchResult[]> {
    const results = await this.db.execute<{
      chunk_id: string;
      product_id: string;
    }>(sql`
      SELECT pc.id AS chunk_id, pc.product_id
      FROM product_chunks pc
      JOIN city_products cp ON cp.product_id = pc.product_id
        AND cp.rn = ${rn}::uuid
        AND cp.br = ${br}::uuid
        AND cp.target = ${target}
        AND cp.is_available = true
      WHERE pc.rn = ${rn}::uuid
        AND pc.br = ${br}::uuid
        AND pc.target = ${target}
        AND pc.searchable_text ILIKE ${'%' + query + '%'}
      LIMIT ${topK}
    `);

    const rows2 = (results as any).rows ?? (results as any);
    return (Array.isArray(rows2) ? rows2 : []).map((r: any) => ({
      chunkId: r.chunk_id,
      productId: r.product_id,
      score: 0.5,
    }));
  }
}
