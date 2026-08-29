import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import { AppModule } from './app.module';
import { createValidationPipeOptions } from './common/filters/validation-pipe.config';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import { resolveCorsOrigins } from './config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  // Trust exactly one proxy hop so clients cannot spoof x-forwarded-for.
  (app.getHttpAdapter().getInstance() as Application).set('trust proxy', 1);
  app.use(cookieParser());

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const corsOrigins = resolveCorsOrigins(
    nodeEnv,
    configService.get<string[]>('cors.origins') ?? [],
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe(createValidationPipeOptions()));

  const port = configService.getOrThrow<number>('app.port');

  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(port);
}
void bootstrap();
