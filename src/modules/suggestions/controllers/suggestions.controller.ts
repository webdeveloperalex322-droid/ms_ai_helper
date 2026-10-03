import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { SuggestionService } from '../services/suggestion.service';
import { SCREEN_CONTEXTS } from '../services/suggestion-context';

class SuggestionsQueryDto {
  @ApiProperty({ example: 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A' })
  @IsString()
  rn: string;

  @ApiProperty()
  @IsString()
  br: string;

  @ApiProperty({ required: false, default: 'WEB' })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiProperty({
    required: false,
    enum: SCREEN_CONTEXTS,
    default: 'catalog',
    description: 'Screen the set is for. An unknown value is treated as the catalogue',
  })
  @IsOptional()
  @IsString()
  screen_context?: string;

  @ApiProperty({
    required: false,
    maxLength: 128,
    description:
      'Visit identifier. The same value returns the same set; different values rotate it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  session_id?: string;
}

@ApiTags('suggestions')
@SkipThrottle({ costly: true })
@Controller('assistant/suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionService: SuggestionService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the set of preset suggestions for a city screen',
    description:
      'Returns a short set (MAX_SUGGESTIONS_ON_SCREEN, 6 by default) mixing product and service suggestions, not the whole catalogue.',
  })
  async getSuggestions(@Query() query: SuggestionsQueryDto) {
    const suggestions = await this.suggestionService.getActiveSuggestions(
      query.rn,
      query.br,
      query.target ?? 'WEB',
      query.screen_context ?? 'catalog',
      { sessionId: query.session_id },
    );

    return { suggestions };
  }
}
