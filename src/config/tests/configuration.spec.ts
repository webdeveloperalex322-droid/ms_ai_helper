import { describe, it, expect } from 'vitest';
import { validateConfig } from '../configuration';

/**
 * A fully valid production configuration — every test below breaks exactly
 * one field of this baseline so failures can't be attributed to an unrelated
 * missing variable.
 */
function validProdEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    INTERNAL_API_KEY: 'x'.repeat(32),
    CLIENT_API_KEYS: `web:${'a'.repeat(32)}`,
    ADMIN_USER: 'ops@example.com',
    ADMIN_PASSWORD: 'y'.repeat(12),
    ADMIN_COOKIE_SECRET: 'z'.repeat(32),
    CORS_ALLOWED_ORIGINS: 'https://shop.example.com',
  };
  const merged = { ...base, ...overrides };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete merged[key];
  }
  return merged as Record<string, unknown>;
}

describe('validateConfig — existing behavior (regression)', () => {
  it('throws on missing DATABASE_URL (zod format error)', () => {
    expect(() => validateConfig({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });

  it('requires OPENAI_API_KEY when LLM_PROVIDER=openai', () => {
    expect(() =>
      validateConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        LLM_PROVIDER: 'openai',
      }),
    ).toThrow(/OPENAI_API_KEY is required when LLM_PROVIDER=openai/);
  });

  it('requires OPENAI_API_KEY when EMBEDDING_PROVIDER=openai', () => {
    expect(() =>
      validateConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        EMBEDDING_PROVIDER: 'openai',
      }),
    ).toThrow(/OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai/);
  });

  it('rejects a malformed CLIENT_API_KEYS entry with the existing message', () => {
    expect(() =>
      validateConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        CLIENT_API_KEYS: 'no-separator-here',
      }),
    ).toThrow(/CLIENT_API_KEYS: entry #1 is missing the "label:key" separator/);
  });

  it('rejects an empty CLIENT_API_KEYS list', () => {
    expect(() =>
      validateConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
        CLIENT_API_KEYS: '',
      }),
    ).toThrow(/CLIENT_API_KEYS must contain at least one key/);
  });
});

describe('validateConfig — development/test mode (SC-003)', () => {
  it('starts successfully in development without any explicit secrets', () => {
    const config = validateConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    });
    expect(config.ADMIN_PASSWORD).toBe('changeme123');
    expect(config.corsAllowedOrigins).toEqual([]);
  });

  it('starts successfully in test mode without any explicit secrets', () => {
    expect(() =>
      validateConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@host:5432/db',
      }),
    ).not.toThrow();
  });
});

describe('validateConfig — production baseline sanity', () => {
  it('accepts a fully valid production configuration', () => {
    expect(() => validateConfig(validProdEnv())).not.toThrow();
  });
});

describe('validateConfig — production: not set (FR-001, SC-001)', () => {
  it.each(['INTERNAL_API_KEY', 'ADMIN_USER', 'ADMIN_PASSWORD', 'ADMIN_COOKIE_SECRET'])(
    'rejects missing %s',
    (varName) => {
      expect(() => validateConfig(validProdEnv({ [varName]: undefined }))).toThrow(
        new RegExp(`${varName} is not set`),
      );
    },
  );
});

describe('validateConfig — production: known placeholder (FR-002, SC-001)', () => {
  it('rejects INTERNAL_API_KEY equal to the schema default placeholder', () => {
    expect(() =>
      validateConfig(validProdEnv({ INTERNAL_API_KEY: 'dev-internal-key-change-in-prod' })),
    ).toThrow(/INTERNAL_API_KEY matches a known placeholder value/);
  });

  it('rejects INTERNAL_API_KEY equal to the .env.prod placeholder found in the repo', () => {
    expect(() =>
      validateConfig(validProdEnv({ INTERNAL_API_KEY: 'change-this-in-production' })),
    ).toThrow(/INTERNAL_API_KEY matches a known placeholder value/);
  });

  it('rejects ADMIN_USER equal to the placeholder', () => {
    expect(() => validateConfig(validProdEnv({ ADMIN_USER: 'admin@example.com' }))).toThrow(
      /ADMIN_USER matches a known placeholder value/,
    );
  });

  it('rejects ADMIN_PASSWORD equal to the placeholder', () => {
    expect(() => validateConfig(validProdEnv({ ADMIN_PASSWORD: 'changeme123' }))).toThrow(
      /ADMIN_PASSWORD matches a known placeholder value/,
    );
  });

  it('rejects ADMIN_COOKIE_SECRET equal to the schema default placeholder', () => {
    expect(() =>
      validateConfig(
        validProdEnv({ ADMIN_COOKIE_SECRET: 'dev-cookie-secret-replace-in-prod-!!!' }),
      ),
    ).toThrow(/ADMIN_COOKIE_SECRET matches a known placeholder value/);
  });

  it('rejects ADMIN_COOKIE_SECRET equal to the .env.example placeholder found in the repo', () => {
    expect(() =>
      validateConfig(
        validProdEnv({
          ADMIN_COOKIE_SECRET: 'replace-with-at-least-32-char-random-secret-here',
        }),
      ),
    ).toThrow(/ADMIN_COOKIE_SECRET matches a known placeholder value/);
  });

  it('rejects a CLIENT_API_KEYS entry using the placeholder key value', () => {
    expect(() =>
      validateConfig(validProdEnv({ CLIENT_API_KEYS: 'web:dev-client-key-change-in-prod' })),
    ).toThrow(/CLIENT_API_KEYS.*matches a known placeholder value/);
  });
});

