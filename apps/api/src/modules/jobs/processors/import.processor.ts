import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { ImportJobsService } from '../../import-jobs/import-jobs.service';
import { BullService } from '../bull/bull.service';
import { IMPORT_QUEUE } from '../bull/bull.constants';
import { BackgroundJobPayload } from '../bull/bull.types';

@Injectable()
export class ImportProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<BackgroundJobPayload>;
  private readonly jobStartTimes = new Map<string, number>();

  constructor(
    private readonly bullService: BullService,
    private readonly importJobsService: ImportJobsService,
    private readonly workerLoggingService: WorkerLoggingService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<BackgroundJobPayload>(
      IMPORT_QUEUE,
      async (job) => this.handleJob(job),
      {
        connection: this.bullService.getConnectionOptions(),
        prefix: this.bullService.getPrefix(),
        concurrency: this.bullService.getImportConcurrency(),
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

      if (this.hasExhaustedRetries(job)) {
        void this.importJobsService.failImportJobIfActive(
          job.data.jobId,
          error.message,
        );
      }
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

  private async handleJob(job: Job<BackgroundJobPayload>): Promise<void> {
    await this.importJobsService.processImportJob(job.data.jobId);
  }

  private buildContext(job: Job<BackgroundJobPayload>) {
    return {
      queue: IMPORT_QUEUE,
      jobId: job.data.jobId,
      requestId: job.data.requestId,
      attempts: job.attemptsMade + 1,
    };
  }

  private getDurationMs(workerJobId: string): number | undefined {
    const startedAt = this.jobStartTimes.get(workerJobId);
    return startedAt ? Date.now() - startedAt : undefined;
  }

  private hasExhaustedRetries(job: Job<BackgroundJobPayload>): boolean {
    const maxAttempts =
      job.opts.attempts ??
      this.bullService.getDefaultJobOptions()?.attempts ??
      3;
    return job.attemptsMade >= maxAttempts;
  }
}
