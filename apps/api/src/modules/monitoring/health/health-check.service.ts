import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLEANUP_SCHEDULER_HEALTH } from '../../../common/health';
import type { CleanupSchedulerHealthContributor } from '../../../common/health';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { StorageService } from '../../../common/storage/storage.service';
import { BullService } from '../../jobs/bull/bull.service';
import { APP_START_TIME } from '../monitoring.constants';
import {
  GlobalHealthData,
  HealthStatus,
  QueueHealthStatus,
} from '../monitoring.types';

@Injectable()
export class HealthCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bullService: BullService,
    private readonly storageService: StorageService,
    @Inject(CLEANUP_SCHEDULER_HEALTH)
    private readonly cleanupSchedulerHealth: CleanupSchedulerHealthContributor,
    private readonly configService: ConfigService,
  ) {}

  async getGlobalHealth(): Promise<GlobalHealthData> {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);

    const queues: QueueHealthStatus = this.bullService.areQueuesRegistered()
      ? 'healthy'
      : 'unhealthy';
    const cleanupScheduler = this.cleanupSchedulerHealth.getSchedulerStatus();

    return {
      api: 'up',
      database,
      redis,
      storage,
      queues,
      cleanupScheduler,
      version: this.configService.get<string>('app.version') ?? '0.0.1',
      environment:
        this.configService.get<string>('app.nodeEnv') ?? 'development',
      uptimeSeconds: Math.floor((Date.now() - APP_START_TIME) / 1000),
    };
  }

  private async checkDatabase(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<HealthStatus> {
    const isUp = await this.bullService.pingRedis();
    return isUp ? 'up' : 'down';
  }

  private async checkStorage(): Promise<HealthStatus> {
    const isUp = await this.storageService.checkConnectivity();
    return isUp ? 'up' : 'down';
  }
}
