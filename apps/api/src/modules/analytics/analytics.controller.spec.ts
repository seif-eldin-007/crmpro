import { CanActivate, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { PermissionsGuard } from '../../common/auth/guards/permissions.guard';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { PlanEntitlementGuard } from '../../common/entitlements/guards/plan-entitlement.guard';
import { PlanEntitlementService } from '../../common/entitlements/plan-entitlement.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AnalyticsAggregatorService } from './analytics-aggregator.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

const mockGuard: CanActivate = { canActivate: jest.fn().mockReturnValue(true) };

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: {
    getOverview: jest.Mock;
    getRecentActivity: jest.Mock;
    getTrendAnalytics: jest.Mock;
    getTeamAnalytics: jest.Mock;
    getActivityFeed: jest.Mock;
  };
  let aggregatorService: { getDashboard: jest.Mock };
  let permissionsService: { getPermissionKeysForUser: jest.Mock };
  let planEntitlementService: { assertFeatureEnabled: jest.Mock };

  const user = {
    id: 'user-1',
    tenantId: 'tenant-1',
  } as AuthenticatedUser;

  beforeEach(async () => {
    analyticsService = {
      getOverview: jest.fn().mockResolvedValue({
        data: { totalLeads: 5 },
        cacheHit: false,
      }),
      getRecentActivity: jest.fn().mockResolvedValue({
        data: {
          items: [],
          page: 1,
          limit: 20,
          totalItems: 0,
          totalPages: 1,
        },
        cacheHit: true,
      }),
      getTrendAnalytics: jest.fn().mockResolvedValue({
        data: {
          leadCreation: [],
          leadClosing: [],
        },
        cacheHit: false,
      }),
      getTeamAnalytics: jest.fn().mockResolvedValue({
        data: { topPerformers: [] },
        cacheHit: false,
      }),
      getActivityFeed: jest.fn().mockResolvedValue({
        data: [],
        cacheHit: false,
      }),
    };
    aggregatorService = {
      getDashboard: jest.fn().mockResolvedValue({
        overview: { totalLeads: 5 },
        pipeline: { stages: [] },
      }),
    };
    permissionsService = {
      getPermissionKeysForUser: jest
        .fn()
        .mockResolvedValue(new Set([PERMISSIONS.LEAD_READ])),
    };
    planEntitlementService = {
      assertFeatureEnabled: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: AnalyticsAggregatorService, useValue: aggregatorService },
        { provide: PermissionsService, useValue: permissionsService },
        {
          provide: PlanEntitlementService,
          useValue: planEntitlementService,
        },
        PlanEntitlementGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(AnalyticsController);
  });

  it('returns overview wrapped in success response', async () => {
    await expect(
      controller.getOverview(user, { from: '2026-01-01', to: '2026-06-30' }),
    ).resolves.toEqual({
      success: true,
      data: { totalLeads: 5 },
    });

    expect(analyticsService.getOverview).toHaveBeenCalledWith('tenant-1', {
      from: expect.any(Date) as Date,
      to: expect.any(Date) as Date,
    });
  });

  it('returns permission-aware dashboard payload', async () => {
    await expect(
      controller.getDashboard(user, { range: '30d' }),
    ).resolves.toEqual({
      success: true,
      data: {
        overview: { totalLeads: 5 },
        pipeline: { stages: [] },
      },
    });

    expect(aggregatorService.getDashboard).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      '30d',
    );
  });

  it('passes pagination params for recent activity', async () => {
    await expect(
      controller.getRecentActivity(user, {
        page: 2,
        limit: 10,
      }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        page: 1,
        limit: 20,
      }) as Record<string, unknown>,
    });

    expect(analyticsService.getRecentActivity).toHaveBeenCalledWith(
      'tenant-1',
      { from: undefined, to: undefined },
      2,
      10,
    );
  });

  it('validates trends range via analytics service', async () => {
    await controller.getTrends(user, { range: '7d' });

    expect(analyticsService.getTrendAnalytics).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        from: expect.any(Date) as Date,
        to: expect.any(Date) as Date,
      }),
    );
  });

  it('returns team analytics for authorized users', async () => {
    await expect(controller.getTeam(user)).resolves.toEqual({
      success: true,
      data: { topPerformers: [] },
    });

    expect(analyticsService.getTeamAnalytics).toHaveBeenCalledWith('tenant-1');
  });

  it('blocks activity endpoint without audit.read or lead.read', async () => {
    permissionsService.getPermissionKeysForUser.mockResolvedValue(
      new Set([PERMISSIONS.USER_READ]),
    );

    await expect(controller.getActivity(user, {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns activity feed when lead.read is granted', async () => {
    await expect(controller.getActivity(user, {})).resolves.toEqual({
      success: true,
      data: [],
    });

    expect(analyticsService.getActivityFeed).toHaveBeenCalledWith(
      'tenant-1',
      false,
    );
  });
});

describe('AnalyticsController plan entitlements', () => {
  let guard: PlanEntitlementGuard;
  let planEntitlementService: { assertFeatureEnabled: jest.Mock };

  beforeEach(async () => {
    planEntitlementService = {
      assertFeatureEnabled: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanEntitlementGuard,
        {
          provide: PlanEntitlementService,
          useValue: planEntitlementService,
        },
        Reflector,
      ],
    }).compile();

    guard = module.get(PlanEntitlementGuard);
  });

  it('blocks overview when analytics feature is disabled', async () => {
    planEntitlementService.assertFeatureEnabled.mockRejectedValue(
      new ForbiddenException(
        'Feature unavailable in current subscription plan.',
      ),
    );

    const context = {
      getHandler: () =>
        Reflect.get(AnalyticsController.prototype, 'getOverview') as (
          ...args: unknown[]
        ) => unknown,
      getClass: () => AnalyticsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1', tenantId: 'tenant-1' },
        }),
      }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
