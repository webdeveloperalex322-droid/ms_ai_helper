import { Injectable } from '@nestjs/common';
import { EmbeddingProvider } from './embedding.provider.interface';
import { createHash } from 'crypto';

@Injectable()
export class MockEmbeddingProvider implements EmbeddingProvider {
  modelName(): string {
    return 'mock-embedding-v1';
  }

  dimensions(): number {
    return 1536;
  }

  async embed(text: string): Promise<number[]> {
    return this.deterministicVector(text, this.dimensions());
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private deterministicVector(text: string, dims: number): number[] {
    const hash = createHash('sha256').update(text).digest('hex');
    const vector: number[] = [];

    for (let i = 0; i < dims; i++) {
      const hexPair = hash[(i * 2) % hash.length] + hash[(i * 2 + 1) % hash.length];
      const val = (parseInt(hexPair, 16) / 255) * 2 - 1;
      vector.push(val);
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / (magnitude || 1));
  }
}
