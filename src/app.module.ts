import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import configuration from './config/configuration';
import { AccessKeyGuard } from './common/security/access-key.guard';
import { AccessKeyRegistry } from './common/security/access-key.registry';
import { ConsumerThrottlerGuard } from './common/throttling/consumer-throttler.guard';
import { DatabaseModule } from './database/database.module';
import { LlmModule } from './common/llm/llm.module';
import { HealthController } from './healthcheck/health.controller';
import { CatalogImportModule } from './modules/catalog-import/catalog-import.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { RagModule } from './modules/rag/rag.module';
import { SiteKnowledgeModule } from './modules/site-knowledge/site-knowledge.module';
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
    // Two profiles: `costly` guards the endpoint that triggers paid LLM calls,
    // `standard` covers the rest of the public contour. Thresholds come from
    // config — the spec leaves the numbers to be tuned on real traffic.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'costly',
            limit: config.get<number>('THROTTLE_COSTLY_LIMIT') ?? 10,
            ttl: seconds(config.get<number>('THROTTLE_COSTLY_TTL_SEC') ?? 60),
          },
          {
            name: 'standard',
            limit: config.get<number>('THROTTLE_STANDARD_LIMIT') ?? 60,
            ttl: seconds(config.get<number>('THROTTLE_STANDARD_TTL_SEC') ?? 60),
          },
        ],
      }),
    }),
    DatabaseModule,
    LlmModule,
    CatalogImportModule,
    CatalogModule,
    RagModule,
    SiteKnowledgeModule,
    AssistantModule,
    SuggestionsModule,
    AnalyticsModule,
    AdminConfigModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    AccessKeyRegistry,
    // Registered here rather than via app.useGlobalGuards() in main.ts:
    // a guard created with `new` receives no dependency injection, and this
    // one needs ConfigService and the key registry.
    { provide: APP_GUARD, useClass: AccessKeyGuard },
    // Order matters: the access guard runs first so the consumer label is
    // already on the request when the throttler picks its counter key.
    { provide: APP_GUARD, useClass: ConsumerThrottlerGuard },
  ],
})
export class AppModule {}