describe('validateConfig — production: shorter than minimum (FR-003, SC-001)', () => {
  it('rejects INTERNAL_API_KEY shorter than 32 chars', () => {
    expect(() =>
      validateConfig(validProdEnv({ INTERNAL_API_KEY: 'short-but-not-a-placeholder' })),
    ).toThrow(/INTERNAL_API_KEY is shorter than the required minimum length/);
  });

  it('rejects ADMIN_PASSWORD shorter than 12 chars', () => {
    expect(() => validateConfig(validProdEnv({ ADMIN_PASSWORD: 'short1' }))).toThrow(
      /ADMIN_PASSWORD is shorter than the required minimum length/,
    );
  });

  it('rejects ADMIN_COOKIE_SECRET shorter than 32 chars', () => {
    expect(() => validateConfig(validProdEnv({ ADMIN_COOKIE_SECRET: 'too-short-secret' }))).toThrow(
      /ADMIN_COOKIE_SECRET is shorter than the required minimum length/,
    );
  });

  it('rejects a CLIENT_API_KEYS entry shorter than 32 chars', () => {
    expect(() => validateConfig(validProdEnv({ CLIENT_API_KEYS: 'web:too-short' }))).toThrow(
      /CLIENT_API_KEYS.*shorter than the required minimum length/,
    );
  });

  it('does not leak the rejected value in the error message', () => {
    try {
      validateConfig(validProdEnv({ ADMIN_PASSWORD: 'short1' }));
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('short1');
    }
  });
});

describe('validateConfig — production: CLIENT_API_KEYS duplicates (FR-004)', () => {
  it('rejects two entries sharing the same label', () => {
    const keys = `web:${'a'.repeat(32)},web:${'b'.repeat(32)}`;
    expect(() => validateConfig(validProdEnv({ CLIENT_API_KEYS: keys }))).toThrow(
      /share the same label/,
    );
  });

  it('rejects two entries sharing the same key value', () => {
    const sharedKey = 'a'.repeat(32);
    const keys = `web:${sharedKey},partner:${sharedKey}`;
    expect(() => validateConfig(validProdEnv({ CLIENT_API_KEYS: keys }))).toThrow(
      /share the same key value/,
    );
  });
});

describe('validateConfig — production: CORS_ALLOWED_ORIGINS (FR-014, SC-006)', () => {
  it('rejects an empty CORS_ALLOWED_ORIGINS in production', () => {
    expect(() => validateConfig(validProdEnv({ CORS_ALLOWED_ORIGINS: '' }))).toThrow(
      /CORS_ALLOWED_ORIGINS must list at least one origin in production/,
    );
  });

  it('rejects an unset CORS_ALLOWED_ORIGINS in production', () => {
    expect(() => validateConfig(validProdEnv({ CORS_ALLOWED_ORIGINS: undefined }))).toThrow(
      /CORS_ALLOWED_ORIGINS must list at least one origin in production/,
    );
  });

  it('allows an empty CORS_ALLOWED_ORIGINS in development', () => {
    const config = validateConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    });
    expect(config.corsAllowedOrigins).toEqual([]);
  });
});

describe('validateConfig — CORS_ALLOWED_ORIGINS normalization (edge case)', () => {
  it('trims whitespace, drops trailing slashes, lower-cases scheme+host, drops empty entries', () => {
    const config = validateConfig(
      validProdEnv({
        CORS_ALLOWED_ORIGINS: ' HTTPS://Shop.EXAMPLE.com/ , https://b.example.com , ',
      }),
    );
    expect(config.corsAllowedOrigins).toEqual([
      'https://shop.example.com',
      'https://b.example.com',
    ]);
  });
});

describe('validateConfig — multiple simultaneous violations (FR-005, SC-002)', () => {
  it('lists every violation in a single error message, none of the values', () => {
    try {
      validateConfig(
        validProdEnv({
          ADMIN_PASSWORD: 'short1',
          ADMIN_COOKIE_SECRET: 'too-short-secret',
          CORS_ALLOWED_ORIGINS: '',
        }),
      );
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/ADMIN_PASSWORD/);
      expect(message).toMatch(/ADMIN_COOKIE_SECRET/);
      expect(message).toMatch(/CORS_ALLOWED_ORIGINS/);
      expect(message).not.toContain('short1');
      expect(message).not.toContain('too-short-secret');
    }
  });
});

describe('validateConfig — process exit contract (FR-007)', () => {
  it('throws a single Error instance (never resolves/rejects silently) on production failure', () => {
    expect(() => validateConfig(validProdEnv({ ADMIN_PASSWORD: undefined }))).toThrow(Error);
  });
});
