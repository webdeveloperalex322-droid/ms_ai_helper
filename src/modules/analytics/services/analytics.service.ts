import { Injectable, Inject, Logger } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { assistantSuggestionEvents } from '../../../database/schema';
import { randomUUID } from 'crypto';

export const SUPPORTED_EVENT_TYPES = [
  'suggestion_shown',
  'suggestion_clicked',
  'product_card_clicked',
  'add_to_cart',
  'feedback_like',
  'feedback_dislike',
  'products_returned',
  'empty_result',
] as const;

export type EventType = (typeof SUPPORTED_EVENT_TYPES)[number];

export interface RecordEventInput {
  suggestionId?: string;
  requestId?: string;
  sessionId?: string;
  rn: string;
  br?: string;
  target: string;
  eventType: string;
  retrievedProductIds?: string[];
  selectedProductIds?: string[];
  metadata?: Record<string, any>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async recordEvent(input: RecordEventInput): Promise<void> {
    try {
      await this.db.insert(assistantSuggestionEvents).values({
        id: randomUUID(),
        suggestionId: input.suggestionId ?? null,
        requestId: input.requestId ?? null,
        sessionId: input.sessionId ?? null,
        rn: input.rn || '00000000-0000-0000-0000-000000000000',
        br: input.br ?? null,
        target: input.target || 'WEB',
        eventType: input.eventType,
        retrievedProductIds: input.retrievedProductIds ?? null,
        selectedProductIds: input.selectedProductIds ?? null,
        metadata: input.metadata ?? null,
        createdAt: new Date(),
      });
    } catch (err) {
      this.logger.warn(`Failed to record analytics event: ${err}`);
    }
  }
}
