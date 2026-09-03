import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchableTextBuilderService } from './services/searchable-text-builder.service';
import { EmbeddingService } from './services/embedding.service';
import { VectorSearchService } from './services/vector-search.service';
import { KeywordSearchService } from './services/keyword-search.service';
import { HybridRetrieverService } from './services/hybrid-retriever.service';
import { RagBulkIndexerService } from './services/bulk-indexer.service';
import { EMBEDDING_PROVIDER_TOKEN } from './providers/embedding.provider.interface';
import { MockEmbeddingProvider } from './providers/mock-embedding.provider';
import { OpenAIEmbeddingProvider } from './providers/openai-embedding.provider';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  providers: [
    {
      provide: EMBEDDING_PROVIDER_TOKEN,
      inject: [ConfigService, MockEmbeddingProvider, OpenAIEmbeddingProvider],
      useFactory: (
        config: ConfigService,
        mock: MockEmbeddingProvider,
        openai: OpenAIEmbeddingProvider,
      ) => {
        return config.get('EMBEDDING_PROVIDER') === 'openai' ? openai : mock;
      },
    },
    MockEmbeddingProvider,
    OpenAIEmbeddingProvider,
    SearchableTextBuilderService,
    EmbeddingService,
    VectorSearchService,
    KeywordSearchService,
    HybridRetrieverService,
    RagBulkIndexerService,
  ],
  exports: [
    SearchableTextBuilderService,
    EmbeddingService,
    HybridRetrieverService,
    RagBulkIndexerService,
    EMBEDDING_PROVIDER_TOKEN,
  ],
})
export class RagModule {}
