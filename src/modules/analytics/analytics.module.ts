import { Module } from '@nestjs/common';
import { AnalyticsService } from './services/analytics.service';
import { EventsController } from './controllers/events.controller';

@Module({
  controllers: [EventsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
