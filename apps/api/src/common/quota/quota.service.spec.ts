import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { QUOTA_EXCEEDED_MESSAGES } from './quota.constants';
import { QuotaService } from './quota.service';

describe('QuotaService', () => {
  let service: QuotaService;
  let prisma: {
    tenant: { findFirst: jest.Mock };
    tenantContract: { findFirst: jest.Mock };
    lead: { count: jest.Mock };
    project: { count: jest.Mock };
    user: { count: jest.Mock };
  };

  const starterPlan = {
    maxUsers: 5,
    maxLeads: 2,
    maxProjects: 10,
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({
          subscriptionPlan: starterPlan,
        }),
      },
      // Default: no active contract snapshot -> live plan fallback.
      tenantContract: { findFirst: jest.fn().mockResolvedValue(null) },
      lead: { count: jest.fn() },
      project: { count: jest.fn() },
      user: { count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotaService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(QuotaService);
  });

  describe('assertCanCreateLead', () => {
    it('allows creation when below Starter lead limit', async () => {
      prisma.lead.count.mockResolvedValue(1);

      await expect(
        service.assertCanCreateLead('tenant-1'),
      ).resolves.toBeUndefined();
    });

    it('rejects creation when at Starter lead limit', async () => {
      prisma.lead.count.mockResolvedValue(2);

      await expect(service.assertCanCreateLead('tenant-1')).rejects.toThrow(
        new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.LEAD),
      );
    });

    it('allows unlimited leads when plan limit is null', async () => {
      prisma.tenant.findFirst.mockResolvedValue({
        subscriptionPlan: { ...starterPlan, maxLeads: null },
      });
      prisma.lead.count.mockResolvedValue(1_000_000);

      await expect(
        service.assertCanCreateLead('tenant-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('canCreateLead', () => {
    it('returns false when quota exceeded', async () => {
      prisma.lead.count.mockResolvedValue(2);

      await expect(service.canCreateLead('tenant-1')).resolves.toBe(false);
    });
  });

  describe('assertCanCreateProject', () => {
    it('rejects creation when at project limit', async () => {
      prisma.project.count.mockResolvedValue(10);

      await expect(service.assertCanCreateProject('tenant-1')).rejects.toThrow(
        new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.PROJECT),
      );
    });
  });

  describe('assertCanCreateUser', () => {
    it('rejects creation when at user limit', async () => {
      prisma.user.count.mockResolvedValue(5);

      await expect(service.assertCanCreateUser('tenant-1')).rejects.toThrow(
        new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.USER),
      );
    });
  });

  it('throws when tenant is not found', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);

    await expect(service.assertCanCreateLead('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('plan snapshot precedence', () => {
    const frozenSnapshot = {
      planId: 'plan-1',
      name: 'Frozen at signing',
      price: null,
      currency: null,
      quotas: {
        maxUsers: 50,
        maxLeads: 100,
        maxProjects: 5,
        maxStorageBytes: null,
      },
      featureFlags: {},
      capturedAt: '2026-01-01T00:00:00.000Z',
    };

    it('prefers the active contract snapshot over the live plan', async () => {
      prisma.tenantContract.findFirst.mockResolvedValueOnce({
        planSnapshot: frozenSnapshot,
      });
      // Live plan would reject at 2 leads; the snapshot allows 100.
      prisma.lead.count.mockResolvedValue(10);

      await expect(
        service.assertCanCreateLead('tenant-1'),
      ).resolves.toBeUndefined();

      expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to the live plan for legacy contracts without snapshot', async () => {
      prisma.tenantContract.findFirst.mockResolvedValueOnce({
        planSnapshot: null,
      });
      prisma.lead.count.mockResolvedValue(2);

      await expect(service.assertCanCreateLead('tenant-1')).rejects.toThrow(
        new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.LEAD),
      );

      expect(prisma.tenant.findFirst).toHaveBeenCalled();
    });
  });

  describe('transaction-safe quota checks', () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]),
      tenant: {
        findFirst: jest.fn().mockResolvedValue({
          storageUsedBytes: 0n,
          subscriptionPlan: starterPlan,
        }),
      },
      tenantContract: { findFirst: jest.fn().mockResolvedValue(null) },
      lead: { count: jest.fn() },
      project: { count: jest.fn() },
      user: { count: jest.fn() },
      fileUploadIntent: { aggregate: jest.fn() },
    };

    it('locks tenant row before counting leads in transaction', async () => {
      tx.lead.count.mockResolvedValue(1);

      await expect(
        service.assertCanCreateLeadInTransaction(tx as never, 'tenant-1'),
      ).resolves.toBeUndefined();

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.lead.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', deletedAt: null },
      });
    });

    it('rejects lead creation in transaction when at limit', async () => {
      tx.lead.count.mockResolvedValue(2);

      await expect(
        service.assertCanCreateLeadInTransaction(tx as never, 'tenant-1'),
      ).rejects.toThrow(new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.LEAD));
    });

    it('uses snapshot storage limits (serialized BigInt) in transaction', async () => {
      tx.tenantContract.findFirst.mockResolvedValueOnce({
        planSnapshot: {
          planId: 'plan-1',
          name: 'Frozen at signing',
          quotas: {
            maxUsers: 5,
            maxLeads: 2,
            maxProjects: 10,
            maxStorageBytes: '100',
          },
          featureFlags: {},
          capturedAt: '2026-01-01T00:00:00.000Z',
        },
      });
      tx.tenant.findFirst.mockResolvedValue({ storageUsedBytes: 80n });
      tx.fileUploadIntent.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 15n },
      });

      await expect(
        service.assertCanUseStorageInTransaction(tx as never, 'tenant-1', 10),
      ).rejects.toThrow('Storage quota exceeded');
    });

    it('rejects storage usage in transaction when projected usage exceeds limit', async () => {
      tx.tenant.findFirst.mockResolvedValue({
        storageUsedBytes: 100n,
        subscriptionPlan: {
          ...starterPlan,
          maxStorageBytes: 150n,
        },
      });
      tx.fileUploadIntent.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 0n },
      });

      await expect(
        service.assertCanUseStorageInTransaction(tx as never, 'tenant-1', 100),
      ).rejects.toThrow('Storage quota exceeded');
    });

    it('includes pending upload intents when checking storage quota', async () => {
      tx.tenant.findFirst.mockResolvedValue({
        storageUsedBytes: 80n,
        subscriptionPlan: {
          ...starterPlan,
          maxStorageBytes: 100n,
        },
      });
      tx.fileUploadIntent.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 15n },
      });

      await expect(
        service.assertCanUseStorageInTransaction(tx as never, 'tenant-1', 10),
      ).rejects.toThrow('Storage quota exceeded');

      expect(tx.fileUploadIntent.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            expiresAt: { gt: expect.any(Date) as Date },
          }) as Record<string, unknown>,
        }),
      );
    });

    it('excludes the completing upload intent from pending storage reservation', async () => {
      tx.tenant.findFirst.mockResolvedValue({
        storageUsedBytes: 80n,
        subscriptionPlan: {
          ...starterPlan,
          maxStorageBytes: 100n,
        },
      });
      tx.fileUploadIntent.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 0n },
      });

      await expect(
        service.assertCanUseStorageInTransaction(tx as never, 'tenant-1', 20, {
          excludeUploadIntentId: 'intent-1',
        }),
      ).resolves.toBeUndefined();

      expect(tx.fileUploadIntent.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'intent-1' },
          }) as Record<string, unknown>,
        }),
      );
    });
  });
});
