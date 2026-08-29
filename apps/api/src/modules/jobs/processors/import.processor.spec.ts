import { Test, TestingModule } from '@nestjs/testing';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { ImportJobsService } from '../../import-jobs/import-jobs.service';
import { BullService } from '../bull/bull.service';
import { ImportProcessor } from './import.processor';

describe('ImportProcessor', () => {
  let processor: ImportProcessor;
  let importJobsService: {
    processImportJob: jest.Mock;
    failImportJobIfActive: jest.Mock;
  };

  beforeEach(async () => {
    importJobsService = {
      processImportJob: jest.fn().mockResolvedValue(undefined),
      failImportJobIfActive: jest.fn().mockResolvedValue(undefined),
    };

    const bullService = {
      getConnectionOptions: jest
        .fn()
        .mockReturnValue({ host: 'localhost', port: 6379 }),
      getPrefix: jest.fn().mockReturnValue('crmpro'),
      getImportConcurrency: jest.fn().mockReturnValue(3),
      getDefaultJobOptions: jest.fn().mockReturnValue({ attempts: 3 }),
    };

    const workerLoggingService = {
      started: jest.fn(),
      completed: jest.fn(),
      failed: jest.fn(),
      retry: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportProcessor,
        { provide: BullService, useValue: bullService },
        { provide: ImportJobsService, useValue: importJobsService },
        { provide: WorkerLoggingService, useValue: workerLoggingService },
      ],
    }).compile();

    processor = module.get(ImportProcessor);
  });

  it('executes import processing through ImportJobsService', async () => {
    await (
      processor as unknown as {
        handleJob: (job: { data: { jobId: string } }) => Promise<void>;
      }
    ).handleJob({
      data: { jobId: 'import-job-1' },
    });

    expect(importJobsService.processImportJob).toHaveBeenCalledWith(
      'import-job-1',
    );
  });
});
