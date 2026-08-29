import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { BullService } from '../../jobs/bull/bull.service';
import { NOTIFICATION_QUEUE } from '../../jobs/bull/bull.constants';
import { NotificationDeliveryService } from '../notification-delivery.service';
import { NotificationJobPayload } from '../entities/notification.types';

@Injectable()
export class NotificationProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<NotificationJobPayload>;
  private readonly jobStartTimes = new Map<string, number>();

  constructor(
    private readonly bullService: BullService,
    private readonly deliveryService: NotificationDeliveryService,
    private readonly workerLoggingService: WorkerLoggingService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<NotificationJobPayload>(
      NOTIFICATION_QUEUE,
      async (job) => this.handleJob(job),
      {
        connection: this.bullService.getConnectionOptions(),
        prefix: this.bullService.getPrefix(),
        concurrency: this.bullService.getNotificationConcurrency(),
      },
    );

    this.worker.on('active', (job) => {
      this.jobStartTimes.set(job.id!, Date.now());
      const context = this.buildContext(job);

      if (job.attemptsMade > 0) {
        this.workerLoggingService.retry(context);
        return;
      }

      this.workerLoggingService.started(context);
    });

    this.worker.on('completed', (job) => {
      this.workerLoggingService.completed({
        ...this.buildContext(job),
        durationMs: this.getDurationMs(job.id!),
      });
      this.jobStartTimes.delete(job.id!);
    });

    this.worker.on('failed', (job, error) => {
      if (!job) {
        return;
      }

      this.workerLoggingService.failed({
        ...this.buildContext(job),
        durationMs: this.getDurationMs(job.id!),
        metadata: { error: error.message },
      });
      this.jobStartTimes.delete(job.id!);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
  }

  isRunning(): boolean {
    return this.worker?.isRunning() ?? false;
  }

  private async handleJob(job: Job<NotificationJobPayload>): Promise<void> {
    await this.deliveryService.deliver(job.data);
  }

  private buildContext(job: Job<NotificationJobPayload>) {
    return {
      queue: NOTIFICATION_QUEUE,
      jobId: `${job.data.type}:${job.data.recipientUserId}`,
      requestId: job.data.requestId,
      attempts: job.attemptsMade + 1,
    };
  }

  private getDurationMs(workerJobId: string): number | undefined {
    const startedAt = this.jobStartTimes.get(workerJobId);
    return startedAt ? Date.now() - startedAt : undefined;
  }
}
