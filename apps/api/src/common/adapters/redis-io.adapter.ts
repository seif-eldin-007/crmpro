import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveCorsOrigins } from '../../config/cors.config';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(private app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(): void {
    const configService = this.app.get(ConfigService);
    const redisUrl =
      configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const configService = this.app.get(ConfigService);
    const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
    const corsOrigins = resolveCorsOrigins(
      nodeEnv,
      configService.get<string[]>('cors.origins') ?? [],
    );

    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: corsOrigins, credentials: true },
    }) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
