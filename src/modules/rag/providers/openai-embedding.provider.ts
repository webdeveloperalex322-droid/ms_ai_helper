import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingProvider } from './embedding.provider.interface';

@Injectable()
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OpenAIEmbeddingProvider.name);

  modelName(): string {
    return 'text-embedding-3-small';
  }

  dimensions(): number {
    return 1536;
  }

  async embed(_text: string): Promise<number[]> {
    // TODO: implement with openai SDK when EMBEDDING_PROVIDER=openai
    this.logger.warn('OpenAI embedding not configured, falling back to mock');
    throw new Error('OpenAI embedding provider not implemented in this prototype');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
