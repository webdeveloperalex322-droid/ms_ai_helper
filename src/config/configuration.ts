import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('v1'),

  DATABASE_URL: z.string().url(),

  CATALOG_API_BASE_URL: z.string().url().default('https://venus-api-catalog2.apps-web.net'),
  CITIES_API_BASE_URL: z.string().url().default('https://venus-api-backend2.apps-web.net'),
  CATALOG_API_MODE: z.enum(['mock', 'real']).default('mock'),

  LLM_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.aitunnel.ru/v1/'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_MAX_TOKENS: z.coerce.number().default(1500),

  EMBEDDING_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  DEFAULT_RN: z.string().default('A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A'),
  MAX_CANDIDATES_FOR_LLM: z.coerce.number().default(30),
  MAX_CARDS_IN_RESPONSE: z.coerce.number().default(5),
  LLM_TIMEOUT_MS: z.coerce.number().default(6000),
  SESSION_TTL_MINUTES: z.coerce.number().default(60),

  MAX_SUGGESTIONS_ON_SCREEN: z.coerce.number().default(8),
  HIDE_EMPTY_SUGGESTIONS: z.coerce.boolean().default(true),

  INTERNAL_API_KEY: z.string().default('dev-internal-key-change-in-prod'),

  ADMIN_USER: z.string().email().optional().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).optional().default('changeme123'),
  ADMIN_COOKIE_SECRET: z.string().min(32).optional().default('dev-cookie-secret-replace-in-prod-!!!'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration validation error: ${errors}`);
  }

  const data = result.data;
  if (data.LLM_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    throw new Error('Configuration validation error: OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }
  if (data.EMBEDDING_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    throw new Error(
      'Configuration validation error: OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai',
    );
  }

  return data;
}

export default (): AppConfig => {
  return validateConfig(process.env as Record<string, unknown>);
};
