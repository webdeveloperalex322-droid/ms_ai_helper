import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { sql } from 'drizzle-orm';

export interface VectorSearchResult {
  chunkId: string;
  productId: string;
  score: number;
}

export interface VectorSearchFilters {
  rn: string;
  br: string;
  target: string;
  topK?: number;
}

@Injectable()
export class VectorSearchService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async search(queryVector: number[], filters: VectorSearchFilters): Promise<VectorSearchResult[]> {
    const topK = filters.topK ?? 50;
    const vectorStr = `[${queryVector.join(',')}]`;

    const results = await this.db.execute<{
      chunk_id: string;
      product_id: string;
      score: number;
    }>(sql`
      SELECT
        pe.chunk_id,
        pc.product_id,
        1 - (pe.embedding <=> ${vectorStr}::vector) AS score
      FROM product_embeddings pe
      JOIN product_chunks pc ON pe.chunk_id = pc.id
      JOIN city_products cp ON cp.product_id = pc.product_id
        AND cp.rn = ${filters.rn}::uuid
        AND cp.br = ${filters.br}::uuid
        AND cp.target = ${filters.target}
        AND cp.is_available = true
        AND cp.is_valid = true
      JOIN cities c ON c.br = cp.br AND c.rn = cp.rn AND c.is_active = true
      JOIN products p ON p.id = cp.product_id AND p.is_active = true
      WHERE pc.rn = ${filters.rn}::uuid
        AND pc.br = ${filters.br}::uuid
        AND pc.target = ${filters.target}
        AND pc.embedding_status = 'ready'
      ORDER BY pe.embedding <=> ${vectorStr}::vector
      LIMIT ${topK}
    `);

    const rows = (results as any).rows ?? (results as any);
    return (Array.isArray(rows) ? rows : []).map((r: any) => ({
      chunkId: r.chunk_id,
      productId: r.product_id,
      score: parseFloat(r.score),
    }));
  }
}
