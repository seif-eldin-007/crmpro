import { Injectable, Logger } from '@nestjs/common';
import { BullService } from '../bull/bull.service';
import {
  CLEANUP_QUEUE,
  EXPORT_QUEUE,
  IMPORT_QUEUE,
} from '../bull/bull.constants';
import { BackgroundJobPayload, CleanupJobPayload } from '../bull/bull.types';
import { CleanupJobName } from '../../cleanup/cleanup.constants';
import { RequestContextService } from '../../../common/logging/request-context.service';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';

export interface CleanupRepeatOptions {
  every?: number;
  pattern?: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly bullService: BullService,
    private readonly requestContext: RequestContextService,
    private readonly workerLoggingService: WorkerLoggingService,
  ) {}

  async enqueueImportJob(jobId: string): Promise<void> {
    const payload = this.buildBackgroundPayload(jobId);

    await this.bullService
      .getQueue(IMPORT_QUEUE)
      .add('process-import', payload, {
        jobId,
      });

    this.workerLoggingService.queued({
      queue: IMPORT_QUEUE,
      jobId,
      requestId: payload.requestId,
    });

    this.logger.log(`Import queued: jobId=${jobId}`);
  }

  async enqueueExportJob(jobId: string): Promise<void> {
    const payload = this.buildBackgroundPayload(jobId);

    await this.bullService
      .getQueue(EXPORT_QUEUE)
      .add('process-export', payload, {
        jobId,
      });

    this.workerLoggingService.queued({
      queue: EXPORT_QUEUE,
      jobId,
      requestId: payload.requestId,
    });

    this.logger.log(`Export queued: jobId=${jobId}`);
  }

  async requeueImportJob(jobId: string): Promise<void> {
    await this.removeQueueJobIfPresent(IMPORT_QUEUE, jobId);
    await this.enqueueImportJob(jobId);
  }

  async requeueExportJob(jobId: string): Promise<void> {
    await this.removeQueueJobIfPresent(EXPORT_QUEUE, jobId);
    await this.enqueueExportJob(jobId);
  }

  async enqueueCleanupJob(jobName: CleanupJobName): Promise<void> {
    const payload: CleanupJobPayload = {
      jobName,
      requestId: this.requestContext.getRequestId(),
    };

    await this.bullService.getQueue(CLEANUP_QUEUE).add('cleanup', payload, {
      jobId: `cleanup-${jobName}-${Date.now()}`,
    });

    this.workerLoggingService.queued({
      queue: CLEANUP_QUEUE,
      jobId: jobName,
      requestId: payload.requestId,
    });

    this.logger.log(`Cleanup queued: jobName=${jobName}`);
  }

  async registerCleanupRepeatableJob(
    jobName: CleanupJobName,
    repeat: CleanupRepeatOptions,
  ): Promise<void> {
    const payload: CleanupJobPayload = { jobName };

    await this.bullService.getQueue(CLEANUP_QUEUE).add('cleanup', payload, {
      jobId: `repeat-cleanup-${jobName}`,
      repeat,
    });

    this.logger.log(
      `Cleanup repeatable job registered: jobName=${jobName} repeat=${JSON.stringify(repeat)}`,
    );
  }

  private buildBackgroundPayload(jobId: string): BackgroundJobPayload {
    const requestId = this.requestContext.getRequestId();
    return requestId ? { jobId, requestId } : { jobId };
  }

  private async removeQueueJobIfPresent(
    queueName: typeof IMPORT_QUEUE | typeof EXPORT_QUEUE,
    jobId: string,
  ): Promise<void> {
    const queue = this.bullService.getQueue(queueName);
    const existing = await queue.getJob(jobId);

    if (!existing) {
      return;
    }

    try {
      await existing.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not remove existing ${queueName} job ${jobId} before requeue: ${message}`,
      );
    }
  }
}
