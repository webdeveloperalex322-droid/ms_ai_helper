import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ImportController } from './controllers/import.controller';
import { CityImportService } from './services/city-import.service';
import { ProductImportService } from './services/product-import.service';
import { CategoryImportService } from './services/category-import.service';
import { ProductNormalizerService } from './services/product-normalizer.service';
import { ImportJobService } from './services/import-job.service';
import { CatalogApiMockClient } from './clients/catalog-api-mock.client';
import { CatalogApiHttpClient } from './clients/catalog-api-http.client';
import { CATALOG_API_CLIENT_TOKEN } from './clients/catalog-api.client.interface';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [HttpModule],
  controllers: [ImportController],
  providers: [
    {
      provide: CATALOG_API_CLIENT_TOKEN,
      inject: [ConfigService, CatalogApiMockClient, CatalogApiHttpClient],
      useFactory: (
        config: ConfigService,
        mock: CatalogApiMockClient,
        http: CatalogApiHttpClient,
      ) => {
        return config.get('CATALOG_API_MODE') === 'real' ? http : mock;
      },
    },
    CatalogApiMockClient,
    CatalogApiHttpClient,
    CityImportService,
    ProductImportService,
    CategoryImportService,
    ProductNormalizerService,
    ImportJobService,
  ],
  exports: [CityImportService, ProductImportService, CategoryImportService],
})
export class CatalogImportModule {}
