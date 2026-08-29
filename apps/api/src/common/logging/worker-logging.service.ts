import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOGGING_CONFIG_KEYS } from './logging.constants';
import { LoggingService } from './logging.service';

export interface WorkerLogContext {
  queue: string;
  jobId: string;
  requestId?: string;
  attempts?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class WorkerLoggingService {
  private readonly enabled: boolean;

  constructor(
    private readonly loggingService: LoggingService,
    configService: ConfigService,
  ) {
    this.enabled =
      configService.get<boolean>(LOGGING_CONFIG_KEYS.enableWorkerLogging) ??
      true;
  }

  queued(context: WorkerLogContext): void {
    this.log('queued', context);
  }

  started(context: WorkerLogContext): void {
    this.log('started', context);
  }

  retry(context: WorkerLogContext): void {
    this.log('retry', context);
  }

  completed(context: WorkerLogContext): void {
    this.log('completed', context);
  }

  failed(context: WorkerLogContext): void {
    this.log('failed', context, 'error');
  }

  private log(
    status: string,
    context: WorkerLogContext,
    level: 'info' | 'error' = 'info',
  ): void {
    if (!this.enabled) {
      return;
    }

    const entry = {
      module: 'Worker',
      operation: context.queue,
      requestId: context.requestId,
      durationMs: context.durationMs,
      status,
      metadata: {
        queue: context.queue,
        jobId: context.jobId,
        attempts: context.attempts,
        ...context.metadata,
      },
    };

    if (level === 'error') {
      this.loggingService.error(entry);
      return;
    }

    this.loggingService.info(entry);
  }
}
