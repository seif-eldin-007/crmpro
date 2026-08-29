import { Test, TestingModule } from '@nestjs/testing';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { BullService } from '../../jobs/bull/bull.service';
import { CleanupJobName } from '../cleanup.constants';
import { CleanupService } from '../cleanup.service';
import { CleanupProcessor } from './cleanup.processor';

describe('CleanupProcessor', () => {
  let processor: CleanupProcessor;
  let cleanupService: { runCleanup: jest.Mock };

  beforeEach(async () => {
    cleanupService = {
      runCleanup: jest.fn().mockResolvedValue({
        jobName: CleanupJobName.STALE_EXPORT_JOBS,
        deleted: 0,
        updated: 1,
        durationMs: 10,
      }),
    };

    const bullService = {
      getConnectionOptions: jest
        .fn()
        .mockReturnValue({ host: 'localhost', port: 6379 }),
      getPrefix: jest.fn().mockReturnValue('crmpro'),
      getCleanupConcurrency: jest.fn().mockReturnValue(1),
    };

    const workerLoggingService = {
      started: jest.fn(),
      completed: jest.fn(),
      failed: jest.fn(),
      retry: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupProcessor,
        { provide: BullService, useValue: bullService },
        { provide: CleanupService, useValue: cleanupService },
        { provide: WorkerLoggingService, useValue: workerLoggingService },
      ],
    }).compile();

    processor = module.get(CleanupProcessor);
  });

  it('executes cleanup through CleanupService', async () => {
    await (
      processor as unknown as {
        handleJob: (job: {
          data: { jobName: CleanupJobName };
        }) => Promise<void>;
      }
    ).handleJob({
      data: { jobName: CleanupJobName.STALE_EXPORT_JOBS },
    });

    expect(cleanupService.runCleanup).toHaveBeenCalledWith(
      CleanupJobName.STALE_EXPORT_JOBS,
    );
  });
});
