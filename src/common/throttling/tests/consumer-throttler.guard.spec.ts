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

describe('ConsumerThrottlerGuard.getTracker', () => {
  it('keys by owner label when a consumer was recognised', async () => {
    const req = {
      [CONSUMER_REQUEST_PROPERTY]: { label: 'partner-acme', scope: 'client' },
      ip: '10.0.0.1',
      ips: ['203.0.113.7'],
    };

    expect(await track(req)).toBe('consumer:partner-acme');
  });

  it('gives two consumers behind one address separate counters', async () => {
    // The point of keying by label: an office NAT must not make one integrator
    // exhaust another's quota.
    const sharedAddress = { ip: '10.0.0.1', ips: ['203.0.113.7'] };

    const first = await track({
      ...sharedAddress,
      [CONSUMER_REQUEST_PROPERTY]: { label: 'web-widget', scope: 'client' },
    });
    const second = await track({
      ...sharedAddress,
      [CONSUMER_REQUEST_PROPERTY]: { label: 'partner-acme', scope: 'client' },
    });

    expect(first).not.toBe(second);
  });

  it('falls back to the forwarded client address when no consumer is present', async () => {
    const req = { ip: '10.0.0.1', ips: ['203.0.113.7', '10.0.0.1'] };

    expect(await track(req)).toBe('ip:203.0.113.7');
  });

  it('falls back to the socket address when no forwarded chain exists', async () => {
    // This is what happens without trustProxy: every client behind the proxy
    // collapses onto the proxy's address and shares one counter.
    const req = { ip: '10.0.0.1', ips: [] };

    expect(await track(req)).toBe('ip:10.0.0.1');
  });

  it('separates unauthenticated clients by forwarded address', async () => {
    const first = await track({ ip: '10.0.0.1', ips: ['203.0.113.7'] });
    const second = await track({ ip: '10.0.0.1', ips: ['198.51.100.4'] });

    expect(first).not.toBe(second);
  });
});
