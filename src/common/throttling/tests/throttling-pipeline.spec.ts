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
      // The hop count mirrors production (main.ts). It matters here: with
      // `true` Fastify trusts the whole forwarded chain, so req.ip becomes
      // whatever the caller wrote and the spoofing test below would pass
      // against a still-broken guard.
      new FastifyAdapter({ logger: false, trustProxy: 1 }),
      { logger: false },
    );
    app.setGlobalPrefix('v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  // Each test uses its own forwarded address, but the client counter is keyed
  // by label *and* address, so a reset keeps the cases independent of the
  // order they run in.
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

  it('does not let one visitor exhaust the quota of everyone sharing the client key', async () => {
    // The client key ships inside the browser widget, so every visitor of the
    // site presents this same label. Keyed by label alone, the first visitor to
    // spend the limit handed a 429 to the whole site.
    const blocked = await exhaust({
      'x-api-key': 'client-key-one',
      'x-forwarded-for': '203.0.113.10',
    });
    expect(blocked.status).toBe(429);

    const anotherVisitor = await post({
      'x-api-key': 'client-key-one',
      'x-forwarded-for': '203.0.113.11',
    });
    expect(anotherVisitor.status).toBe(201);
  });

  it('cannot be walked through by prepending an X-Forwarded-For entry', async () => {
    // What a spoofing client actually produces: it sends its own
    // X-Forwarded-For, and the proxy appends the address it observed, so the
    // chain reads `<forged…>, <real>`. Only the last entry is trustworthy.
    //
    // Keyed on the leftmost entry — the old `req.ips[0]` — every request here
    // opened a fresh counter and the limit was never reached. `req.ip` under a
    // one-hop trustProxy resolves to the real trailing address, so all four
    // share one counter.
    //
    // The nginx config removes the forged part outright (X-Forwarded-For is
    // overwritten with $remote_addr rather than appended to); this is the
    // second layer, for the case where a proxy in front appends instead.
    const realAddress = '203.0.113.20';

    for (let i = 0; i < COSTLY_LIMIT; i++) {
      const res = await post({
        'x-api-key': 'client-key-one',
        'x-forwarded-for': `198.51.100.${i}, ${realAddress}`,
      });
      expect(res.status).toBe(201);
    }

    const blocked = await post({
      'x-api-key': 'client-key-one',
      'x-forwarded-for': `198.51.100.250, ${realAddress}`,
    });
    expect(blocked.status).toBe(429);
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
