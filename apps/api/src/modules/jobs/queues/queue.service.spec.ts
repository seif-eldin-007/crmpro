import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { RequestContextService } from '../../../common/logging/request-context.service';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { CleanupJobName } from '../../cleanup/cleanup.constants';
import { BullService } from '../bull/bull.service';
import {
  CLEANUP_QUEUE,
  EXPORT_QUEUE,
  IMPORT_QUEUE,
} from '../bull/bull.constants';
import { QueueService } from './queue.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn(),
}));

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
);

type MockQueue = {
  add: jest.Mock;
  close: jest.Mock;
  getJob: jest.Mock;
};

describe('QueueService', () => {
  let queueService: QueueService;
  let importQueue: MockQueue;
  let exportQueue: MockQueue;
  let cleanupQueue: MockQueue;

  beforeEach(async () => {
    importQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    };
    exportQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    };
    cleanupQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    };

    const bullService = {
      getQueue: jest.fn((name: string) => {
        if (name === IMPORT_QUEUE) return importQueue;
        if (name === EXPORT_QUEUE) return exportQueue;
        if (name === CLEANUP_QUEUE) return cleanupQueue;
        throw new Error(`Unknown queue ${name}`);
      }),
    };

    const requestContext = {
      getRequestId: jest.fn().mockReturnValue('req-123'),
    };

    const workerLoggingService = {
      queued: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: BullService, useValue: bullService },
        { provide: RequestContextService, useValue: requestContext },
        { provide: WorkerLoggingService, useValue: workerLoggingService },
      ],
    }).compile();

    queueService = module.get(QueueService);
  });

  it('enqueues import jobs with jobId payload only', async () => {
    await queueService.enqueueImportJob('job-123');

    expect(importQueue.add).toHaveBeenCalledWith(
      'process-import',
      { jobId: 'job-123', requestId: 'req-123' },
      { jobId: 'job-123' },
    );
  });

  it('enqueues export jobs with jobId payload only', async () => {
    await queueService.enqueueExportJob('job-456');

    expect(exportQueue.add).toHaveBeenCalledWith(
      'process-export',
      { jobId: 'job-456', requestId: 'req-123' },
      { jobId: 'job-456' },
    );
  });

  it('enqueues cleanup jobs by jobName', async () => {
    await queueService.enqueueCleanupJob(CleanupJobName.FILE_UPLOAD_INTENTS);

    expect(cleanupQueue.add).toHaveBeenCalledWith(
      'cleanup',
      {
        jobName: CleanupJobName.FILE_UPLOAD_INTENTS,
        requestId: 'req-123',
      },
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^cleanup-FILE_UPLOAD_INTENTS-\d+$/,
        ) as string,
      }),
    );
  });

  it('requeues import jobs after removing any existing queue entry', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    importQueue.getJob.mockResolvedValue({ remove });

    await queueService.requeueImportJob('job-123');

    expect(remove).toHaveBeenCalled();
    expect(importQueue.add).toHaveBeenCalledWith(
      'process-import',
      { jobId: 'job-123', requestId: 'req-123' },
      { jobId: 'job-123' },
    );
  });

  it('registers repeatable cleanup jobs', async () => {
    await queueService.registerCleanupRepeatableJob(
      CleanupJobName.STALE_IMPORT_JOBS,
      { every: 900_000 },
    );

    expect(cleanupQueue.add).toHaveBeenCalledWith(
      'cleanup',
      { jobName: CleanupJobName.STALE_IMPORT_JOBS },
      {
        jobId: 'repeat-cleanup-STALE_IMPORT_JOBS',
        repeat: { every: 900_000 },
      },
    );
  });
});

describe('BullService queue registration', () => {
  it('registers default job retry policy', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'redis.host': 'localhost',
          'redis.port': 6379,
          'bull.prefix': 'crmpro-test',
          'bull.jobAttempts': 3,
          'bull.jobBackoffDelayMs': 3000,
        };
        return values[key];
      }),
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'redis.host': 'localhost',
          'redis.port': 6379,
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BullService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    const bullService = module.get(BullService);
    bullService.onModuleInit();

    expect(Queue).toHaveBeenCalledTimes(4);
    expect(bullService.getDefaultJobOptions()).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: false,
    });

    await bullService.onModuleDestroy();
  });
});
