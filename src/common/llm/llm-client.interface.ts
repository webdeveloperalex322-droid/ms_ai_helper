export const LLM_CLIENT_TOKEN = 'LLM_CLIENT';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatTextContent {
  type: 'text';
  text: string;
}

export interface ChatImageContent {
  type: 'image_url';
  image_url: { url: string };
}

export type ChatContentPart = ChatTextContent | ChatImageContent;

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage?: ChatCompletionUsage;
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
}

export interface BalanceResult {
  balance: number;
  currency: string;
}

export type LlmErrorCode =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'CONNECTION'
  | 'API'
  | 'INVALID_RESPONSE';

export class LlmClientError extends Error {
  constructor(
    message: string,
    readonly code: LlmErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmClientError';
  }
}

/**
 * Low-level client for LLM requests via AITunnel (OpenAI-compatible API).
 * @see https://docs.aitunnel.ru/guides/python-openai-sdk.html
 */
export interface LlmClient {
  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
  chatCompletionStream(options: ChatCompletionOptions): AsyncIterable<string>;
  createEmbeddings(input: string | string[], model?: string): Promise<EmbeddingResult>;
  getBalance(): Promise<BalanceResult>;
}
