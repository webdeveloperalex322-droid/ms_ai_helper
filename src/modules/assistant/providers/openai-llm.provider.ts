import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLMProvider,
  IntentParseInput,
  IntentResult,
  RerankerInput,
  LLMRerankerResult,
} from './llm.provider.interface';
import {
  LLM_CLIENT_TOKEN,
  LlmClient,
  LlmClientError,
} from '../../../common/llm/llm-client.interface';
import { buildIntentParseMessages, buildRerankMessages } from '../../../common/llm/llm-prompts';
import { parseIntentResponse, parseRerankResponse } from '../../../common/llm/llm-response.parser';

@Injectable()
export class OpenAILLMProvider implements LLMProvider {
  private readonly logger = new Logger(OpenAILLMProvider.name);

  constructor(
    @Inject(LLM_CLIENT_TOKEN) private readonly llmClient: LlmClient,
    private readonly config: ConfigService,
  ) {}

  async parseIntent(input: IntentParseInput): Promise<IntentResult> {
    try {
      const response = await this.llmClient.chatCompletion({
        messages: buildIntentParseMessages(input),
        response_format: { type: 'json_object' },
        max_tokens: this.config.get<number>('LLM_MAX_TOKENS') ?? 1500,
      });

      return parseIntentResponse(response.content);
    } catch (error) {
      this.logError('parseIntent', error);
      throw error;
    }
  }

  async rerankAndAnswer(input: RerankerInput): Promise<LLMRerankerResult> {
    const maxCards = input.max_cards ?? this.config.get<number>('MAX_CARDS_IN_RESPONSE') ?? 5;

    try {
      const response = await this.llmClient.chatCompletion({
        messages: buildRerankMessages({ ...input, max_cards: maxCards }),
        response_format: { type: 'json_object' },
        max_tokens: this.config.get<number>('LLM_MAX_TOKENS') ?? 1500,
      });

      return parseRerankResponse(response.content, input.candidates, maxCards);
    } catch (error) {
      this.logError('rerankAndAnswer', error);
      throw error;
    }
  }

  private logError(operation: string, error: unknown): void {
    if (error instanceof LlmClientError) {
      this.logger.error(`${operation} failed [${error.code}]: ${error.message}`);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`${operation} failed: ${message}`);
  }
}
