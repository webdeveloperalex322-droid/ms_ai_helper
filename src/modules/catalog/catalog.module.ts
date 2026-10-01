import { Module } from '@nestjs/common';
import { CatalogService } from './services/catalog.service';
import { ProductLookupService } from './services/product-lookup.service';
import { CategoryResolverService } from './services/category-resolver.service';

@Module({
  providers: [CatalogService, ProductLookupService, CategoryResolverService],
  exports: [CatalogService, ProductLookupService, CategoryResolverService],
})
export class CatalogModule {}
