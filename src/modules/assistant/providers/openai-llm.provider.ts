import { Injectable, Logger } from '@nestjs/common';
import {
  LLMProvider,
  IntentParseInput,
  IntentResult,
  RerankerInput,
  LLMRerankerResult,
} from './llm.provider.interface';

@Injectable()
export class OpenAILLMProvider implements LLMProvider {
  private readonly logger = new Logger(OpenAILLMProvider.name);

  async parseIntent(_input: IntentParseInput): Promise<IntentResult> {
    this.logger.warn('OpenAI LLM provider not configured in this prototype');
    throw new Error('OpenAI LLM provider not implemented');
  }

  async rerankAndAnswer(_input: RerankerInput): Promise<LLMRerankerResult> {
    throw new Error('OpenAI LLM provider not implemented');
  }
}
