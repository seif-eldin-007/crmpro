import { CanActivate, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { PERMISSIONS_METADATA_KEY } from '../../common/auth/constants';
import { PermissionsGuard } from '../../common/auth/guards/permissions.guard';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

const mockGuard: CanActivate = { canActivate: jest.fn().mockReturnValue(true) };

describe('AuditController RBAC', () => {
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
      getClass: () => AuditController,
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

  it('allows owner with audit.read', async () => {
    permissionsService.getPermissionKeysForUser.mockResolvedValue(
      new Set([PERMISSIONS.AUDIT_READ]),
    );

    const handler = Reflect.get(AuditController.prototype, 'listAuditLogs') as (
      ...args: unknown[]
    ) => unknown;
    const required = reflector.get<string[]>(PERMISSIONS_METADATA_KEY, handler);

    expect(required).toEqual([PERMISSIONS.AUDIT_READ]);
    await expect(guard.canActivate(buildContext(handler))).resolves.toBe(true);
  });

  it('denies agent without audit.read', async () => {
    permissionsService.getPermissionKeysForUser.mockResolvedValue(
      new Set([PERMISSIONS.LEAD_READ]),
    );

    const handler = Reflect.get(AuditController.prototype, 'listAuditLogs') as (
      ...args: unknown[]
    ) => unknown;

    await expect(guard.canActivate(buildContext(handler))).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: {
    listAuditLogs: jest.Mock;
    getAuditLog: jest.Mock;
  };

  const user = {
    id: 'user-1',
    tenantId: 'tenant-1',
  } as AuthenticatedUser;

  beforeEach(async () => {
    auditService = {
      listAuditLogs: jest.fn().mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 1 },
      }),
      getAuditLog: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: auditService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(AuditController);
  });

  it('lists audit logs for the current tenant', async () => {
    await expect(
      controller.listAuditLogs(user, { page: 1, limit: 20 }),
    ).resolves.toEqual({
      success: true,
      data: {
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 1 },
      },
    });

    expect(auditService.listAuditLogs).toHaveBeenCalledWith('tenant-1', {
      page: 1,
      limit: 20,
    });
  });
});
