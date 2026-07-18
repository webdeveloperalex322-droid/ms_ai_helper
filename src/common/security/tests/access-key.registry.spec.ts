import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AccessKeyRegistry } from '../access-key.registry';
import { ClientApiKeyEntry } from '@/config/configuration';

function buildRegistry(clientKeys: ClientApiKeyEntry[], internalKey = 'internal-secret') {
  const configService = {
    get: (key: string) => {
      if (key === 'clientApiKeys') return clientKeys;
      if (key === 'INTERNAL_API_KEY') return internalKey;
      return undefined;
    },
  } as unknown as ConfigService;

  return new AccessKeyRegistry(configService);
}

describe('AccessKeyRegistry', () => {
  describe('verifyClientKey', () => {
    it('returns the owner label for a valid key', () => {
      const registry = buildRegistry([{ label: 'web-widget', key: 'key-one' }]);

      expect(registry.verifyClientKey('key-one')).toBe('web-widget');
    });

    it('resolves each key to its own label when several are configured', () => {
      const registry = buildRegistry([
        { label: 'web-widget', key: 'key-one' },
        { label: 'partner-acme', key: 'key-two' },
      ]);

      expect(registry.verifyClientKey('key-one')).toBe('web-widget');
      expect(registry.verifyClientKey('key-two')).toBe('partner-acme');
    });

    it('rejects an unknown key', () => {
      const registry = buildRegistry([{ label: 'web-widget', key: 'key-one' }]);

      expect(registry.verifyClientKey('wrong-key')).toBeNull();
    });

    it('rejects an undefined or empty key', () => {
      const registry = buildRegistry([{ label: 'web-widget', key: 'key-one' }]);

      expect(registry.verifyClientKey(undefined)).toBeNull();
      expect(registry.verifyClientKey('')).toBeNull();
    });

    it('does not throw on keys of a different length than the configured one', () => {
      // Guards against passing raw keys to timingSafeEqual, which throws on
      // length mismatch. Hashing first is what makes this safe.
      const registry = buildRegistry([{ label: 'web-widget', key: 'short' }]);

      expect(() => registry.verifyClientKey('a-considerably-longer-key')).not.toThrow();
      expect(registry.verifyClientKey('a-considerably-longer-key')).toBeNull();
      expect(() => registry.verifyClientKey('x')).not.toThrow();
    });

    it('matches a key placed last in the list, proving the scan does not exit early', () => {
      const registry = buildRegistry([
        { label: 'first', key: 'key-one' },
        { label: 'second', key: 'key-two' },
        { label: 'third', key: 'key-three' },
      ]);

      expect(registry.verifyClientKey('key-three')).toBe('third');
    });

    it('returns null when no client keys are configured', () => {
      const registry = buildRegistry([]);

      expect(registry.verifyClientKey('any-key')).toBeNull();
    });
  });

  describe('verifyInternalKey', () => {
    it('returns the internal label for the configured key', () => {
      const registry = buildRegistry([], 'internal-secret');

      expect(registry.verifyInternalKey('internal-secret')).toBe('internal');
    });

    it('rejects a wrong internal key', () => {
      const registry = buildRegistry([], 'internal-secret');

      expect(registry.verifyInternalKey('nope')).toBeNull();
    });
  });

  describe('contour separation', () => {
    it('does not accept a client key as an internal key', () => {
      // FR-003: the key shipped with a browser widget must not grant write access.
      const registry = buildRegistry([{ label: 'web-widget', key: 'client-key' }], 'internal-key');

      expect(registry.verifyInternalKey('client-key')).toBeNull();
    });

    it('does not accept the internal key as a client key', () => {
      const registry = buildRegistry([{ label: 'web-widget', key: 'client-key' }], 'internal-key');

      expect(registry.verifyClientKey('internal-key')).toBeNull();
    });
  });
});
