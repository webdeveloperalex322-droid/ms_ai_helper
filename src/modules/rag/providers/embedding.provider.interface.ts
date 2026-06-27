export const EMBEDDING_PROVIDER_TOKEN = 'EMBEDDING_PROVIDER';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  modelName(): string;
  dimensions(): number;
}
