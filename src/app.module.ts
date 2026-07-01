import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { LlmModule } from './common/llm/llm.module';
import { HealthController } from './healthcheck/health.controller';
import { CatalogImportModule } from './modules/catalog-import/catalog-import.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { RagModule } from './modules/rag/rag.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminConfigModule } from './modules/admin-config/admin-config.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    DatabaseModule,
    LlmModule,
    CatalogImportModule,
    CatalogModule,
    RagModule,
    AssistantModule,
    SuggestionsModule,
    AnalyticsModule,
    AdminConfigModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
