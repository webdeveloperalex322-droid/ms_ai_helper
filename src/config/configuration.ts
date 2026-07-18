import { z } from 'zod';

/**
 * One entry of the client access key list, parsed from CLIENT_API_KEYS.
 * `label` identifies the consumer in logs and rate-limit counters; `key` is never logged.
 */
export interface ClientApiKeyEntry {
  label: string;
  key: string;
}

const LABEL_PATTERN = /^[a-z0-9_-]{1,32}$/;

/**
 * Parses `label:key` pairs separated by commas.
 * Blank entries are skipped; malformed entries fail by position, never by content,
 * so a bad value can't leak into the error message.
 */
export function parseClientApiKeys(raw: string): ClientApiKeyEntry[] {
  const entries: ClientApiKeyEntry[] = [];

  raw.split(',').forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (trimmed === '') return;

    const separatorAt = trimmed.indexOf(':');
    if (separatorAt === -1) {
      throw new Error(`CLIENT_API_KEYS: entry #${index + 1} is missing the "label:key" separator`);
    }

    const label = trimmed.slice(0, separatorAt).trim();
    const key = trimmed.slice(separatorAt + 1).trim();

    if (label === '') {
      throw new Error(`CLIENT_API_KEYS: entry #${index + 1} has an empty label`);
    }
    if (!LABEL_PATTERN.test(label)) {
      throw new Error(
        `CLIENT_API_KEYS: entry #${index + 1} has a label outside the allowed alphabet [a-z0-9_-], max 32 chars`,
      );
    }
    if (key === '') {
      throw new Error(`CLIENT_API_KEYS: entry #${index + 1} has an empty key`);
    }

    entries.push({ label, key });
  });

  return entries;
}

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

  // Access control (spec 007). Defaults keep development and tests working.
  // Production must reject these very values as placeholders — that check is
  // still to be added (US3); until then a production deploy can boot on them.
  CLIENT_API_KEYS: z.string().default('dev-client:dev-client-key-change-in-prod'),
  ACCESS_CONTROL_MODE: z.enum(['enforce', 'observe']).default('enforce'),
  TRUST_PROXY: z.coerce.boolean().default(false),
  BODY_LIMIT_BYTES: z.coerce.number().default(1_048_576),

  // Rate limiting. The spec deliberately does not fix these numbers (FR-013):
  // they get tuned against real traffic after rollout. Defaults are set low on
  // purpose — a too-tight limit shows up in the logs, a too-loose one shows up
  // on the invoice.
  THROTTLE_COSTLY_LIMIT: z.coerce.number().default(10),
  THROTTLE_COSTLY_TTL_SEC: z.coerce.number().default(60),
  THROTTLE_STANDARD_LIMIT: z.coerce.number().default(60),
  THROTTLE_STANDARD_TTL_SEC: z.coerce.number().default(60),

  ADMIN_USER: z.string().email().optional().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().min(8).optional().default('changeme123'),
  ADMIN_COOKIE_SECRET: z
    .string()
    .min(32)
    .optional()
    .default('dev-cookie-secret-replace-in-prod-!!!'),
});

/**
 * `clientApiKeys` is derived from CLIENT_API_KEYS at load time so consumers
 * read a parsed list instead of re-splitting the raw string.
 */
export type AppConfig = z.infer<typeof configSchema> & {
  clientApiKeys: ClientApiKeyEntry[];
};

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration validation error: ${errors}`);
  }

  const data = result.data;
  if (data.LLM_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    throw new Error(
      'Configuration validation error: OPENAI_API_KEY is required when LLM_PROVIDER=openai',
    );
  }
  if (data.EMBEDDING_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    throw new Error(
      'Configuration validation error: OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai',
    );
  }

  const clientApiKeys = parseClientApiKeys(data.CLIENT_API_KEYS);
  if (clientApiKeys.length === 0) {
    throw new Error(
      'Configuration validation error: CLIENT_API_KEYS must contain at least one key',
    );
  }

  return { ...data, clientApiKeys };
}

export default (): AppConfig => {
  return validateConfig(process.env as Record<string, unknown>);
};
