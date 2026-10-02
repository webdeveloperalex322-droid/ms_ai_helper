import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SiteKnowledgeSearchService,
  type KnowledgePassage,
} from '../../site-knowledge/services/site-knowledge-search.service';
import {
  LLM_PROVIDER_TOKEN,
  LLMProvider,
  type KnowledgeAnswerResult,
} from '../providers/llm.provider.interface';
import { ResponseValidatorService } from './response-validator.service';
import {
  FallbackService,
  INFO_QUICK_REPLIES,
  openUrlAction,
  type InfoSource,
} from './fallback.service';

export interface InfoAnswerRequest {
  question: string;
  rn: string;
  br: string;
  target: string;
}

export type InfoAnswerKind = 'answer' | 'not_found' | 'empty' | 'timeout';

export interface InfoAnswerResult {
  kind: InfoAnswerKind;
  reply_text: string;
  quick_replies: string[];
  actions: Array<{ type: string; url: string; title: string }>;
  /** Page of the best fragment the answer relied on. */
  source?: InfoSource;
  /** Urls of every page the answer relied on, deduplicated. */
  sources: string[];
}

export const INFO_TOP_K = 8;

/**
 * Answers a service question (delivery, payment, bonuses, promotions,
 * restaurants, company) from the site knowledge base: hybrid search for the
 * city's page fragments, then a grounded LLM answer raced against
 * LLM_TIMEOUT_MS. Every failure mode maps to a usable reply (ADR-005).
 */
@Injectable()
export class InfoAnswerService {
  private readonly logger = new Logger(InfoAnswerService.name);

  constructor(
    private readonly search: SiteKnowledgeSearchService,
    @Inject(LLM_PROVIDER_TOKEN) private readonly llmProvider: LLMProvider,
    private readonly validator: ResponseValidatorService,
    private readonly fallback: FallbackService,
    private readonly config: ConfigService,
  ) {}

  async answer(request: InfoAnswerRequest): Promise<InfoAnswerResult> {
    const passages = await this.search
      .search({ query: request.question, rn: request.rn, br: request.br, topK: INFO_TOP_K })
      .catch((err) => {
        this.logger.warn(`Knowledge search failed: ${err}`);
        return [] as KnowledgePassage[];
      });

    if (passages.length === 0) {
      return { kind: 'empty', reply_text: '', quick_replies: [], actions: [], sources: [] };
    }

    const best = passages[0];
    const timeoutMs = this.config.get<number>('LLM_TIMEOUT_MS') ?? 6000;

    let result: KnowledgeAnswerResult;
    try {
      result = await Promise.race([
        this.llmProvider.answerFromKnowledge({
          question: request.question,
          passages: passages.map((p) => ({
            id: p.chunkId,
            title: p.title,
            heading: p.heading,
            url: p.url,
            text: p.text,
          })),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), timeoutMs),
        ),
      ]);
    } catch (err) {
      this.logger.warn(`Knowledge answer failed: ${err}. Quoting the best fragment.`);
      const fb = this.fallback.forInfoTimeout({
        url: best.url,
        title: best.title,
        text: best.text,
      });
      return {
        kind: 'timeout',
        reply_text: fb.reply_text,
        quick_replies: fb.quick_replies,
        actions: fb.actions,
        source: { url: best.url, title: best.title },
        sources: [best.url],
      };
    }

    const byId = new Map(passages.map((p) => [p.chunkId, p]));
    const used = result.used_passage_ids
      .map((id) => byId.get(id))
      .filter((p): p is KnowledgePassage => !!p);
    const primary = used[0] ?? best;
    const source: InfoSource = { url: primary.url, title: primary.title };
    const sources = Array.from(new Set<string>((used.length ? used : [best]).map((p) => p.url)));
    const quickReplies = result.quick_replies?.length ? result.quick_replies : INFO_QUICK_REPLIES;

    if (result.not_found) {
      const fb = this.fallback.forInfoNotFound(source);
      const text = result.answer_text?.trim();
      return {
        kind: 'not_found',
        reply_text: text ? this.validator.sanitizeFreeText(text) : fb.reply_text,
        quick_replies: quickReplies,
        actions: fb.actions,
        source,
        sources,
      };
    }

    return {
      kind: 'answer',
      reply_text: this.validator.sanitizeFreeText(result.answer_text),
      quick_replies: quickReplies,
      actions: [openUrlAction(source)],
      source,
      sources,
    };
  }
}
