/**
 * Rate limiting over HTTP (spec 007, US1).
 *
 * Covers what unit tests structurally cannot: that the throttler guard is
 * actually in the chain, that it runs *after* the access guard (so the consumer
 * label is already attached), and what the 429 response really looks like —
 * including whether the library sets Retry-After on its own (T029).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Controller, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  SkipThrottle,
  ThrottlerModule,
  ThrottlerStorage,
  Throttle,
  getStorageToken,
  seconds,
} from '@nestjs/throttler';
import { AccessKeyGuard } from '@/common/security/access-key.guard';
import { AccessKeyRegistry } from '@/common/security/access-key.registry';
import { ConsumerThrottlerGuard } from '../consumer-throttler.guard';

const COSTLY_LIMIT = 3;

/**
 * Stands in for the handler that would issue the paid LLM calls. Counting its
 * invocations is how "a rejected request costs nothing" gets proven rather
 * than assumed — a 401 or 429 status alone says nothing about what ran before it.
 */
const handlerInvocations = { count: 0 };

@Controller('assistant')
class CostlyStub {
  @Throttle({ costly: {} })
  @SkipThrottle({ standard: true })
  @Post('product-answer')
  answer() {
    handlerInvocations.count++;
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          clientApiKeys: [
            { label: 'web-widget', key: 'client-key-one' },
            { label: 'partner-acme', key: 'client-key-two' },
          ],
          INTERNAL_API_KEY: 'internal-key',
          ACCESS_CONTROL_MODE: 'enforce',
        }),
      ],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'costly', limit: COSTLY_LIMIT, ttl: seconds(60) },
        { name: 'standard', limit: 100, ttl: seconds(60) },
      ],
    }),
  ],
  controllers: [CostlyStub],
  providers: [
    AccessKeyRegistry,
    { provide: APP_GUARD, useClass: AccessKeyGuard },
    { provide: APP_GUARD, useClass: ConsumerThrottlerGuard },
  ],
})
class ThrottleTestModule {}

describe('rate limiting over HTTP', () => {
  let app: NestFastifyApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ThrottleTestModule] }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      // trustProxy mirrors production: without it req.ips stays empty and every
      // client behind the proxy shares a single counter.
      new FastifyAdapter({ logger: false, trustProxy: true }),
      { logger: false },
    );
    app.setGlobalPrefix('v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  // Counters are keyed by consumer label, so they survive a change of address.
  // Without this reset each test would start already throttled by the previous
  // one — which is itself a small proof that the key is the label, not the IP.
  beforeEach(() => {
    const storage = app.get<ThrottlerStorage>(getStorageToken());
    (storage as unknown as { storage: Map<string, unknown> }).storage.clear();
    handlerInvocations.count = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (headers: Record<string, string>) =>
    fetch(`${base}/v1/assistant/product-answer`, { method: 'POST', headers });

  const exhaust = async (headers: Record<string, string>) => {
    for (let i = 0; i < COSTLY_LIMIT; i++) {
      const res = await post(headers);
      expect(res.status).toBe(201);
    }
    return post(headers);
  };

  it('rejects once the configured limit is exceeded', async () => {
    const blocked = await exhaust({
      'x-api-key': 'client-key-one',
      'x-forwarded-for': '203.0.113.1',
    });

    expect(blocked.status).toBe(429);
  });

  it('sets a canonical Retry-After on the throttled response', async () => {
    // The library only emits `Retry-After-<throttler name>` when named
    // throttlers are used — a header no client honours. The guard adds the
    // canonical one; this test is what caught the difference.
    const blocked = await exhaust({
      'x-api-key': 'client-key-one',
      'x-forwarded-for': '203.0.113.2',
    });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('does not let one consumer exhaust another consumer quota', async () => {
    // Both keys arrive from the same address on purpose: if the counter were
    // keyed by IP, the second key would already be blocked.
    const address = '203.0.113.50';

    const blocked = await exhaust({ 'x-api-key': 'client-key-one', 'x-forwarded-for': address });
    expect(blocked.status).toBe(429);

    const other = await post({ 'x-api-key': 'client-key-two', 'x-forwarded-for': address });
    expect(other.status).toBe(201);
  });

  it('rejects an unkeyed request before it can consume any quota', async () => {
    const res = await post({ 'x-forwarded-for': '203.0.113.60' });

    // 401, not 429: the access guard runs first, so a keyless flood never
    // reaches the paid handler at all.
    expect(res.status).toBe(401);
  });

  it('never reaches the paid handler for a rejected request (SC-002)', async () => {
    // The heart of the money argument: an anonymous flood must cost nothing.
    for (let i = 0; i < 20; i++) {
      await post({ 'x-forwarded-for': `198.51.100.${i}` });
    }
    expect(handlerInvocations.count).toBe(0);

    // Same for requests rejected by the rate limiter rather than the key check.
    const throttled = await exhaust({
      'x-api-key': 'client-key-one',
      'x-forwarded-for': '203.0.113.90',
    });
    expect(throttled.status).toBe(429);
    expect(handlerInvocations.count).toBe(COSTLY_LIMIT);
  });
});
