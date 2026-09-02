import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobStatus, Prisma, TenantStatus } from '@crmpro/database';
import { StorageLoggingService } from '../../common/logging/storage-logging.service';
import { LoggingService } from '../../common/logging/logging.service';
import { RequestContextService } from '../../common/logging/request-context.service';
import { StorageService } from '../../common/storage/storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../jobs/queues/queue.service';
import {
  CLEANUP_CONFIG_KEYS,
  CleanupJobName,
  DEFAULT_CLEANUP_BATCH_SIZE,
  DEFAULT_EXPORT_JOB_TIMEOUT_MINUTES,
  DEFAULT_IMPORT_JOB_TIMEOUT_MINUTES,
  DEFAULT_SESSION_RETENTION_DAYS,
  DEFAULT_UPLOAD_INTENT_TTL_MINUTES,
  S3_TENANT_PREFIX,
  STALE_EXPORT_JOB_RECLAIMED,
  STALE_IMPORT_JOB_RECLAIMED,
} from './cleanup.constants';
import { CleanupTaskResult } from './cleanup.types';
import { CleanupHealthService } from './cleanup-health.service';

const TENANT_INACTIVE_JOB_MESSAGE =
  'Tenant is suspended or cancelled; job cannot run.';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly cleanupHealthService: CleanupHealthService,
    private readonly loggingService: LoggingService,
    private readonly requestContext: RequestContextService,
    private readonly storageLoggingService: StorageLoggingService,
    private readonly queueService: QueueService,
  ) {}

  async runCleanup(jobName: CleanupJobName): Promise<CleanupTaskResult> {
    const startedAt = Date.now();
    const requestId = this.requestContext.getRequestId();

    this.loggingService.info({
      module: 'Cleanup',
      operation: jobName,
      requestId,
      status: 'started',
    });

    try {
      const result = await this.executeCleanup(jobName);
      const durationMs = Date.now() - startedAt;

      this.cleanupHealthService.recordSuccess(jobName);

      this.loggingService.info({
        module: 'Cleanup',
        operation: jobName,
        requestId,
        durationMs,
        status: 'completed',
        metadata: {
          deleted: result.deleted,
          updated: result.updated,
        },
      });

      return {
        jobName,
        deleted: result.deleted,
        updated: result.updated,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);

      this.cleanupHealthService.recordFailure(jobName);

      this.loggingService.error({
        module: 'Cleanup',
        operation: jobName,
        requestId,
        durationMs,
        status: 'failed',
        metadata: { error: message },
      });

      throw error;
    }
  }

  private async executeCleanup(
    jobName: CleanupJobName,
  ): Promise<{ deleted: number; updated: number }> {
    switch (jobName) {
      case CleanupJobName.FILE_UPLOAD_INTENTS:
        return this.cleanupExpiredUploadIntents();
      case CleanupJobName.STALE_IMPORT_JOBS:
        return this.cleanupStaleImportJobs();
      case CleanupJobName.STALE_EXPORT_JOBS:
        return this.cleanupStaleExportJobs();
      case CleanupJobName.EXPIRED_SESSIONS:
        return this.cleanupExpiredSessions();
      case CleanupJobName.ORPHAN_S3_OBJECTS:
        return this.cleanupOrphanS3Objects();
      default:
        throw new Error(`Unsupported cleanup job: ${String(jobName)}`);
    }
  }

  async cleanupExpiredUploadIntents(): Promise<{
    deleted: number;
    updated: number;
  }> {
    const batchSize = this.getBatchSize();
    const ttlMinutes = this.getUploadIntentTtlMinutes();
    const now = new Date();
    const createdAtCutoff = new Date(now.getTime() - ttlMinutes * 60 * 1000);
    let deleted = 0;

    while (true) {
      const batch = await this.prisma.fileUploadIntent.findMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { createdAt: { lt: createdAtCutoff } },
          ],
        },
        select: { id: true },
        take: batchSize,
      });

      if (batch.length === 0) {
        break;
      }

      const result = await this.prisma.fileUploadIntent.deleteMany({
        where: {
          id: { in: batch.map((intent) => intent.id) },
        },
      });

      deleted += result.count;

      if (batch.length < batchSize) {
        break;
      }
    }

    return { deleted, updated: 0 };
  }

  async cleanupStaleImportJobs(): Promise<{
    deleted: number;
    updated: number;
  }> {
    const batchSize = this.getBatchSize();
    const timeoutMinutes = this.getImportJobTimeoutMinutes();
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    let updated = 0;

    while (true) {
      const batch = await this.prisma.importJob.findMany({
        where: {
          status: JobStatus.PROCESSING,
          updatedAt: { lt: cutoff },
        },
        select: { id: true, tenant: { select: { status: true } } },
        take: batchSize,
      });

      if (batch.length === 0) {
        break;
      }

      for (const job of batch) {
        // Never re-queue work for suspended/cancelled tenants: park the job
        // as FAILED with a clear reason instead of looping it through the
        // worker (which would refuse it anyway).
        if (this.isTenantInactive(job.tenant.status)) {
          const parked = await this.prisma.importJob.updateMany({
            where: {
              id: job.id,
              status: JobStatus.PROCESSING,
              updatedAt: { lt: cutoff },
            },
            data: {
              status: JobStatus.FAILED,
              completedAt: new Date(),
              errorSummary: [{ row: 0, reason: TENANT_INACTIVE_JOB_MESSAGE }],
            },
          });

          if (parked.count === 1) {
            updated += 1;
            this.logger.warn(
              `${STALE_IMPORT_JOB_RECLAIMED} jobId=${job.id} tenantInactive=true`,
            );
          }

          continue;
        }

        const reclaimed = await this.prisma.importJob.updateMany({
          where: {
            id: job.id,
            status: JobStatus.PROCESSING,
            updatedAt: { lt: cutoff },
          },
          data: {
            status: JobStatus.PENDING,
            processedRows: 0,
            successfulRows: 0,
            failedRows: 0,
            totalRows: 0,
            errorSummary: Prisma.DbNull,
            completedAt: null,
          },
        });

        if (reclaimed.count !== 1) {
          continue;
        }

        await this.queueService.requeueImportJob(job.id);
        updated += 1;

        this.logger.warn(`${STALE_IMPORT_JOB_RECLAIMED} jobId=${job.id}`);
      }

      if (batch.length < batchSize) {
        break;
      }
    }

    return { deleted: 0, updated };
  }

  async cleanupStaleExportJobs(): Promise<{
    deleted: number;
    updated: number;
  }> {
    const batchSize = this.getBatchSize();
    const timeoutMinutes = this.getExportJobTimeoutMinutes();
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    let updated = 0;

    while (true) {
      const batch = await this.prisma.exportJob.findMany({
        where: {
          status: JobStatus.PROCESSING,
          updatedAt: { lt: cutoff },
        },
        select: { id: true, tenant: { select: { status: true } } },
        take: batchSize,
      });

      if (batch.length === 0) {
        break;
      }

      for (const job of batch) {
        // Same suspension guard as stale import jobs: park instead of re-queue.
        if (this.isTenantInactive(job.tenant.status)) {
          const parked = await this.prisma.exportJob.updateMany({
            where: {
              id: job.id,
              status: JobStatus.PROCESSING,
              updatedAt: { lt: cutoff },
            },
            data: {
              status: JobStatus.FAILED,
              errorMessage: TENANT_INACTIVE_JOB_MESSAGE,
              completedAt: new Date(),
            },
          });

          if (parked.count === 1) {
            updated += 1;
            this.logger.warn(
              `${STALE_EXPORT_JOB_RECLAIMED} jobId=${job.id} tenantInactive=true`,
            );
          }

          continue;
        }

        const reclaimed = await this.prisma.exportJob.updateMany({
          where: {
            id: job.id,
            status: JobStatus.PROCESSING,
            updatedAt: { lt: cutoff },
          },
          data: {
            status: JobStatus.PENDING,
            progress: 0,
            rowCount: null,
            fileAssetId: null,
            errorMessage: null,
            completedAt: null,
          },
        });

        if (reclaimed.count !== 1) {
          continue;
        }

        await this.queueService.requeueExportJob(job.id);
        updated += 1;

        this.logger.warn(`${STALE_EXPORT_JOB_RECLAIMED} jobId=${job.id}`);
      }

      if (batch.length < batchSize) {
        break;
      }
    }

    return { deleted: 0, updated };
  }

  async cleanupExpiredSessions(): Promise<{
    deleted: number;
    updated: number;
  }> {
    const batchSize = this.getBatchSize();
    const retentionDays = this.getSessionRetentionDays();
    const purgeBefore = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
    let deleted = 0;

    while (true) {
      const batch = await this.prisma.userSession.findMany({
        where: {
          expiresAt: { lt: purgeBefore },
        },
        select: { id: true },
        take: batchSize,
      });

      if (batch.length === 0) {
        break;
      }

      const result = await this.prisma.userSession.deleteMany({
        where: {
          id: { in: batch.map((session) => session.id) },
        },
      });

      deleted += result.count;

      if (batch.length < batchSize) {
        break;
      }
    }

    return { deleted, updated: 0 };
  }

  async cleanupOrphanS3Objects(): Promise<{
    deleted: number;
    updated: number;
  }> {
    const batchSize = this.getBatchSize();
    let deleted = 0;
    let continuationToken: string | undefined;

    do {
      const listing = await this.storageService.listObjectKeys({
        prefix: S3_TENANT_PREFIX,
        continuationToken,
        maxKeys: batchSize,
      });

      if (listing.keys.length > 0) {
        const [assets, intents] = await Promise.all([
          this.prisma.fileAsset.findMany({
            where: { objectKey: { in: listing.keys } },
            select: { objectKey: true },
          }),
          this.prisma.fileUploadIntent.findMany({
            where: { objectKey: { in: listing.keys } },
            select: { objectKey: true },
          }),
        ]);

        const knownKeys = new Set([
          ...assets.map((asset) => asset.objectKey),
          ...intents.map((intent) => intent.objectKey),
        ]);

        for (const objectKey of listing.keys) {
          if (knownKeys.has(objectKey)) {
            continue;
          }

          await this.storageService.deleteFile(objectKey);
          this.storageLoggingService.orphanCleanup({ objectKey });
          deleted += 1;
        }
      }

      continuationToken = listing.nextContinuationToken;
    } while (continuationToken);

    return { deleted, updated: 0 };
  }

  private isTenantInactive(status: TenantStatus): boolean {
    return (
      status === TenantStatus.SUSPENDED || status === TenantStatus.CANCELLED
    );
  }

  private getBatchSize(): number {
    return (
      this.configService.get<number>(CLEANUP_CONFIG_KEYS.batchSize) ??
      DEFAULT_CLEANUP_BATCH_SIZE
    );
  }

  private getUploadIntentTtlMinutes(): number {
    return (
      this.configService.get<number>(
        CLEANUP_CONFIG_KEYS.uploadIntentTtlMinutes,
      ) ?? DEFAULT_UPLOAD_INTENT_TTL_MINUTES
    );
  }

  private getImportJobTimeoutMinutes(): number {
    return (
      this.configService.get<number>(
        CLEANUP_CONFIG_KEYS.importJobTimeoutMinutes,
      ) ?? DEFAULT_IMPORT_JOB_TIMEOUT_MINUTES
    );
  }

  private getExportJobTimeoutMinutes(): number {
    return (
      this.configService.get<number>(
        CLEANUP_CONFIG_KEYS.exportJobTimeoutMinutes,
      ) ?? DEFAULT_EXPORT_JOB_TIMEOUT_MINUTES
    );
  }

  private getSessionRetentionDays(): number {
    return (
      this.configService.get<number>(
        CLEANUP_CONFIG_KEYS.sessionRetentionDays,
      ) ?? DEFAULT_SESSION_RETENTION_DAYS
    );
  }
}
