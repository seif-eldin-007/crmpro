import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TenantInactiveException,
  TenantStatusService,
} from '../../common/tenant/tenant-status.service';
import { StorageService } from '../../common/storage/storage.service';
import { LeadsService } from '../leads/leads.service';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { QueueService } from '../jobs/queues/queue.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { ImportJobsService } from './import-jobs.service';

describe('ImportJobsService tenant suspension', () => {
  let service: ImportJobsService;
  let tenantStatusService: { assertTenantActive: jest.Mock };
  let prisma: {
    importJob: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    tenantStatusService = {
      assertTenantActive: jest.fn(),
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportJobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: LeadsService, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: DomainEventBus, useValue: { publish: jest.fn() } },
        { provide: NotificationTriggerService, useValue: {} },
        { provide: TenantStatusService, useValue: tenantStatusService },
        {
          provide: AuditWriterService,
          useValue: { createAuditLog: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ImportJobsService);
  });

  it('fails import job when tenant is inactive without throwing', async () => {
    tenantStatusService.assertTenantActive.mockRejectedValue(
      new TenantInactiveException(),
    );

    await expect(service.processImportJob('job-1')).resolves.toBeUndefined();

    expect(prisma.importJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1' }) as Record<
          string,
          unknown
        >,
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          errorSummary: [{ row: 0, reason: 'Tenant is inactive.' }],
        }) as Record<string, unknown>,
      }),
    );
  });
});
