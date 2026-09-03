import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { validateConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import 'reflect-metadata';

async function bootstrap() {
  // Read before the Nest app exists, so the adapter can be configured up front.
  const bootConfig = validateConfig(process.env as Record<string, unknown>);

  const adapter = new FastifyAdapter({
    logger: false,
    // A hop count, not `true`. Without any trustProxy, every request behind
    // nginx looks like it came from the proxy and rate limiting counts all
    // clients as one — while still looking like it works. But `true` trusts the
    // whole X-Forwarded-For chain including the part the client wrote, so
    // req.ip became attacker-controlled and the limit could be walked straight
    // through with a header. `1` trusts exactly one hop — our nginx — so req.ip
    // is the address nginx actually observed.
    trustProxy: bootConfig.TRUST_PROXY ? 1 : false,
    bodyLimit: bootConfig.BODY_LIMIT_BYTES,
  });
  await adapter.getInstance().register(fastifyStatic as any, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/public/',
    decorateReply: false,
  });

  // Crawlers fetch /robots.txt off the domain root, not under /public/ or the API prefix.
  adapter.getInstance().get('/robots.txt', (_req, reply) => {
    reply.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  const prefix = config.get<string>('API_PREFIX') ?? 'v1';

  // An empty list here only ever happens outside production (validateConfig
  // rejects it in production) — dev convenience: let the standalone
  // test-client (file:// or other port) call the API from anywhere.
  if (bootConfig.corsAllowedOrigins.length > 0) {
    app.enableCors({ origin: bootConfig.corsAllowedOrigins });
  } else {
    app.enableCors();
  }

  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger is registered straight onto the adapter, so it never passes through
  // AccessKeyGuard — in production it published the full API map, the internal
  // import contour included, to anyone who asked. It is a development tool, so
  // it is only mounted outside production.
  const swaggerEnabled = bootConfig.NODE_ENV !== 'production';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AI Product Assistant')
      .setDescription('Backend MVP for AI-assisted product selection in sushi delivery')
      .setVersion('1.0')
      .addTag('assistant')
      .addTag('suggestions')
      .addTag('analytics')
      .addTag('import')
      .addTag('admin')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document);
  }

  await app.listen(port, '0.0.0.0');
  Logger.log(`Application running on: http://localhost:${port}/${prefix}`, 'Bootstrap');
  Logger.log(
    swaggerEnabled
      ? `Swagger docs: http://localhost:${port}/${prefix}/docs`
      : 'Swagger docs: disabled in production',
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  // The Nest app may not exist yet (e.g. validateConfig threw before
  // NestFactory.create ran), so there is no Nest logger to fall back on.
  console.error('Application failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
