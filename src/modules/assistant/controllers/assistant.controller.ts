import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AssistantOrchestratorService } from '../services/assistant-orchestrator.service';
import { ProductAnswerRequestDto } from '../dto/product-answer.request.dto';
import { ProductAnswerResponseDto } from '../dto/product-answer.response.dto';
import { FeedbackRequestDto } from '../dto/feedback.dto';
import { AnalyticsService } from '../../analytics/services/analytics.service';

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly orchestrator: AssistantOrchestratorService,
    private readonly analytics: AnalyticsService,
  ) {}

  // Every call here triggers two LLM calls plus an embedding, so it gets the
  // strict profile; the standard one is skipped to avoid double-counting.
  @Throttle({ costly: {} })
  @SkipThrottle({ standard: true })
  @Post('product-answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product recommendations or answer a product question' })
  @ApiResponse({ status: 200, type: ProductAnswerResponseDto })
  async productAnswer(@Body() body: ProductAnswerRequestDto): Promise<ProductAnswerResponseDto> {
    const response = await this.orchestrator.handle({
      sessionId: body.session_id,
      rn: body.rn,
      br: body.br,
      target: body.target ?? 'WEB',
      screenContext: body.screen_context,
      userMessage: body.user_message,
      suggestionId: body.suggestion_id,
      channel: body.channel,
    });

    // Fire-and-forget analytics
    if (body.suggestion_id) {
      this.analytics
        .recordEvent({
          suggestionId: body.suggestion_id,
          requestId: response.request_id,
          sessionId: body.session_id,
          rn: body.rn,
          br: body.br,
          target: body.target ?? 'WEB',
          eventType: response.cards.length ? 'products_returned' : 'empty_result',
          selectedProductIds: response.cards.map((c) => c.product_id),
        })
        .catch(() => {});
    }

    return response;
  }

  @SkipThrottle({ costly: true })
  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit feedback for an assistant response' })
  async feedback(@Body() body: FeedbackRequestDto) {
    await this.analytics
      .recordEvent({
        requestId: body.request_id,
        sessionId: body.session_id,
        rn: '',
        br: undefined,
        target: '',
        eventType: body.feedback === 'like' ? 'feedback_like' : 'feedback_dislike',
        metadata: { comment: body.comment },
      })
      .catch(() => {});

    return { status: 'ok' };
  }
}
