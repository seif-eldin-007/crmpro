import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueService } from '../jobs/queues/queue.service';
import {
  CLEANUP_CONFIG_KEYS,
  CleanupJobName,
  DEFAULT_ORPHAN_S3_CRON,
  DEFAULT_SESSIONS_INTERVAL_MS,
  DEFAULT_STALE_JOBS_INTERVAL_MS,
  DEFAULT_UPLOAD_INTENTS_INTERVAL_MS,
} from './cleanup.constants';

@Injectable()
export class CleanupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CleanupSchedulerService.name);
  private registered = false;

  constructor(
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.registerRepeatableJobs();
  }

  async registerRepeatableJobs(): Promise<void> {
    const uploadIntentsIntervalMs =
      this.configService.get<number>(
        CLEANUP_CONFIG_KEYS.uploadIntentsIntervalMs,
      ) ?? DEFAULT_UPLOAD_INTENTS_INTERVAL_MS;
    const staleJobsIntervalMs =
      this.configService.get<number>(CLEANUP_CONFIG_KEYS.staleJobsIntervalMs) ??
      DEFAULT_STALE_JOBS_INTERVAL_MS;
    const sessionsIntervalMs =
      this.configService.get<number>(CLEANUP_CONFIG_KEYS.sessionsIntervalMs) ??
      DEFAULT_SESSIONS_INTERVAL_MS;
    const orphanS3Cron =
      this.configService.get<string>(CLEANUP_CONFIG_KEYS.orphanS3Cron) ??
      DEFAULT_ORPHAN_S3_CRON;

    await this.queueService.registerCleanupRepeatableJob(
      CleanupJobName.FILE_UPLOAD_INTENTS,
      { every: uploadIntentsIntervalMs },
    );
    await this.queueService.registerCleanupRepeatableJob(
      CleanupJobName.STALE_IMPORT_JOBS,
      { every: staleJobsIntervalMs },
    );
    await this.queueService.registerCleanupRepeatableJob(
      CleanupJobName.STALE_EXPORT_JOBS,
      { every: staleJobsIntervalMs },
    );
    await this.queueService.registerCleanupRepeatableJob(
      CleanupJobName.EXPIRED_SESSIONS,
      { every: sessionsIntervalMs },
    );
    await this.queueService.registerCleanupRepeatableJob(
      CleanupJobName.ORPHAN_S3_OBJECTS,
      { pattern: orphanS3Cron },
    );

    this.registered = true;
    this.logger.log('Cleanup repeatable jobs registered');
  }

  isRegistered(): boolean {
    return this.registered;
  }
}
