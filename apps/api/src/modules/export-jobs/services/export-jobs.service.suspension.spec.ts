import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  TenantInactiveException,
  TenantStatusService,
} from '../../../common/tenant/tenant-status.service';
import { FilesService } from '../../files/files.service';
import { DomainEventBus } from '../../../common/events/domain-event-bus.service';
import { NotificationTriggerService } from '../../notifications/notification-trigger.service';
import { QueueService } from '../../jobs/queues/queue.service';
import { AuditWriterService } from '../../audit/audit-writer.service';
import { CsvExportService } from './csv-export.service';
import { ExportJobsService } from './export-jobs.service';
import { LeadExportService } from './lead-export.service';

describe('ExportJobsService tenant suspension', () => {
  let service: ExportJobsService;
  let tenantStatusService: { assertTenantActive: jest.Mock };
  let prisma: {
    exportJob: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    tenantStatusService = {
      assertTenantActive: jest.fn(),
    };

    prisma = {
      exportJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          status: JobStatus.PENDING,
          tenantId: 'tenant-1',
          createdByUserId: 'user-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportJobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FilesService, useValue: {} },
        { provide: LeadExportService, useValue: {} },
        { provide: CsvExportService, useValue: {} },
        { provide: QueueService, useValue: {} },
        { provide: DomainEventBus, useValue: { publish: jest.fn() } },
        {
          provide: NotificationTriggerService,
          useValue: { notifyExportCompleted: jest.fn() },
        },
        { provide: TenantStatusService, useValue: tenantStatusService },
        {
          provide: AuditWriterService,
          useValue: { createAuditLog: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ExportJobsService);
  });

  it('fails export job when tenant is inactive without throwing', async () => {
    tenantStatusService.assertTenantActive.mockRejectedValue(
      new TenantInactiveException(),
    );

    await expect(service.processExportJob('job-1')).resolves.toBeUndefined();

    expect(prisma.exportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1' }) as Record<
          string,
          unknown
        >,
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          errorMessage: 'Tenant is inactive.',
        }) as Record<string, unknown>,
      }),
    );
  });
});
