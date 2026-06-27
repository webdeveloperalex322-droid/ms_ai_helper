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
});

export type AppConfig = z.infer<typeof configSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration validation error: ${errors}`);
  }
  return result.data;
}

export default (): AppConfig => {
  return validateConfig(process.env as Record<string, unknown>);
};
