import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus, TenantStatus } from '@crmpro/database';
import { LoggingService } from '../../common/logging/logging.service';
import { RequestContextService } from '../../common/logging/request-context.service';
import { StorageLoggingService } from '../../common/logging/storage-logging.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { QueueService } from '../jobs/queues/queue.service';
import { CleanupJobName } from './cleanup.constants';
import { CleanupHealthService } from './cleanup-health.service';
import { CleanupService } from './cleanup.service';

describe('CleanupService', () => {
  let service: CleanupService;
  let queueService: {
    requeueImportJob: jest.Mock;
    requeueExportJob: jest.Mock;
  };
  let prisma: {
    fileUploadIntent: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    importJob: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    exportJob: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    userSession: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    fileAsset: {
      findMany: jest.Mock;
    };
  };
  let storageService: {
    listObjectKeys: jest.Mock;
    deleteFile: jest.Mock;
  };

  const configValues: Record<string, number> = {
    'cleanup.batchSize': 2,
    'cleanup.uploadIntentTtlMinutes': 60,
    'cleanup.importJobTimeoutMinutes': 15,
    'cleanup.exportJobTimeoutMinutes': 15,
    'cleanup.sessionRetentionDays': 0,
  };

  beforeEach(async () => {
    queueService = {
      requeueImportJob: jest.fn().mockResolvedValue(undefined),
      requeueExportJob: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      fileUploadIntent: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      importJob: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      exportJob: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      userSession: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      fileAsset: {
        findMany: jest.fn(),
      },
    };

    storageService = {
      listObjectKeys: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupService,
        CleanupHealthService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storageService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), error: jest.fn() },
        },
        {
          provide: RequestContextService,
          useValue: { getRequestId: jest.fn() },
        },
        {
          provide: StorageLoggingService,
          useValue: { orphanCleanup: jest.fn() },
        },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get(CleanupService);
  });

  it('deletes expired upload intents in batches', async () => {
    prisma.fileUploadIntent.findMany
      .mockResolvedValueOnce([{ id: 'intent-1' }, { id: 'intent-2' }])
      .mockResolvedValueOnce([]);
    prisma.fileUploadIntent.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.cleanupExpiredUploadIntents();

    expect(result.deleted).toBe(2);
    expect(prisma.fileUploadIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
  });

  it('reclaims stale import jobs and requeues them', async () => {
    prisma.importJob.findMany.mockResolvedValueOnce([
      { id: 'import-1', tenant: { status: TenantStatus.ACTIVE } },
    ]);
    prisma.importJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cleanupStaleImportJobs();

    expect(result.updated).toBe(1);
    expect(prisma.importJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'import-1',
          status: JobStatus.PROCESSING,
        }) as Record<string, unknown>,
        data: expect.objectContaining({
          status: JobStatus.PENDING,
          processedRows: 0,
          successfulRows: 0,
          failedRows: 0,
          totalRows: 0,
          completedAt: null,
        }) as Record<string, unknown>,
      }),
    );
    expect(queueService.requeueImportJob).toHaveBeenCalledWith('import-1');
  });

  it('parks stale import jobs of suspended tenants as failed without requeue', async () => {
    prisma.importJob.findMany.mockResolvedValueOnce([
      { id: 'import-2', tenant: { status: TenantStatus.SUSPENDED } },
    ]);
    prisma.importJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cleanupStaleImportJobs();

    expect(result.updated).toBe(1);
    expect(prisma.importJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobStatus.FAILED,
        }) as Record<string, unknown>,
      }),
    );
    expect(queueService.requeueImportJob).not.toHaveBeenCalled();
  });

  it('reclaims stale export jobs and requeues them', async () => {
    prisma.exportJob.findMany.mockResolvedValueOnce([
      { id: 'export-1', tenant: { status: TenantStatus.ACTIVE } },
    ]);
    prisma.exportJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cleanupStaleExportJobs();

    expect(result.updated).toBe(1);
    expect(prisma.exportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'export-1',
          status: JobStatus.PROCESSING,
        }) as Record<string, unknown>,
        data: expect.objectContaining({
          status: JobStatus.PENDING,
          progress: 0,
          errorMessage: null,
          completedAt: null,
        }) as Record<string, unknown>,
      }),
    );
    expect(queueService.requeueExportJob).toHaveBeenCalledWith('export-1');
  });

  it('parks stale export jobs of cancelled tenants as failed without requeue', async () => {
    prisma.exportJob.findMany.mockResolvedValueOnce([
      { id: 'export-2', tenant: { status: TenantStatus.CANCELLED } },
    ]);
    prisma.exportJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cleanupStaleExportJobs();

    expect(result.updated).toBe(1);
    expect(prisma.exportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: JobStatus.FAILED,
          errorMessage: expect.stringContaining(
            'suspended or cancelled',
          ) as string,
        }) as Record<string, unknown>,
      }),
    );
    expect(queueService.requeueExportJob).not.toHaveBeenCalled();
  });

  it('deletes expired sessions', async () => {
    prisma.userSession.findMany.mockResolvedValueOnce([{ id: 'session-1' }]);
    prisma.userSession.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.cleanupExpiredSessions();

    expect(result.deleted).toBe(1);
    expect(prisma.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { expiresAt: { lt: expect.any(Date) as Date } },
      }),
    );
  });

  it('deletes orphan S3 objects not referenced in the database', async () => {
    storageService.listObjectKeys
      .mockResolvedValueOnce({
        keys: ['tenant/a/file.csv', 'tenant/a/orphan.csv'],
      })
      .mockResolvedValueOnce({ keys: [] });
    prisma.fileAsset.findMany.mockResolvedValue([
      { objectKey: 'tenant/a/file.csv' },
    ]);
    prisma.fileUploadIntent.findMany.mockResolvedValue([]);
    storageService.deleteFile.mockResolvedValue(undefined);

    const result = await service.cleanupOrphanS3Objects();

    expect(result.deleted).toBe(1);
    expect(storageService.deleteFile).toHaveBeenCalledWith(
      'tenant/a/orphan.csv',
    );
    expect(storageService.deleteFile).not.toHaveBeenCalledWith(
      'tenant/a/file.csv',
    );
  });

  it('is idempotent when stale import jobs are already reclaimed', async () => {
    prisma.importJob.findMany.mockResolvedValue([]);

    const first = await service.cleanupStaleImportJobs();
    const second = await service.cleanupStaleImportJobs();

    expect(first.updated).toBe(0);
    expect(second.updated).toBe(0);
  });

  it('runs cleanup through runCleanup and records health', async () => {
    prisma.fileUploadIntent.findMany.mockResolvedValueOnce([]);
    prisma.fileUploadIntent.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.runCleanup(CleanupJobName.FILE_UPLOAD_INTENTS);

    expect(result.jobName).toBe(CleanupJobName.FILE_UPLOAD_INTENTS);
    expect(result.deleted).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
