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
  let prisma: { tenant: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findFirst: jest.fn(),
      },
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
});
