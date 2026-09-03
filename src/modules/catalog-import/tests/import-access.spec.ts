/**
 * Access control on the catalogue import endpoints, over real HTTP, against
 * the real ImportController.
 *
 * Why this file exists rather than another case in guard-pipeline.spec.ts:
 * that suite proves the guard machinery using stub controllers, so it stayed
 * green for months while the real ImportController carried no scope decorator
 * at all and answered to any client key — the key that ships inside a browser
 * widget. A test that boots the actual controller is the only kind that can
 * catch a missing or removed decorator on it.
 *
 * The import services are stubbed: what is under test is who may reach the
 * handler, and a stub also lets a rejected request be proven to have never
 * touched the catalogue (invocations stays at zero), which a status code alone
 * cannot show.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AccessKeyGuard } from '@/common/security/access-key.guard';
import { AccessKeyRegistry } from '@/common/security/access-key.registry';
import { ImportController } from '../controllers/import.controller';
import { CityImportService } from '../services/city-import.service';
import { ProductImportService } from '../services/product-import.service';
import { CategoryImportService } from '../services/category-import.service';
import { AttributeImportService } from '../services/attribute-import.service';

const CLIENT_KEY = 'client-key-one';
const INTERNAL_KEY = 'internal-key';

/** Counts how often any import service was actually asked to do work. */
const invocations = { count: 0 };

const record = <T>(result: T) => {
  invocations.count++;
  return Promise.resolve(result);
};

const cityStub = {
  importCities: () => record({ jobId: 'job-city', imported: 1, errors: 0, dryRun: false }),
};
const productStub = {
  importProducts: () => record({ jobId: 'job-product', imported: 1 }),
};
const categoryStub = {
  importCategories: () => record({ jobId: 'job-category', imported: 1, errors: 0, cities: 1 }),
};
const attributeStub = {
  importAttributes: () => record({ jobId: 'job-attribute', imported: 1 }),
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          clientApiKeys: [{ label: 'web', key: CLIENT_KEY }],
          INTERNAL_API_KEY: INTERNAL_KEY,
          ACCESS_CONTROL_MODE: 'enforce',
        }),
      ],
    }),
  ],
  controllers: [ImportController],
  providers: [
    { provide: CityImportService, useValue: cityStub },
    { provide: ProductImportService, useValue: productStub },
    { provide: CategoryImportService, useValue: categoryStub },
    { provide: AttributeImportService, useValue: attributeStub },
    AccessKeyRegistry,
    { provide: APP_GUARD, useClass: AccessKeyGuard },
  ],
})
class ImportAccessTestModule {}

/** Every write endpoint on the controller, with a body its DTO accepts. */
const ENDPOINTS: Array<{ path: string; body: Record<string, unknown> }> = [
  { path: 'cities', body: { rn: 'rn-1' } },
  { path: 'products', body: { rn: 'rn-1', br: 'br-1', target: 'WEB' } },
  { path: 'categories', body: { rn: 'rn-1', target: 'WEB' } },
  { path: 'attributes', body: { rn: 'rn-1' } },
  { path: 'products/by-ids', body: { rn: 'rn-1', br: 'br-1', ids: ['p-1'] } },
];

describe('catalogue import endpoints are internal-only', () => {
  let app: NestFastifyApplication;
  let base: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ImportAccessTestModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
      { logger: false },
    );
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  beforeEach(() => {
    invocations.count = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (
    path: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/v1/internal/import/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it.each(ENDPOINTS)('rejects $path with no key', async ({ path, body }) => {
    expect((await post(path, body)).status).toBe(401);
    expect(invocations.count).toBe(0);
  });

  it.each(ENDPOINTS)('rejects $path with a client key', async ({ path, body }) => {
    // The regression this file was written for: the client key is public — it
    // ships inside the browser widget — so it must not start a catalogue
    // rewrite or drive traffic at the external venus API.
    const res = await post(path, body, { 'x-api-key': CLIENT_KEY });

    expect(res.status).toBe(401);
    expect(invocations.count).toBe(0);
  });

  it.each(ENDPOINTS)('accepts $path with the internal key', async ({ path, body }) => {
    const res = await post(path, body, { 'x-internal-api-key': INTERNAL_KEY });

    expect(res.status).toBe(202);
    expect(invocations.count).toBe(1);
  });

  it('no longer answers on the old double-prefixed path', async () => {
    const res = await fetch(`${base}/v1/v1/import/cities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-api-key': INTERNAL_KEY },
      body: JSON.stringify({ rn: 'rn-1' }),
    });

    expect(res.status).toBe(404);
    expect(invocations.count).toBe(0);
  });

  it('tells no rejection reason apart in the response body', async () => {
    const [noKey, clientKey] = await Promise.all([
      post('cities', { rn: 'rn-1' }).then((r) => r.text()),
      post('cities', { rn: 'rn-1' }, { 'x-api-key': CLIENT_KEY }).then((r) => r.text()),
    ]);

    expect(noKey).toBe(clientKey);
  });
});
