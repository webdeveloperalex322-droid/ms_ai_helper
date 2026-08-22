/**
 * Verification for spec 008, US5: the suggestion admin endpoints must be
 * closed by the same declarative access-control mechanism as the rest of
 * the internal contour, and their request bodies must be validated by
 * typed DTOs rather than accepted as `any`.
 *
 * Split across two concerns, deliberately:
 *
 * 1. Access control is verified over real HTTP (boot-a-real-Fastify-app,
 *    same pattern as src/common/security/tests/guard-pipeline.spec.ts).
 *    Guard scope resolution reads explicit `SetMetadata` keys via
 *    `Reflector`, which works under any transform.
 *
 * 2. DTO validation is verified by invoking Nest's `ValidationPipe`
 *    directly with an explicit metatype, the same call Nest's router makes
 *    internally — rather than through a `@Body() body: CreateSuggestionDto`
 *    parameter over real HTTP. Nest resolves that parameter's metatype from
 *    TypeScript's emitted `design:paramtypes`, which `tsc` (the real build)
 *    emits but Vitest's esbuild-based transform does not — under this test
 *    runner the pipe would silently receive no metatype and skip
 *    validation entirely, passing for the wrong reason. Driving the pipe
 *    directly exercises the exact validation contract the controller
 *    relies on, independent of that transform gap.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { AccessKeyGuard } from '../../../common/security/access-key.guard';
import { AccessKeyRegistry } from '../../../common/security/access-key.registry';
import { SuggestionAdminController } from '../controllers/suggestion-admin.controller';
import { SuggestionAdminService } from '../services/suggestion-admin.service';
import { CreateSuggestionDto } from '../dto/create-suggestion.dto';
import { UpdateSuggestionDto } from '../dto/update-suggestion.dto';

const mockService = {
  findAll: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockImplementation((data: any) => Promise.resolve({ id: 'new-id', ...data })),
  update: vi.fn().mockImplementation((id: string, data: any) => Promise.resolve({ id, ...data })),
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          clientApiKeys: [{ label: 'web-widget', key: 'client-key-one' }],
          INTERNAL_API_KEY: 'internal-key',
          ACCESS_CONTROL_MODE: 'enforce',
        }),
      ],
    }),
  ],
  controllers: [SuggestionAdminController],
  providers: [
    AccessKeyRegistry,
    { provide: SuggestionAdminService, useValue: mockService },
    { provide: APP_GUARD, useClass: AccessKeyGuard },
  ],
})
class VerifyModule {}

const validCreateBody = {
  rn: '11111111-1111-4111-8111-111111111111',
  code: 'test-code',
  title: 'Test suggestion',
  payload: {
    intent: 'browse',
    slots: {},
    retrieval_query: 'test query',
  },
  availabilityRules: {
    check_products_exist: true,
    min_products_count: 1,
    hide_if_empty: true,
    respect_city_availability: true,
  },
};

describe('SuggestionAdminController — access control (spec 008, US5)', () => {
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
  });

  const call = (path: string, init?: RequestInit) => fetch(base + path, init);
  const rn = '11111111-1111-4111-8111-111111111111';

  it('rejects GET with no key', async () => {
    expect((await call(`/v1/internal/assistant/suggestions?rn=${rn}`)).status).toBe(401);
  });

  it('rejects POST with no key', async () => {
    const res = await call('/v1/internal/assistant/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateBody),
    });
    expect(res.status).toBe(401);
  });

  it('rejects POST with a client key (wrong scope)', async () => {
    const res = await call('/v1/internal/assistant/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'client-key-one' },
      body: JSON.stringify(validCreateBody),
    });
    expect(res.status).toBe(401);
  });

  it('allows GET with the internal key', async () => {
    const res = await call(`/v1/internal/assistant/suggestions?rn=${rn}`, {
      headers: { 'x-internal-api-key': 'internal-key' },
    });
    expect(res.status).toBe(200);
  });

  it('creates a suggestion with a valid body and the internal key', async () => {
    mockService.create.mockClear();
    const res = await call('/v1/internal/assistant/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': 'internal-key' },
      body: JSON.stringify(validCreateBody),
    });
    expect(res.status).toBe(201);
    expect(mockService.create).toHaveBeenCalledTimes(1);
  });

  it('updates a suggestion with a valid partial body and the internal key', async () => {
    mockService.update.mockClear();
    const res = await call('/v1/internal/assistant/suggestions/some-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': 'internal-key' },
      body: JSON.stringify({ title: 'Updated title' }),
    });
    expect(res.status).toBe(200);
    expect(mockService.update).toHaveBeenCalledWith(
      'some-id',
      expect.objectContaining({ title: 'Updated title' }),
    );
  });
});

describe('CreateSuggestionDto / UpdateSuggestionDto — validation contract (spec 008, US5)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  it('accepts a fully valid create body unchanged', async () => {
    const result = await pipe.transform(validCreateBody, {
      type: 'body',
      metatype: CreateSuggestionDto,
    } as any);
    expect(result.code).toBe('test-code');
  });

  it('rejects a create body with a wrong-typed field', async () => {
    await expect(
      pipe.transform({ ...validCreateBody, sortOrder: 'not-a-number' }, {
        type: 'body',
        metatype: CreateSuggestionDto,
      } as any),
    ).rejects.toThrow();
  });

  it('rejects a create body missing required fields', async () => {
    await expect(
      pipe.transform({ rn: validCreateBody.rn, code: 'no-title-or-payload' }, {
        type: 'body',
        metatype: CreateSuggestionDto,
      } as any),
    ).rejects.toThrow();
  });

  it('strips unknown fields from a create body', async () => {
    const result = await pipe.transform(
      { ...validCreateBody, unexpectedField: 'should be stripped' },
      { type: 'body', metatype: CreateSuggestionDto } as any,
    );
    expect(result.unexpectedField).toBeUndefined();
    expect(result.code).toBe('test-code');
  });

  it('accepts a valid partial update body', async () => {
    const result = await pipe.transform({ title: 'Updated title' }, {
      type: 'body',
      metatype: UpdateSuggestionDto,
    } as any);
    expect(result.title).toBe('Updated title');
  });

  it('rejects a partial update body with a wrong-typed field', async () => {
    await expect(
      pipe.transform({ sortOrder: 'not-a-number' }, {
        type: 'body',
        metatype: UpdateSuggestionDto,
      } as any),
    ).rejects.toThrow();
  });
});
