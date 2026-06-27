import { Module } from '@nestjs/common';
import { AdminRulesService } from './services/admin-rules.service';
import { SuggestionAdminService } from './services/suggestion-admin.service';
import { SuggestionAdminController } from './controllers/suggestion-admin.controller';

@Module({
  controllers: [SuggestionAdminController],
  providers: [AdminRulesService, SuggestionAdminService],
  exports: [AdminRulesService],
})
export class AdminConfigModule {}
