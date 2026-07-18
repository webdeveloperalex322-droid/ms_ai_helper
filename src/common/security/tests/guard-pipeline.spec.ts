/**
 * Guard wiring over HTTP (spec 007, Phase 2).
 *
 * The unit specs call canActivate() directly — they would pass even if
 * APP_GUARD were never wired into the app. This boots a real Fastify Nest
 * app with the real guard so the wiring, the scope-metadata resolution and
 * the CORS preflight bypass are proven over actual HTTP rather than assumed.
 *
 * The preflight case is the one worth keeping forever: a browser sends no
 * custom headers on OPTIONS, so a guard that demanded a key there would break
 * every browser client while curl-based checks stayed green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { AccessKeyGuard } from '../access-key.guard';
import { AccessKeyRegistry } from '../access-key.registry';
import { InternalRoute, PublicRoute } from '../access-scope.decorator';

@Controller('health')
class HealthStub {
  @PublicRoute()
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Controller('assistant')
class ClientStub {
  @Post('product-answer')
  answer() {
    return { ok: 'client-route-reached' };
  }
}

@Controller('import')
class InternalStub {
  @InternalRoute()
  @Post('cities')
  cities() {
    return { ok: 'internal-route-reached' };
  }
}

@Controller('undecorated')
class UndecoratedStub {
  @Get()
  get() {
    return { ok: 'undecorated-route-reached' };
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
  ],
  controllers: [HealthStub, ClientStub, InternalStub, UndecoratedStub],
  providers: [AccessKeyRegistry, { provide: APP_GUARD, useClass: AccessKeyGuard }],
})
class VerifyModule {}

describe('AccessKeyGuard over HTTP (temporary Phase 2 verification)', () => {
  let app: NestFastifyApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [VerifyModule] }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
      { logger: false },
    );
    app.setGlobalPrefix('v1');
    app.enableCors();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  const call = (path: string, init?: RequestInit) => fetch(base + path, init);

  it('allows the public health route with no key', async () => {
    expect((await call('/v1/health')).status).toBe(200);
  });

  it('rejects a client route with no key', async () => {
    expect((await call('/v1/assistant/product-answer', { method: 'POST' })).status).toBe(401);
  });

  it('rejects a client route with a wrong key', async () => {
    const res = await call('/v1/assistant/product-answer', {
      method: 'POST',
      headers: { 'x-api-key': 'nope' },
    });
    expect(res.status).toBe(401);
  });

  it('allows a client route with either configured key', async () => {
    for (const key of ['client-key-one', 'client-key-two']) {
      const res = await call('/v1/assistant/product-answer', {
        method: 'POST',
        headers: { 'x-api-key': key },
      });
      expect(res.status).toBe(201);
    }
  });

  it('closes an undecorated route by default', async () => {
    expect((await call('/v1/undecorated')).status).toBe(401);
  });

  it('rejects an internal route with no key and with a client key', async () => {
    expect((await call('/v1/import/cities', { method: 'POST' })).status).toBe(401);

    const withClientKey = await call('/v1/import/cities', {
      method: 'POST',
      headers: { 'x-api-key': 'client-key-one' },
    });
    expect(withClientKey.status).toBe(401);
  });

  it('allows an internal route with the internal key', async () => {
    const res = await call('/v1/import/cities', {
      method: 'POST',
      headers: { 'x-internal-api-key': 'internal-key' },
    });
    expect(res.status).toBe(201);
  });

  it('answers a CORS preflight without a key', async () => {
    const res = await call('/v1/assistant/product-answer', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.com', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBeLessThan(300);
  });

  it('returns byte-identical bodies for every rejection reason', async () => {
    const bodies = await Promise.all([
      call('/v1/assistant/product-answer', { method: 'POST' }).then((r) => r.text()),
      call('/v1/assistant/product-answer', {
        method: 'POST',
        headers: { 'x-api-key': 'nope' },
      }).then((r) => r.text()),
      call('/v1/import/cities', {
        method: 'POST',
        headers: { 'x-api-key': 'client-key-one' },
      }).then((r) => r.text()),
    ]);

    expect(new Set(bodies).size).toBe(1);
  });
});
