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
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InternalRoute } from '../../../common/security/access-scope.decorator';
import { SuggestionAdminService } from '../services/suggestion-admin.service';
import { CreateSuggestionDto } from '../dto/create-suggestion.dto';
import { UpdateSuggestionDto } from '../dto/update-suggestion.dto';

@ApiTags('admin')
@Controller('internal/assistant/suggestions')
export class SuggestionAdminController {
  // Explicit @Inject: design:paramtypes metadata is emitted by tsc but not
  // by the test runner's transform, so type-only injection resolves at
  // runtime and silently fails under test (see access-key.registry.ts).
  constructor(
    @Inject(SuggestionAdminService) private readonly suggestionAdminService: SuggestionAdminService,
  ) {}

  @InternalRoute()
  @Get()
  @ApiOperation({ summary: 'List all suggestions for a retail network' })
  async findAll(@Query('rn') rn: string) {
    return this.suggestionAdminService.findAll(rn);
  }

  @InternalRoute()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new suggestion' })
  async create(@Body() body: CreateSuggestionDto) {
    return this.suggestionAdminService.create(body);
  }

  @InternalRoute()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a suggestion' })
  async update(@Param('id') id: string, @Body() body: UpdateSuggestionDto) {
    return this.suggestionAdminService.update(id, body);
  }
}
