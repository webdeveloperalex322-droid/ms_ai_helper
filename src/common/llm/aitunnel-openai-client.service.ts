import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import OpenAI from 'openai';
import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from 'openai/error';
import {
  BalanceResult,
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatMessage,
  EmbeddingResult,
  LlmClient,
  LlmClientError,
} from './llm-client.interface';

@Injectable()
export class AitunnelOpenAIClientService implements LlmClient, OnModuleInit {
  private readonly logger = new Logger(AitunnelOpenAIClientService.name);
  private client!: OpenAI;
  private apiKey = '';
  private baseUrl = 'https://api.aitunnel.ru/v1/';
  private defaultModel = 'gpt-4o-mini';
  private defaultMaxTokens = 1500;
  private embeddingModel = 'text-embedding-3-small';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY') ?? '';
    this.baseUrl = this.config.get<string>('OPENAI_BASE_URL') ?? 'https://api.aitunnel.ru/v1/';
    this.defaultModel = this.config.get<string>('LLM_MODEL') ?? 'gpt-4o-mini';
    this.defaultMaxTokens = this.config.get<number>('LLM_MAX_TOKENS') ?? 1500;
    this.embeddingModel = this.config.get<string>('EMBEDDING_MODEL') ?? 'text-embedding-3-small';

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    this.ensureConfigured();

    try {
      const response = await this.client.chat.completions.create({
        model: options.model ?? this.defaultModel,
        messages: this.toSdkMessages(options.messages),
        max_tokens: options.max_tokens ?? this.defaultMaxTokens,
        temperature: options.temperature,
        response_format: options.response_format,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LlmClientError('Empty response from LLM', 'INVALID_RESPONSE');
      }

      return {
        content,
        model: response.model,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async *chatCompletionStream(options: ChatCompletionOptions): AsyncIterable<string> {
    this.ensureConfigured();

    try {
      const stream = await this.client.chat.completions.create({
        model: options.model ?? this.defaultModel,
        messages: this.toSdkMessages(options.messages),
        max_tokens: options.max_tokens ?? this.defaultMaxTokens,
        temperature: options.temperature,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async createEmbeddings(input: string | string[], model?: string): Promise<EmbeddingResult> {
    this.ensureConfigured();

    const texts = Array.isArray(input) ? input : [input];

    try {
      const response = await this.client.embeddings.create({
        model: model ?? this.embeddingModel,
        input: texts,
      });

      return {
        embeddings: response.data.map((item) => item.embedding),
        model: response.model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getBalance(): Promise<BalanceResult> {
    this.ensureConfigured();

    const balanceUrl = new URL('aitunnel/balance', this.baseUrl).toString();

    try {
      const response = await axios.get<{ balance: number; currency?: string }>(balanceUrl, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 5000,
      });

      return {
        balance: response.data.balance,
        currency: response.data.currency ?? 'RUB',
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new LlmClientError(
        'OPENAI_API_KEY is not configured. Set it in .env for AITunnel access.',
        'AUTHENTICATION',
      );
    }
  }

  private toSdkMessages(messages: ChatMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  }

  private mapError(error: unknown): LlmClientError {
    if (error instanceof LlmClientError) {
      return error;
    }

    if (error instanceof AuthenticationError) {
      return new LlmClientError('Invalid API key', 'AUTHENTICATION', error);
    }

    if (error instanceof RateLimitError) {
      return new LlmClientError('Rate limit exceeded', 'RATE_LIMIT', error);
    }

    if (error instanceof APIConnectionError) {
      return new LlmClientError('Connection error to LLM server', 'CONNECTION', error);
    }

    if (error instanceof APIError) {
      return new LlmClientError(error.message ?? 'API error', 'API', error);
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return new LlmClientError('Invalid API key', 'AUTHENTICATION', error);
      }
      if (status === 429) {
        return new LlmClientError('Rate limit exceeded', 'RATE_LIMIT', error);
      }
      return new LlmClientError(error.message, 'API', error);
    }

    const message = error instanceof Error ? error.message : 'Unknown LLM error';
    this.logger.error(`LLM request failed: ${message}`);
    return new LlmClientError(message, 'API', error);
  }
}
