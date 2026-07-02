import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { CityImportService } from '../services/city-import.service';
import { ProductImportService } from '../services/product-import.service';
import { CategoryImportService } from '../services/category-import.service';

class ImportCitiesDto {
  @IsString()
  rn: string;

  @IsOptional()
  dry_run?: boolean;
}

class ImportProductsDto {
  @IsString()
  rn: string;

  @IsOptional()
  @IsString()
  br?: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsEnum(['full', 'incremental', 'dry-run'])
  mode?: 'full' | 'incremental' | 'dry-run';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}

class ImportCategoriesDto {
  @IsString()
  rn: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsString()
  slug?: string;
}

class ImportByIdsDto {
  @IsString()
  rn: string;

  @IsString()
  br: string;

  @IsOptional()
  @IsString()
  target?: string;

  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

@ApiTags('import')
@Controller('v1/import')
export class ImportController {
  constructor(
    private readonly cityImportService: CityImportService,
    private readonly productImportService: ProductImportService,
    private readonly categoryImportService: CategoryImportService,
  ) {}

  @Post('cities')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import cities for a retail network' })
  async importCities(@Body() body: ImportCitiesDto) {
    const result = await this.cityImportService.importCities(body.rn, body.dry_run ?? false);
    return {
      job_id: result.jobId,
      status: result.dryRun ? 'dry-run' : 'completed',
      stats: { imported: result.imported, errors: result.errors },
    };
  }

  @Post('products')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import products for a retail network / city' })
  async importProducts(@Body() body: ImportProductsDto) {
    const result = await this.productImportService.importProducts({
      rn: body.rn,
      br: body.br,
      target: body.target ?? 'WEB',
      mode: body.mode ?? 'full',
      categoryIds: body.categoryIds,
    });
    return { job_id: result.jobId, status: body.mode === 'dry-run' ? 'dry-run' : 'completed' };
  }

  @Post('categories')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import categories for a retail network / city' })
  async importCategories(@Body() body: ImportCategoriesDto) {
    const result = await this.categoryImportService.importCategories({
      rn: body.rn,
      target: body.target ?? 'WEB',
      slug: body.slug,
    });
    return {
      job_id: result.jobId,
      status: 'completed',
      stats: { imported: result.imported, errors: result.errors, cities: result.cities },
    };
  }

  @Post('products/by-ids')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import specific products by IDs' })
  async importByIds(@Body() body: ImportByIdsDto) {
    const result = await this.productImportService.importProducts({
      rn: body.rn,
      br: body.br,
      target: body.target ?? 'WEB',
      mode: 'incremental',
      ids: body.ids,
    });
    return { job_id: result.jobId, status: 'completed' };
  }
}
