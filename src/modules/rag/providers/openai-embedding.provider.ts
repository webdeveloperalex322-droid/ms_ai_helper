import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider } from './embedding.provider.interface';
import { LLM_CLIENT_TOKEN, LlmClient } from '../../../common/llm/llm-client.interface';

@Injectable()
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    @Inject(LLM_CLIENT_TOKEN) private readonly llmClient: LlmClient,
    private readonly config: ConfigService,
  ) {}

  modelName(): string {
    return this.config.get<string>('EMBEDDING_MODEL') ?? 'text-embedding-3-small';
  }

  dimensions(): number {
    return 1536;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.llmClient.createEmbeddings(text, this.modelName());
    return result.embeddings[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const result = await this.llmClient.createEmbeddings(texts, this.modelName());
    return result.embeddings;
  }
}
