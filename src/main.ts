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
    // Without trustProxy, Fastify leaves req.ips empty and every request behind
    // nginx looks like it came from the proxy's address. Rate limiting by source
    // would then count all clients as one — while still looking like it works.
    trustProxy: bootConfig.TRUST_PROXY,
    bodyLimit: bootConfig.BODY_LIMIT_BYTES,
  });
  await adapter.getInstance().register(fastifyStatic as any, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/public/',
    decorateReply: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  const prefix = config.get<string>('API_PREFIX') ?? 'v1';

  // Dev convenience: allow the standalone test-client (file:// or other port) to call the API.
  app.enableCors();

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

  await app.listen(port, '0.0.0.0');
  Logger.log(`Application running on: http://localhost:${port}/${prefix}`, 'Bootstrap');
  Logger.log(`Swagger docs: http://localhost:${port}/${prefix}/docs`, 'Bootstrap');
}

bootstrap();
