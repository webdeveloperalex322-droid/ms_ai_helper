import { Module } from '@nestjs/common';
import { CatalogService } from './services/catalog.service';
import { ProductLookupService } from './services/product-lookup.service';

@Module({
  providers: [CatalogService, ProductLookupService],
  exports: [CatalogService, ProductLookupService],
})
export class CatalogModule {}
