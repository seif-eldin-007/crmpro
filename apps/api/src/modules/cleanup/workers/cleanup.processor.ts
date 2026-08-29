import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { BullService } from '../../jobs/bull/bull.service';
import { CLEANUP_QUEUE } from '../../jobs/bull/bull.constants';
import { CleanupJobPayload } from '../../jobs/bull/bull.types';
import { CleanupService } from '../cleanup.service';

@Injectable()
export class CleanupProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<CleanupJobPayload>;
  private readonly jobStartTimes = new Map<string, number>();

  constructor(
    private readonly bullService: BullService,
    private readonly cleanupService: CleanupService,
    private readonly workerLoggingService: WorkerLoggingService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<CleanupJobPayload>(
      CLEANUP_QUEUE,
      async (job) => this.handleJob(job),
      {
        connection: this.bullService.getConnectionOptions(),
        prefix: this.bullService.getPrefix(),
        concurrency: this.bullService.getCleanupConcurrency(),
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

  private async handleJob(job: Job<CleanupJobPayload>): Promise<void> {
    await this.cleanupService.runCleanup(job.data.jobName);
  }

  private buildContext(job: Job<CleanupJobPayload>) {
    return {
      queue: CLEANUP_QUEUE,
      jobId: job.data.jobName,
      requestId: job.data.requestId,
      attempts: job.attemptsMade + 1,
    };
  }

  private getDurationMs(workerJobId: string): number | undefined {
    const startedAt = this.jobStartTimes.get(workerJobId);
    return startedAt ? Date.now() - startedAt : undefined;
  }
}
