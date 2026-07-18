/**
 * Independent key revocation (spec 007, FR-009d / SC-007).
 *
 * This is the test that justifies the whole key model. A single shared key
 * would have been simpler; the list-with-labels exists so one integrator can
 * lose access without disturbing anyone else. Without this test the requirement
 * cannot be failed — and a requirement that cannot be failed guarantees nothing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Controller, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AccessKeyGuard } from '../access-key.guard';
import { AccessKeyRegistry } from '../access-key.registry';
import { ClientApiKeyEntry } from '@/config/configuration';

@Controller('assistant')
class Stub {
  @Post('product-answer')
  answer() {
    return { ok: true };
  }
}

function buildModule(clientApiKeys: ClientApiKeyEntry[]) {
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ clientApiKeys, INTERNAL_API_KEY: 'x', ACCESS_CONTROL_MODE: 'enforce' })],
      }),
    ],
    controllers: [Stub],
    providers: [AccessKeyRegistry, { provide: APP_GUARD, useClass: AccessKeyGuard }],
  })
  class RevocationTestModule {}

  return RevocationTestModule;
}

async function startApp(clientApiKeys: ClientApiKeyEntry[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [buildModule(clientApiKeys)],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
    { logger: false },
  );
  app.setGlobalPrefix('v1');
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  await app.listen(0, '127.0.0.1');

  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  return {
    app,
    call: (key: string) =>
      fetch(`${base}/v1/assistant/product-answer`, {
        method: 'POST',
        headers: { 'x-api-key': key },
      }),
  };
}

describe('independent key revocation', () => {
  let running: NestFastifyApplication[] = [];

  afterEach(async () => {
    await Promise.all(running.map((a) => a.close()));
    running = [];
  });

  const WIDGET = { label: 'web-widget', key: 'widget-key' };
  const PARTNER = { label: 'partner-acme', key: 'partner-key' };

  it('accepts both keys while both are configured', async () => {
    const { app, call } = await startApp([WIDGET, PARTNER]);
    running.push(app);

    expect((await call(WIDGET.key)).status).toBe(201);
    expect((await call(PARTNER.key)).status).toBe(201);
  });

  it('rejects only the removed key and leaves the other working', async () => {
    // Revocation is "remove the entry from the configured list and restart".
    const { app, call } = await startApp([WIDGET]);
    running.push(app);

    expect((await call(PARTNER.key)).status).toBe(401);
    expect((await call(WIDGET.key)).status).toBe(201);
  });

  it('rejects every client once the list is emptied of a given key set', async () => {
    const { app, call } = await startApp([{ label: 'someone-else', key: 'third-key' }]);
    running.push(app);

    expect((await call(WIDGET.key)).status).toBe(401);
    expect((await call(PARTNER.key)).status).toBe(401);
  });
});
