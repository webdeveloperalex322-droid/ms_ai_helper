import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { SuggestionAdminService } from '../services/suggestion-admin.service';

@ApiTags('admin')
@Controller('internal/assistant/suggestions')
export class SuggestionAdminController {
  constructor(
    private readonly suggestionAdminService: SuggestionAdminService,
    private readonly config: ConfigService,
  ) {}

  private checkAuth(apiKey: string | undefined): void {
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    if (apiKey !== expected) {
      throw new UnauthorizedException('Invalid internal API key');
    }
  }

  @Get()
  @ApiOperation({ summary: 'List all suggestions for a retail network' })
  async findAll(@Query('rn') rn: string, @Headers('x-internal-api-key') apiKey: string) {
    this.checkAuth(apiKey);
    return this.suggestionAdminService.findAll(rn);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new suggestion' })
  async create(@Body() body: any, @Headers('x-internal-api-key') apiKey: string) {
    this.checkAuth(apiKey);
    return this.suggestionAdminService.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a suggestion' })
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-internal-api-key') apiKey: string,
  ) {
    this.checkAuth(apiKey);
    return this.suggestionAdminService.update(id, body);
  }
}
