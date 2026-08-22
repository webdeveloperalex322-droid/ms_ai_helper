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

/**
 * Values that must never survive into production, keyed by variable name.
 * Includes both current zod defaults and placeholders that have been found
 * checked into env files in this repository — a schema default alone would
 * miss the latter (spec 008, research R2).
 */
const PRODUCTION_PLACEHOLDERS: Record<string, string[]> = {
  INTERNAL_API_KEY: ['dev-internal-key-change-in-prod', 'change-this-in-production'],
  ADMIN_USER: ['admin@example.com'],
  ADMIN_PASSWORD: ['changeme123'],
  ADMIN_COOKIE_SECRET: [
    'dev-cookie-secret-replace-in-prod-!!!',
    'replace-with-at-least-32-char-random-secret-here',
  ],
};

const CLIENT_API_KEY_PLACEHOLDERS = ['dev-client-key-change-in-prod'];

/** Machine-generated secrets need 32 chars; the human-entered admin password needs 12. */
const PRODUCTION_MIN_LENGTH: Record<string, number> = {
  INTERNAL_API_KEY: 32,
  ADMIN_PASSWORD: 12,
  ADMIN_COOKIE_SECRET: 32,
};

const CLIENT_API_KEY_MIN_LENGTH = 32;

/**
 * Checks one scalar secret against the production rules, in priority order:
 * missing beats placeholder beats too-short, so each variable contributes at
 * most one violation. `rawConfig` (pre-zod-default) is what tells "not set"
 * apart from "explicitly set to the same string as the default".
 */
function checkProductionSecret(
  varName: string,
  parsedValue: string,
  rawConfig: Record<string, unknown>,
  violations: string[],
): void {
  const raw = rawConfig[varName];
  if (raw === undefined || raw === null || raw === '') {
    violations.push(`${varName} is not set`);
    return;
  }

  const placeholders = PRODUCTION_PLACEHOLDERS[varName] ?? [];
  if (placeholders.includes(parsedValue)) {
    violations.push(`${varName} matches a known placeholder value`);
    return;
  }

  const minLength = PRODUCTION_MIN_LENGTH[varName];
  if (minLength !== undefined && parsedValue.length < minLength) {
    violations.push(`${varName} is shorter than the required minimum length`);
  }
}

function checkProductionClientApiKeys(
  clientApiKeys: ClientApiKeyEntry[],
  violations: string[],
): void {
  const seenLabels = new Map<string, number>();
  const seenKeys = new Map<string, number>();

  clientApiKeys.forEach((entry, index) => {
    if (CLIENT_API_KEY_PLACEHOLDERS.includes(entry.key)) {
      violations.push(`CLIENT_API_KEYS: entry #${index + 1} matches a known placeholder value`);
    } else if (entry.key.length < CLIENT_API_KEY_MIN_LENGTH) {
      violations.push(
        `CLIENT_API_KEYS: entry #${index + 1} is shorter than the required minimum length`,
      );
    }

    const labelAt = seenLabels.get(entry.label);
    if (labelAt !== undefined) {
      violations.push(
        `CLIENT_API_KEYS: entries #${labelAt + 1} and #${index + 1} share the same label`,
      );
    } else {
      seenLabels.set(entry.label, index);
    }

    const keyAt = seenKeys.get(entry.key);
    if (keyAt !== undefined) {
      violations.push(
        `CLIENT_API_KEYS: entries #${keyAt + 1} and #${index + 1} share the same key value`,
      );
    } else {
      seenKeys.set(entry.key, index);
    }
  });
}

function collectProductionViolations(
  data: Record<string, unknown>,
  rawConfig: Record<string, unknown>,
  clientApiKeys: ClientApiKeyEntry[],
  corsAllowedOrigins: string[],
): string[] {
  const violations: string[] = [];

  for (const varName of Object.keys(PRODUCTION_MIN_LENGTH).concat(['ADMIN_USER'])) {
    checkProductionSecret(varName, String(data[varName] ?? ''), rawConfig, violations);
  }

  checkProductionClientApiKeys(clientApiKeys, violations);

  if (corsAllowedOrigins.length === 0) {
    violations.push('CORS_ALLOWED_ORIGINS must list at least one origin in production');
  }

  return violations;
}

/**
 * Parses CORS_ALLOWED_ORIGINS into a normalized origin list: trims whitespace,
 * drops empty entries, strips a trailing slash, lower-cases scheme+host — so
 * `HTTPS://Shop.example.com/` and `https://shop.example.com` compare equal.
 */
export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => entry.replace(/\/$/, '').toLowerCase());
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

  // Access control (spec 007). Defaults keep development and tests working;
  // production rejects these same values as placeholders (spec 008, see
  // collectProductionViolations below).
  CLIENT_API_KEYS: z.string().default('dev-client:dev-client-key-change-in-prod'),
  ACCESS_CONTROL_MODE: z.enum(['enforce', 'observe']).default('enforce'),
  // Empty by default: development and the standalone test client rely on
  // enableCors() allowing every origin. Production rejects an empty list —
  // see collectProductionViolations.
  CORS_ALLOWED_ORIGINS: z.string().default(''),
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

  // Minimum length for these three is a production-only rule (spec 008,
  // FR-003) enforced in collectProductionViolations, not here: a schema-level
  // .min() would reject a too-short value before it ever reached that check,
  // and in development a short value must still be allowed through.
  ADMIN_USER: z.string().email().optional().default('admin@example.com'),
  ADMIN_PASSWORD: z.string().optional().default('changeme123'),
  ADMIN_COOKIE_SECRET: z.string().optional().default('dev-cookie-secret-replace-in-prod-!!!'),
});

/**
 * `clientApiKeys` is derived from CLIENT_API_KEYS at load time so consumers
 * read a parsed list instead of re-splitting the raw string.
 */
export type AppConfig = z.infer<typeof configSchema> & {
  clientApiKeys: ClientApiKeyEntry[];
  corsAllowedOrigins: string[];
};

/**
 * All violations are collected before throwing — a production deploy with
 * several bad secrets at once must be told about all of them, not just the
 * first one found (spec 008, FR-005).
 */
export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration validation error: ${errors}`);
  }

  const data = result.data;
  const violations: string[] = [];

  if (data.LLM_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    violations.push('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }
  if (data.EMBEDDING_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
    violations.push('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
  }

  let clientApiKeys: ClientApiKeyEntry[] = [];
  try {
    clientApiKeys = parseClientApiKeys(data.CLIENT_API_KEYS);
    if (clientApiKeys.length === 0) {
      violations.push('CLIENT_API_KEYS must contain at least one key');
    }
  } catch (err) {
    violations.push((err as Error).message);
  }

  const corsAllowedOrigins = parseCorsOrigins(data.CORS_ALLOWED_ORIGINS);

  if (data.NODE_ENV === 'production') {
    violations.push(
      ...collectProductionViolations(data, config, clientApiKeys, corsAllowedOrigins),
    );
  }

  if (violations.length > 0) {
    throw new Error(`Configuration validation error: ${violations.join('; ')}`);
  }

  return { ...data, clientApiKeys, corsAllowedOrigins };
}

export default (): AppConfig => {
  return validateConfig(process.env as Record<string, unknown>);
};
