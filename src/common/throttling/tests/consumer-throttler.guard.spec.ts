import { describe, it, expect } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ConsumerThrottlerGuard } from '../consumer-throttler.guard';
import { CONSUMER_REQUEST_PROPERTY } from '@/common/security/consumer.types';

function buildGuard() {
  const options = { throttlers: [{ name: 'standard', limit: 10, ttl: 60_000 }] };
  const storage = { increment: async () => ({}) } as unknown as ThrottlerStorage;

  return new ConsumerThrottlerGuard(
    options as unknown as ThrottlerModuleOptions,
    storage,
    new Reflector(),
  );
}

/** getTracker is protected; the cast keeps the test honest about that. */
const track = (req: Record<string, unknown>): Promise<string> =>
  (
    buildGuard() as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }
  ).getTracker(req);

const client = (label: string) => ({ label, scope: 'client' as const });
const internal = (label: string) => ({ label, scope: 'internal' as const });

describe('ConsumerThrottlerGuard.getTracker', () => {
  describe('client contour', () => {
    it('keys by label *and* address, because one client key serves every visitor', async () => {
      // The client key ships inside the browser widget, so every visitor of the
      // site presents the same label. Keying by label alone put the whole site
      // on one counter: any one visitor could spend the shared LLM budget and
      // hand everyone else a 429.
      const req = {
        [CONSUMER_REQUEST_PROPERTY]: client('web'),
        ip: '203.0.113.7',
      };

      expect(await track(req)).toBe('consumer:web|ip:203.0.113.7');
    });

    it('gives two visitors sharing one client key separate counters', async () => {
      const first = await track({ [CONSUMER_REQUEST_PROPERTY]: client('web'), ip: '203.0.113.7' });
      const second = await track({
        [CONSUMER_REQUEST_PROPERTY]: client('web'),
        ip: '198.51.100.4',
      });

      expect(first).not.toBe(second);
    });

    it('still gives two consumers behind one address separate counters', async () => {
      // The original guarantee, unchanged: an office NAT must not let one
      // integrator exhaust another's quota. The label is still in the key.
      const address = '203.0.113.7';

      const first = await track({ [CONSUMER_REQUEST_PROPERTY]: client('web'), ip: address });
      const second = await track({
        [CONSUMER_REQUEST_PROPERTY]: client('partner-acme'),
        ip: address,
      });

      expect(first).not.toBe(second);
    });
  });

  describe('internal contour', () => {
    it('keys by label alone', async () => {
      // An internal integration is one operator holding one key, and may
      // legitimately call from a changing address (CI runner, cron host). Its
      // quota belongs to the key, not to wherever it happens to run.
      const req = { [CONSUMER_REQUEST_PROPERTY]: internal('internal'), ip: '203.0.113.7' };

      expect(await track(req)).toBe('consumer:internal');
    });

    it('keeps one counter across addresses', async () => {
      const first = await track({
        [CONSUMER_REQUEST_PROPERTY]: internal('internal'),
        ip: '203.0.113.7',
      });
      const second = await track({
        [CONSUMER_REQUEST_PROPERTY]: internal('internal'),
        ip: '198.51.100.4',
      });

      expect(first).toBe(second);
    });
  });

  describe('no recognised consumer', () => {
    it('falls back to the address', async () => {
      expect(await track({ ip: '203.0.113.7' })).toBe('ip:203.0.113.7');
    });

    it('separates unauthenticated clients by address', async () => {
      const first = await track({ ip: '203.0.113.7' });
      const second = await track({ ip: '198.51.100.4' });

      expect(first).not.toBe(second);
    });
  });

  describe('address is taken from req.ip, never from the forwarded chain', () => {
    it('ignores req.ips even when a chain is present', async () => {
      // req.ips[0] is the *leftmost* X-Forwarded-For entry, which any client can
      // write. Keying on it let an attacker mint a fresh counter per request
      // and walk straight through the limit. req.ip is resolved by Fastify from
      // the trusted hop count (trustProxy: 1 in main.ts), so it is the address
      // nginx actually observed.
      const req = { ip: '203.0.113.7', ips: ['198.51.100.4', '203.0.113.7'] };

      expect(await track(req)).toBe('ip:203.0.113.7');
    });

    it('gives a spoofing client the same counter no matter what it forwards', async () => {
      const first = await track({ ip: '203.0.113.7', ips: ['10.0.0.1', '203.0.113.7'] });
      const second = await track({ ip: '203.0.113.7', ips: ['10.0.0.2', '203.0.113.7'] });

      expect(first).toBe(second);
    });
  });
});
