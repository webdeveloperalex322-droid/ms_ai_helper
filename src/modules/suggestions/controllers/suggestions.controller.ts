import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { SuggestionService } from '../services/suggestion.service';

class SuggestionsQueryDto {
  @IsString()
  rn: string;

  @IsString()
  br: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  screen_context?: string;
}

@ApiTags('suggestions')
@SkipThrottle({ costly: true })
@Controller('assistant/suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionService: SuggestionService) {}

  @Get()
  @ApiOperation({ summary: 'Get active preset suggestions for a city and screen context' })
  async getSuggestions(@Query() query: SuggestionsQueryDto) {
    const suggestions = await this.suggestionService.getActiveSuggestions(
      query.rn,
      query.br,
      query.target ?? 'WEB',
      query.screen_context ?? 'catalog',
    );

    return { suggestions };
  }
}
