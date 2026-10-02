import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantController } from './controllers/assistant.controller';
import { AssistantOrchestratorService } from './services/assistant-orchestrator.service';
import { IntentSlotParserService } from './services/intent-slot-parser.service';
import { ShortlistBuilderService } from './services/shortlist-builder.service';
import { ResponseValidatorService } from './services/response-validator.service';
import { FallbackService } from './services/fallback.service';
import { InfoAnswerService } from './services/info-answer.service';
import { LLM_PROVIDER_TOKEN } from './providers/llm.provider.interface';
import { MockLLMProvider } from './providers/mock-llm.provider';
import { OpenAILLMProvider } from './providers/openai-llm.provider';
import { RagModule } from '../rag/rag.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SiteKnowledgeModule } from '../site-knowledge/site-knowledge.module';

@Module({
  imports: [RagModule, CatalogModule, AnalyticsModule, SiteKnowledgeModule],
  controllers: [AssistantController],
  providers: [
    {
      provide: LLM_PROVIDER_TOKEN,
      inject: [ConfigService, MockLLMProvider, OpenAILLMProvider],
      useFactory: (config: ConfigService, mock: MockLLMProvider, openai: OpenAILLMProvider) => {
        return config.get('LLM_PROVIDER') === 'openai' ? openai : mock;
      },
    },
    MockLLMProvider,
    OpenAILLMProvider,
    AssistantOrchestratorService,
    IntentSlotParserService,
    ShortlistBuilderService,
    ResponseValidatorService,
    FallbackService,
    InfoAnswerService,
  ],
  exports: [AssistantOrchestratorService],
})
export class AssistantModule {}
