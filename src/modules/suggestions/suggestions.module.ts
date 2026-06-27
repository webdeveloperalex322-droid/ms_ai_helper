import { Module } from '@nestjs/common';
import { SuggestionsController } from './controllers/suggestions.controller';
import { SuggestionService } from './services/suggestion.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [SuggestionsController],
  providers: [SuggestionService],
  exports: [SuggestionService],
})
export class SuggestionsModule {}
