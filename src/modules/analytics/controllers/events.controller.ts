import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { AnalyticsService } from '../services/analytics.service';

class RecordEventDto {
  @IsOptional()
  @IsString()
  request_id?: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsString()
  rn: string;

  @IsOptional()
  @IsString()
  br?: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsString()
  event_type: string;

  @IsOptional()
  @IsString()
  suggestion_id?: string;

  @IsOptional()
  @IsString()
  product_id?: string;
}

@ApiTags('analytics')
@SkipThrottle({ costly: true })
@Controller('assistant/events')
export class EventsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a UI analytics event' })
  async recordEvent(@Body() body: RecordEventDto) {
    this.analyticsService
      .recordEvent({
        requestId: body.request_id,
        sessionId: body.session_id,
        rn: body.rn,
        br: body.br,
        target: body.target ?? 'WEB',
        eventType: body.event_type,
        suggestionId: body.suggestion_id,
        metadata: body.product_id ? { product_id: body.product_id } : undefined,
      })
      .catch(() => {});

    return { status: 'ok' };
  }
}
