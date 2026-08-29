import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaClient } from '@crmpro/database';
import { LoggingService } from '../logging/logging.service';
import { createPrismaPgAdapter } from './prisma-adapter.factory';
import { createSlowQueryExtension } from './prisma-extension.factory';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService, loggingService: LoggingService) {
    const connectionString = configService.getOrThrow<string>('database.url');
    const pool = new Pool({ connectionString });
    const adapter = createPrismaPgAdapter(pool);
    super({ adapter });

    const extension = createSlowQueryExtension(loggingService, configService);
    return this.$extends(extension) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
