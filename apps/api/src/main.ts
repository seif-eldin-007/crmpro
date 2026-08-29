import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import { AppModule } from './app.module';
import { createValidationPipeOptions } from './common/filters/validation-pipe.config';
import { RedisIoAdapter } from './common/adapters/redis-io.adapter';
import { resolveCorsOrigins } from './config/cors.config';

function isSwaggerEnabled(nodeEnv: string): boolean {
  const flag = process.env.ENABLE_SWAGGER;
  if (flag === 'true' || flag === '1') {
    return true;
  }
  if (flag === 'false' || flag === '0') {
    return false;
  }
  // Docs are only useful while developing; keep them off in production.
  return nodeEnv !== 'production';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  // Trust exactly one proxy hop so clients cannot spoof x-forwarded-for.
  (app.getHttpAdapter().getInstance() as Application).set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe(createValidationPipeOptions()));

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

  if (isSwaggerEnabled(nodeEnv)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CRMPro API')
      .setDescription('CRMPro backend API documentation')
      .setVersion(configService.get<string>('app.version') ?? '1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.getOrThrow<number>('app.port');

  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(port);
}
void bootstrap();
