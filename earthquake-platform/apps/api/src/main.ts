import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { createLogger } from '@earthquake/observability';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = createLogger('api');
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3000);
  const host = process.env.API_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  logger.info('API listening', { host, port });
}

void bootstrap();
