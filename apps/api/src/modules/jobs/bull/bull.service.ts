import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { RedisConnectionConfig } from '../../../common/redis/redis.config';
import {
  BULL_CONFIG_KEYS,
  DEFAULT_BULL_PREFIX,
  DEFAULT_CLEANUP_CONCURRENCY,
  DEFAULT_EXPORT_CONCURRENCY,
  DEFAULT_IMPORT_CONCURRENCY,
  DEFAULT_NOTIFICATION_CONCURRENCY,
  DEFAULT_JOB_ATTEMPTS,
  DEFAULT_JOB_BACKOFF_DELAY_MS,
  QUEUE_NAMES,
  QueueName,
  REDIS_CONFIG_KEYS,
} from './bull.constants';

@Injectable()
export class BullService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullService.name);
  private readonly queues = new Map<QueueName, Queue>();
  private redis?: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis(this.getRedisConnectionConfig());

    this.redis.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });

    for (const queueName of QUEUE_NAMES) {
      this.queues.set(queueName, this.createQueue(queueName));
    }

    this.logger.log('BullMQ queues initialized');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.queues.values()].map(async (queue) => {
        await queue.close();
      }),
    );

    if (this.redis) {
      await this.redis.quit();
      this.redis = undefined;
    }

    this.logger.log('BullMQ queues and Redis connection closed');
  }

  getQueue(name: QueueName): Queue {
    const queue = this.queues.get(name);

    if (!queue) {
      throw new Error(`Queue not registered: ${name}`);
    }

    return queue;
  }

  getConnectionOptions(): RedisConnectionConfig {
    return this.getRedisConnectionConfig();
  }

  getPrefix(): string {
    return (
      this.configService.get<string>(BULL_CONFIG_KEYS.prefix) ??
      DEFAULT_BULL_PREFIX
    );
  }

  getImportConcurrency(): number {
    return (
      this.configService.get<number>(BULL_CONFIG_KEYS.importConcurrency) ??
      DEFAULT_IMPORT_CONCURRENCY
    );
  }

  getExportConcurrency(): number {
    return (
      this.configService.get<number>(BULL_CONFIG_KEYS.exportConcurrency) ??
      DEFAULT_EXPORT_CONCURRENCY
    );
  }

  getCleanupConcurrency(): number {
    return (
      this.configService.get<number>(BULL_CONFIG_KEYS.cleanupConcurrency) ??
      DEFAULT_CLEANUP_CONCURRENCY
    );
  }

  getNotificationConcurrency(): number {
    return (
      this.configService.get<number>(
        BULL_CONFIG_KEYS.notificationConcurrency,
      ) ?? DEFAULT_NOTIFICATION_CONCURRENCY
    );
  }

  getDefaultJobOptions() {
    const attempts =
      this.configService.get<number>(BULL_CONFIG_KEYS.jobAttempts) ??
      DEFAULT_JOB_ATTEMPTS;
    const delay =
      this.configService.get<number>(BULL_CONFIG_KEYS.jobBackoffDelayMs) ??
      DEFAULT_JOB_BACKOFF_DELAY_MS;

    return {
      attempts,
      backoff: {
        type: 'exponential' as const,
        delay,
      },
      removeOnComplete: true,
      removeOnFail: false,
    };
  }

  async pingRedis(): Promise<boolean> {
    try {
      if (!this.redis) {
        return false;
      }

      const response = await this.redis.ping();
      return response === 'PONG';
    } catch {
      return false;
    }
  }

  areQueuesRegistered(): boolean {
    return this.queues.size === QUEUE_NAMES.length;
  }

  private createQueue(name: QueueName): Queue {
    return new Queue(name, {
      connection: this.getRedisConnectionConfig(),
      prefix: this.getPrefix(),
      defaultJobOptions: this.getDefaultJobOptions(),
    });
  }

  private getRedisConnectionConfig(): RedisConnectionConfig {
    return {
      host: this.configService.getOrThrow<string>(REDIS_CONFIG_KEYS.host),
      port: this.configService.getOrThrow<number>(REDIS_CONFIG_KEYS.port),
      password: this.configService.get<string>(REDIS_CONFIG_KEYS.password),
    };
  }
}
