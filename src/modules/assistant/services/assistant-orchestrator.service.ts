import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import {
  aiLogs,
  assistantSuggestions,
  cities,
  cityProducts,
  products,
} from '../../../database/schema';
import { IntentSlotParserService } from './intent-slot-parser.service';
import { ShortlistBuilderService } from './shortlist-builder.service';
import { ResponseValidatorService } from './response-validator.service';
import { FallbackService } from './fallback.service';
import { LLM_PROVIDER_TOKEN, LLMProvider, IntentResult } from '../providers/llm.provider.interface';
import { eq, and, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface AssistantRequest {
  requestId?: string;
  sessionId?: string;
  rn: string;
  br: string;
  target: string;
  screenContext?: string;
  userMessage?: string;
  suggestionId?: string;
  channel?: string;
}

export interface AssistantResponse {
  request_id: string;
  reply_text: string;
  cards: Array<{
    product_id: string;
    name: string;
    price: number;
    currency: string;
    image_url?: string;
    reason: string;
    ui_action: string;
  }>;
  quick_replies: string[];
  actions: any[];
  need_clarification: boolean;
  clarification_question?: string | null;
  debug?: any;
}

@Injectable()
export class AssistantOrchestratorService {
  private readonly logger = new Logger(AssistantOrchestratorService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: DrizzleDB,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LLMProvider,
    private readonly intentParser: IntentSlotParserService,
    private readonly shortlistBuilder: ShortlistBuilderService,
    private readonly validator: ResponseValidatorService,
    private readonly fallback: FallbackService,
    private readonly config: ConfigService,
  ) {}

  async handle(request: AssistantRequest): Promise<AssistantResponse> {
    const requestId = request.requestId ?? randomUUID();
    const start = Date.now();

    // Pre-flight: city active check (FR-003, FR-010)
    const [cityRow] = await this.db
      .select({ isActive: cities.isActive })
      .from(cities)
      .where(and(eq(cities.rn, request.rn), eq(cities.br, request.br)))
      .limit(1);
    if (!cityRow?.isActive) {
      return this.buildEmptyStatusResponse(requestId);
    }

    // Pre-flight: active products count check (FR-004, FR-010)
    const [countRow] = await this.db
      .select({ total: count() })
      .from(products)
      .innerJoin(cityProducts, eq(cityProducts.productId, products.id))
      .where(
        and(
          eq(cityProducts.rn, request.rn),
          eq(cityProducts.br, request.br),
          eq(cityProducts.target, request.target),
          eq(products.isActive, true),
          eq(cityProducts.isAvailable, true),
        ),
      );
    if ((countRow?.total ?? 0) === 0) {
      return this.buildEmptyStatusResponse(requestId);
    }

    let intentResult: IntentResult;
    let retrievalQuery: string | undefined;
    let fallbackPayload: any = null;

    try {
      // 1. Resolve intent from suggestion or user message
      if (request.suggestionId) {
        const suggestionResult = await this.loadSuggestion(
          request.suggestionId,
          request.rn,
          request.br,
          request.target,
        );

        if (!suggestionResult) {
          const resp = this.fallback.forInvalidResponse();
          await this.logRequest(
            requestId,
            request,
            null,
            [],
            [],
            'suggestion_not_found',
            Date.now() - start,
            true,
          );
          return this.buildResponse(requestId, resp);
        }

        intentResult = this.intentParser.parseFromPayload(suggestionResult.payload);
        retrievalQuery = suggestionResult.payload.retrieval_query;
        fallbackPayload = suggestionResult.fallbackPayload;
      } else if (request.userMessage) {
        intentResult = await this.intentParser.parse(request.userMessage, {
          rn: request.rn,
          target: request.target,
          screenContext: request.screenContext,
        });
      } else {
        const resp = this.fallback.forUnsupportedIntent();
        return this.buildResponse(requestId, resp);
      }

      // 2. Handle unsupported intent
      if (intentResult.intent === 'unsupported') {
        const resp = this.fallback.forUnsupportedIntent();
        await this.logRequest(
          requestId,
          request,
          intentResult,
          [],
          [],
          'unsupported_intent',
          Date.now() - start,
          true,
        );
        return this.buildResponse(requestId, resp);
      }

      // 3. Build shortlist
      const { candidates: shortlist, categoryLabel } = await this.shortlistBuilder.buildWithContext(
        intentResult,
        request.rn,
        request.br,
        request.target,
        retrievalQuery,
      );

      if (shortlist.length === 0) {
        const resp = request.suggestionId
          ? this.fallback.forSuggestionEmpty(fallbackPayload)
          : this.fallback.forEmptyResult(intentResult.slots, categoryLabel);
        await this.logRequest(
          requestId,
          request,
          intentResult,
          [],
          [],
          'empty_result',
          Date.now() - start,
          true,
        );
        return this.buildResponse(requestId, resp);
      }

      const shortlistIds = shortlist.map((c) => c.product_id);

      // 4. LLM rerank
      let llmResult;
      const maxCards = this.config.get<number>('MAX_CARDS_IN_RESPONSE') ?? 5;
      const llmTimeout = this.config.get<number>('LLM_TIMEOUT_MS') ?? 6000;

      try {
        llmResult = await Promise.race([
          this.llmProvider.rerankAndAnswer({
            user_request: request.userMessage ?? retrievalQuery ?? '',
            constraints: intentResult.slots,
            candidates: shortlist,
            max_cards: maxCards,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('LLM timeout')), llmTimeout),
          ),
        ]);
      } catch (err) {
        this.logger.warn(`LLM failed: ${err}. Using fallback.`);
        const resp = this.fallback.forLLMTimeout(shortlist);
        await this.logRequest(
          requestId,
          request,
          intentResult,
          shortlistIds,
          [],
          'llm_timeout',
          Date.now() - start,
          true,
        );
        return this.buildResponse(requestId, resp);
      }

      // 5. Validate
      const validationResult = await this.validator.validate(llmResult, {
        rn: request.rn,
        br: request.br,
        target: request.target,
        slots: intentResult.slots,
        shortlistIds,
        maxCards,
      });

      if (!validationResult.valid && validationResult.sanitized.selected.length === 0) {
        const resp = this.fallback.forInvalidResponse();
        await this.logRequest(
          requestId,
          request,
          intentResult,
          shortlistIds,
          [],
          'validation_all_failed',
          Date.now() - start,
          true,
        );
        return this.buildResponse(requestId, resp);
      }

      const sanitized = validationResult.sanitized;
      const selectedIds = sanitized.selected.map((s) => s.product_id);

      // 6. Build product cards from validated selection + DB hydration
      const cards = await this.buildCards(
        sanitized.selected,
        request.rn,
        request.br,
        request.target,
      );

      // 7. Log
      await this.logRequest(
        requestId,
        request,
        intentResult,
        shortlistIds,
        selectedIds,
        validationResult.valid ? 'valid' : 'partially_valid',
        Date.now() - start,
        false,
      );

      return {
        request_id: requestId,
        reply_text: sanitized.reply_text,
        cards,
        quick_replies: sanitized.quick_replies ?? [],
        actions: cards.length
          ? [{ type: 'show_products', product_ids: cards.map((c) => c.product_id) }]
          : [],
        need_clarification: sanitized.need_clarification ?? false,
        clarification_question: sanitized.clarification_question ?? null,
      };
    } catch (err) {
      this.logger.error(`Orchestrator error: ${err}`);
      const resp = this.fallback.forInvalidResponse();
      await this.logRequest(
        requestId,
        request,
        null,
        [],
        [],
        'orchestrator_error',
        Date.now() - start,
        true,
      ).catch(() => {});
      return this.buildResponse(requestId, resp);
    }
  }

  private async loadSuggestion(suggestionId: string, rn: string, br: string, target: string) {
    const [suggestion] = await this.db
      .select()
      .from(assistantSuggestions)
      .where(eq(assistantSuggestions.id, suggestionId))
      .limit(1);

    if (!suggestion || !suggestion.enabled) return null;

    // Check target
    if (suggestion.target !== target) return null;

    // Check allowed_br
    const allowedBr = suggestion.allowedBr as string[] | null;
    if (allowedBr?.length && !allowedBr.includes(br)) return null;

    // Check period
    const now = new Date();
    if (suggestion.activeFrom && suggestion.activeFrom > now) return null;
    if (suggestion.activeTo && suggestion.activeTo < now) return null;

    return suggestion;
  }

  private async buildCards(
    selected: Array<{ product_id: string; reason: string }>,
    rn: string,
    br: string,
    target: string,
  ) {
    await import('../../catalog/services/catalog.service'); // ensure module is loaded
    // Hydrate from DB via catalog
    const cards = await Promise.all(
      selected.map(async (s) => {
        try {
          const { products, cityProducts } = await import('../../../database/schema');
          const { eq, and } = await import('drizzle-orm');

          const rows = await this.db
            .select()
            .from(cityProducts)
            .innerJoin(products, eq(cityProducts.productId, products.id))
            .where(
              and(
                eq(products.id, s.product_id),
                eq(cityProducts.rn, rn),
                eq(cityProducts.br, br),
                eq(cityProducts.target, target),
              ),
            )
            .limit(1);

          if (!rows.length) return null;
          const row = rows[0];

          return {
            product_id: row.products.id,
            name: row.products.name,
            price: parseFloat(String(row.city_products.price)) || 0,
            currency: row.city_products.currency ?? 'RUB',
            image_url: row.products.imageUrl ?? undefined,
            reason: s.reason,
            ui_action: 'show_product_card',
          };
        } catch {
          return null;
        }
      }),
    );

    return cards.filter(Boolean) as NonNullable<(typeof cards)[number]>[];
  }

  private buildEmptyStatusResponse(requestId: string): AssistantResponse {
    return {
      request_id: requestId,
      reply_text: '',
      cards: [],
      quick_replies: [],
      actions: [],
      need_clarification: false,
      clarification_question: null,
    };
  }

  private buildResponse(requestId: string, fallbackResp: any): AssistantResponse {
    return {
      request_id: requestId,
      reply_text: fallbackResp.reply_text,
      cards: fallbackResp.cards ?? [],
      quick_replies: fallbackResp.quick_replies ?? [],
      actions: fallbackResp.actions ?? [],
      need_clarification: fallbackResp.need_clarification ?? false,
      clarification_question: fallbackResp.clarification_question ?? null,
    };
  }

  private async logRequest(
    requestId: string,
    request: AssistantRequest,
    intentResult: IntentResult | null,
    retrievedIds: string[],
    selectedIds: string[],
    validationStatus: string,
    latencyMs: number,
    fallbackUsed: boolean,
  ): Promise<void> {
    try {
      await this.db.insert(aiLogs).values({
        requestId,
        sessionId: request.sessionId ?? null,
        rn: request.rn,
        br: request.br,
        target: request.target,
        userMessage: request.userMessage ?? null,
        intent: intentResult?.intent ?? null,
        slots: intentResult?.slots ?? null,
        suggestionId: request.suggestionId ?? null,
        retrievedProductIds: retrievedIds,
        selectedProductIds: selectedIds,
        validationStatus,
        fallbackUsed,
        latencyMs,
        createdAt: new Date(),
      });
    } catch (err) {
      this.logger.warn(`Failed to log request: ${err}`);
    }
  }
}
