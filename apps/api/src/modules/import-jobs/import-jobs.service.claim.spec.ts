import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantStatusService } from '../../common/tenant/tenant-status.service';
import { StorageService } from '../../common/storage/storage.service';
import { LeadsService } from '../leads/leads.service';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { QueueService } from '../jobs/queues/queue.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { ImportJobsService } from './import-jobs.service';

describe('ImportJobsService job claiming', () => {
  let service: ImportJobsService;
  let storageService: { getObject: jest.Mock };
  let prisma: {
    importJob: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    fileAsset: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    storageService = {
      getObject: jest.fn(),
    };

    prisma = {
      importJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.PENDING,
          tenantId: 'tenant-1',
          createdByUserId: 'user-1',
          fileAssetId: 'file-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
      fileAsset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'file-1',
          category: 'IMPORT_FILE',
          objectKey: 'imports/file.csv',
          mimeType: 'text/csv',
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportJobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storageService },
        { provide: LeadsService, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: DomainEventBus, useValue: { publish: jest.fn() } },
        { provide: NotificationTriggerService, useValue: {} },
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

    service = module.get(ImportJobsService);
  });

  it('claims pending jobs atomically before processing', async () => {
    prisma.importJob.updateMany.mockResolvedValue({ count: 1 });
    storageService.getObject.mockResolvedValue(
      Buffer.from('fullName,primaryPhone\nJane Doe,+201000000000'),
    );

    await service.processImportJob('job-1');

    expect(prisma.importJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: JobStatus.PENDING },
      data: { status: JobStatus.PROCESSING },
    });
    expect(storageService.getObject).toHaveBeenCalled();
  });

  it('exits without processing when the job was already claimed', async () => {
    await service.processImportJob('job-1');

    expect(prisma.importJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: JobStatus.PENDING },
      data: { status: JobStatus.PROCESSING },
    });
    expect(storageService.getObject).not.toHaveBeenCalled();
    expect(prisma.importJob.update).not.toHaveBeenCalled();
  });
});
