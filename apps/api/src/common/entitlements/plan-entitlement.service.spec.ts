import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  PLAN_FEATURES,
  FEATURE_UNAVAILABLE_MESSAGE,
} from './entitlement.constants';
import { PlanEntitlementService } from './plan-entitlement.service';

describe('PlanEntitlementService', () => {
  let service: PlanEntitlementService;
  let prisma: {
    tenant: { findFirst: jest.Mock };
    tenantContract: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findFirst: jest.fn(),
      },
      // Default: no active contract snapshot -> live plan fallback.
      tenantContract: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanEntitlementService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PlanEntitlementService);
  });

  it('blocks analytics for Starter plan', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      subscriptionPlan: {
        featureFlags: {
          analytics: false,
          importExport: false,
        },
      },
    });

    await expect(
      service.assertFeatureEnabled('tenant-1', PLAN_FEATURES.ANALYTICS),
    ).rejects.toThrow(new ForbiddenException(FEATURE_UNAVAILABLE_MESSAGE));
  });

  it('allows analytics for Growth plan', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      subscriptionPlan: {
        featureFlags: {
          analytics: true,
          importExport: true,
        },
      },
    });

    await expect(
      service.assertFeatureEnabled('tenant-1', PLAN_FEATURES.ANALYTICS),
    ).resolves.toBeUndefined();
  });

  it('blocks import/export for Starter plan', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      subscriptionPlan: {
        featureFlags: {
          analytics: false,
          importExport: false,
        },
      },
    });

    await expect(
      service.assertFeatureEnabled('tenant-1', PLAN_FEATURES.IMPORT_EXPORT),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prefers snapshot feature flags over the live plan', async () => {
    prisma.tenantContract.findFirst.mockResolvedValueOnce({
      planSnapshot: {
        planId: 'plan-1',
        name: 'Frozen at signing',
        quotas: {
          maxUsers: null,
          maxLeads: null,
          maxProjects: null,
          maxStorageBytes: null,
        },
        featureFlags: { analytics: true, importExport: false },
        capturedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    // The live plan was edited after signing and would now block analytics.
    prisma.tenant.findFirst.mockResolvedValue({
      subscriptionPlan: {
        featureFlags: { analytics: false, importExport: false },
      },
    });

    await expect(
      service.assertFeatureEnabled('tenant-1', PLAN_FEATURES.ANALYTICS),
    ).resolves.toBeUndefined();

    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the live plan when the contract has no snapshot', async () => {
    prisma.tenantContract.findFirst.mockResolvedValueOnce({
      planSnapshot: null,
    });
    prisma.tenant.findFirst.mockResolvedValue({
      subscriptionPlan: {
        featureFlags: { analytics: true, importExport: true },
      },
    });

    await expect(
      service.assertFeatureEnabled('tenant-1', PLAN_FEATURES.ANALYTICS),
    ).resolves.toBeUndefined();

    expect(prisma.tenant.findFirst).toHaveBeenCalled();
  });
});
