import { Module } from '@nestjs/common';
import { SuggestionsController } from './controllers/suggestions.controller';
import { SuggestionService } from './services/suggestion.service';
import { SuggestionSelectorService } from './services/suggestion-selector.service';
import { DayPartService } from './services/day-part.service';
import { SuggestionStatsService } from './services/suggestion-stats.service';
import {
  KNOWLEDGE_AVAILABILITY_PORT,
  SuggestionEligibilityService,
} from './services/suggestion-eligibility.service';
import { CatalogModule } from '../catalog/catalog.module';
import { SiteKnowledgeModule } from '../site-knowledge/site-knowledge.module';
import { SiteKnowledgeSearchService } from '../site-knowledge/services/site-knowledge-search.service';

@Module({
  imports: [CatalogModule, SiteKnowledgeModule],
  controllers: [SuggestionsController],
  providers: [
    SuggestionService,
    SuggestionSelectorService,
    SuggestionEligibilityService,
    DayPartService,
    SuggestionStatsService,
    // Service suggestions are offered only where the city knowledge base is
    // indexed; the eligibility check asks through this narrow port.
    { provide: KNOWLEDGE_AVAILABILITY_PORT, useExisting: SiteKnowledgeSearchService },
  ],
  exports: [SuggestionService],
})
export class SuggestionsModule {}
