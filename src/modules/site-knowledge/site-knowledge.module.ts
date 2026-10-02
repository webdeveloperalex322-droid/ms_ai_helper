import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { HtmlTextExtractor } from './crawler/html-text-extractor';
import { SitePageIndexerService } from './services/site-page-indexer.service';
import { SitePageImportService } from './services/site-page-import.service';
import { SiteKnowledgeSearchService } from './services/site-knowledge-search.service';

/**
 * Knowledge collected from the informational pages of the city sites
 * (delivery terms, bonuses, promotions, restaurants, legal documents).
 * Imports RagModule for the shared embedding provider; exports the search
 * service the assistant uses to answer service questions.
 */
@Module({
  imports: [RagModule],
  providers: [
    HtmlTextExtractor,
    SitePageIndexerService,
    SitePageImportService,
    SiteKnowledgeSearchService,
  ],
  exports: [SitePageImportService, SiteKnowledgeSearchService],
})
export class SiteKnowledgeModule {}
