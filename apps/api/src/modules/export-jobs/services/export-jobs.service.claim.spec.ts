import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantStatusService } from '../../../common/tenant/tenant-status.service';
import { FilesService } from '../../files/files.service';
import { DomainEventBus } from '../../../common/events/domain-event-bus.service';
import { NotificationTriggerService } from '../../notifications/notification-trigger.service';
import { QueueService } from '../../jobs/queues/queue.service';
import { AuditWriterService } from '../../audit/audit-writer.service';
import { CsvExportService } from './csv-export.service';
import { ExportJobsService } from './export-jobs.service';
import { LeadExportService } from './lead-export.service';

describe('ExportJobsService job claiming', () => {
  let service: ExportJobsService;
  let leadExportService: { fetchAllForExport: jest.Mock };
  let filesService: { createServerGeneratedFile: jest.Mock };
  let csvExportService: { generateCsv: jest.Mock };
  let prisma: {
    exportJob: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    leadExportService = {
      fetchAllForExport: jest.fn(),
    };
    filesService = {
      createServerGeneratedFile: jest.fn().mockResolvedValue({ id: 'file-1' }),
    };
    csvExportService = {
      generateCsv: jest.fn().mockReturnValue(Buffer.from('csv')),
    };

    prisma = {
      exportJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.PENDING,
          tenantId: 'tenant-1',
          createdByUserId: 'user-1',
        }),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportJobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FilesService, useValue: filesService },
        { provide: LeadExportService, useValue: leadExportService },
        { provide: CsvExportService, useValue: csvExportService },
        { provide: QueueService, useValue: {} },
        { provide: DomainEventBus, useValue: { publish: jest.fn() } },
        {
          provide: NotificationTriggerService,
          useValue: { notifyExportCompleted: jest.fn() },
        },
        {
          provide: TenantStatusService,
          useValue: {
            assertTenantActive: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditWriterService,
          useValue: { createAuditLog: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ExportJobsService);
  });

  it('claims pending jobs atomically before processing', async () => {
    prisma.exportJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.exportJob.findFirst.mockResolvedValue({
      id: 'job-1',
      format: 'CSV',
      filters: { sortOrder: 'desc' },
      exportType: 'LEADS',
    });
    leadExportService.fetchAllForExport.mockResolvedValue([]);

    await service.processExportJob('job-1');

    expect(prisma.exportJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: JobStatus.PENDING },
      data: {
        status: JobStatus.PROCESSING,
        progress: 5,
        errorMessage: null,
      },
    });
    expect(leadExportService.fetchAllForExport).toHaveBeenCalled();
  });

  it('exits without processing when the job was already claimed', async () => {
    await service.processExportJob('job-1');

    expect(prisma.exportJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: JobStatus.PENDING },
      data: {
        status: JobStatus.PROCESSING,
        progress: 5,
        errorMessage: null,
      },
    });
    expect(leadExportService.fetchAllForExport).not.toHaveBeenCalled();
    expect(prisma.exportJob.findFirst).not.toHaveBeenCalled();
  });
});
