import { CanActivate, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { PERMISSIONS_METADATA_KEY } from '../../common/auth/constants';
import { PermissionsGuard } from '../../common/auth/guards/permissions.guard';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { LeadsBulkController } from './leads-bulk.controller';
import { LeadsBulkService } from './leads-bulk.service';

const mockGuard: CanActivate = { canActivate: jest.fn().mockReturnValue(true) };

describe('LeadsBulkController RBAC', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let permissionsService: { getPermissionKeysForUser: jest.Mock };

  const user = {
    id: 'user-1',
    tenantId: 'tenant-1',
  } as AuthenticatedUser;

  const buildContext = (handler: (...args: unknown[]) => unknown) =>
    ({
      getHandler: () => handler,
      getClass: () => LeadsBulkController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as Parameters<PermissionsGuard['canActivate']>[0];

  beforeEach(async () => {
    permissionsService = {
      getPermissionKeysForUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        Reflector,
        { provide: PermissionsService, useValue: permissionsService },
      ],
    }).compile();

    guard = module.get(PermissionsGuard);
    reflector = module.get(Reflector);
  });

  it('requires lead.assign for bulk assign', () => {
    const handler = Reflect.get(
      LeadsBulkController.prototype,
      'bulkAssignLeads',
    ) as (...args: unknown[]) => unknown;
    const required = reflector.get<(typeof PERMISSIONS.LEAD_ASSIGN)[]>(
      PERMISSIONS_METADATA_KEY,
      handler,
    );

    expect(required).toEqual([PERMISSIONS.LEAD_ASSIGN]);
  });

  it('denies agent without lead.assign', async () => {
    permissionsService.getPermissionKeysForUser.mockResolvedValue(
      new Set([PERMISSIONS.LEAD_READ, PERMISSIONS.LEAD_UPDATE]),
    );

    const handler = Reflect.get(
      LeadsBulkController.prototype,
      'bulkAssignLeads',
    ) as (...args: unknown[]) => unknown;

    await expect(guard.canActivate(buildContext(handler))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows manager with lead.assign', async () => {
    permissionsService.getPermissionKeysForUser.mockResolvedValue(
      new Set([PERMISSIONS.LEAD_ASSIGN]),
    );

    const handler = Reflect.get(
      LeadsBulkController.prototype,
      'bulkAssignLeads',
    ) as (...args: unknown[]) => unknown;

    await expect(guard.canActivate(buildContext(handler))).resolves.toBe(true);
  });
});

describe('LeadsBulkController', () => {
  let controller: LeadsBulkController;
  let leadsBulkService: {
    bulkAssignLeads: jest.Mock;
    bulkMoveStage: jest.Mock;
  };

  const user = {
    id: 'user-1',
    tenantId: 'tenant-1',
  } as AuthenticatedUser;

  beforeEach(async () => {
    leadsBulkService = {
      bulkAssignLeads: jest.fn().mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        failures: [],
      }),
      bulkMoveStage: jest.fn().mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        failures: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadsBulkController],
      providers: [{ provide: LeadsBulkService, useValue: leadsBulkService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(LeadsBulkController);
  });

  it('delegates bulk assign to service', async () => {
    await expect(
      controller.bulkAssignLeads(user, {
        leadIds: ['lead-1', 'lead-2'],
        userId: 'agent-1',
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        successCount: 2,
        failureCount: 0,
        failures: [],
      },
    });

    expect(leadsBulkService.bulkAssignLeads).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      {
        leadIds: ['lead-1', 'lead-2'],
        userId: 'agent-1',
      },
    );
  });
});
