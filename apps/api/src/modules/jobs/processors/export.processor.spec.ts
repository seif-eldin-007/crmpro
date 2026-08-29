import { Test, TestingModule } from '@nestjs/testing';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { ExportJobsService } from '../../export-jobs/services/export-jobs.service';
import { BullService } from '../bull/bull.service';
import { ExportProcessor } from './export.processor';

describe('ExportProcessor', () => {
  let processor: ExportProcessor;
  let exportJobsService: {
    processExportJob: jest.Mock;
    failExportJobIfActive: jest.Mock;
  };

  beforeEach(async () => {
    exportJobsService = {
      processExportJob: jest.fn().mockResolvedValue(undefined),
      failExportJobIfActive: jest.fn().mockResolvedValue(undefined),
    };

    const bullService = {
      getConnectionOptions: jest
        .fn()
        .mockReturnValue({ host: 'localhost', port: 6379 }),
      getPrefix: jest.fn().mockReturnValue('crmpro'),
      getExportConcurrency: jest.fn().mockReturnValue(2),
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
        ExportProcessor,
        { provide: BullService, useValue: bullService },
        { provide: ExportJobsService, useValue: exportJobsService },
        { provide: WorkerLoggingService, useValue: workerLoggingService },
      ],
    }).compile();

    processor = module.get(ExportProcessor);
  });

  it('executes export processing through ExportJobsService', async () => {
    await (
      processor as unknown as {
        handleJob: (job: { data: { jobId: string } }) => Promise<void>;
      }
    ).handleJob({
      data: { jobId: 'export-job-1' },
    });

    expect(exportJobsService.processExportJob).toHaveBeenCalledWith(
      'export-job-1',
    );
  });
});
