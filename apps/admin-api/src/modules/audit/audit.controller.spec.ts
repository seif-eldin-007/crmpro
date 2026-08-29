import { CanActivate, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ADMIN_PERMISSIONS } from '@crmpro/shared';
import {
  ADMIN_PERMISSIONS_METADATA_KEY,
  AdminPermissionsGuard,
  AdminPermissionsService,
} from '../../common/auth';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { SecurityEventsController } from './security-events.controller';
import { SecurityEventsService } from './security-events.service';

const mockGuard: CanActivate = { canActivate: jest.fn().mockReturnValue(true) };

describe('AuditController RBAC', () => {
  let guard: AdminPermissionsGuard;
  let reflector: Reflector;
  let permissionsService: { getPermissionKeysForAdmin: jest.Mock };

  const admin = {
    id: 'admin-1',
    roleId: 'role-1',
    sessionId: 'session-1',
  };

  const buildContext = (handler: (...args: unknown[]) => unknown) =>
    ({
      getHandler: () => handler,
      getClass: () => AuditController,
      switchToHttp: () => ({
        getRequest: () => ({ admin }),
      }),
    }) as unknown as Parameters<AdminPermissionsGuard['canActivate']>[0];

  beforeEach(async () => {
    permissionsService = {
      getPermissionKeysForAdmin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPermissionsGuard,
        Reflector,
        { provide: AdminPermissionsService, useValue: permissionsService },
      ],
    }).compile();

    guard = module.get(AdminPermissionsGuard);
    reflector = module.get(Reflector);
  });

  it('requires audit.read for listing audit logs', async () => {
    permissionsService.getPermissionKeysForAdmin.mockResolvedValue(
      new Set([ADMIN_PERMISSIONS.AUDIT_READ]),
    );

    const handler = Reflect.get(AuditController.prototype, 'listAuditLogs') as (
      ...args: unknown[]
    ) => unknown;
    const required = reflector.get<string[]>(
      ADMIN_PERMISSIONS_METADATA_KEY,
      handler,
    );

    expect(required).toEqual([ADMIN_PERMISSIONS.AUDIT_READ]);
    await expect(guard.canActivate(buildContext(handler))).resolves.toBe(true);
  });

  it('denies access without audit.read', async () => {
    permissionsService.getPermissionKeysForAdmin.mockResolvedValue(
      new Set([ADMIN_PERMISSIONS.TENANT_READ]),
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

  beforeEach(async () => {
    auditService = {
      listAuditLogs: jest.fn().mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      }),
      getAuditLog: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditService, useValue: auditService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(AdminPermissionsGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(AuditController);
  });

  it('lists audit logs', async () => {
    await expect(
      controller.listAuditLogs({ page: 1, limit: 20 }),
    ).resolves.toEqual({
      success: true,
      data: {
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      },
    });
  });
});

describe('SecurityEventsController', () => {
  let controller: SecurityEventsController;
  let securityEventsService: {
    listSecurityEvents: jest.Mock;
    getSecurityEvent: jest.Mock;
  };

  beforeEach(async () => {
    securityEventsService = {
      listSecurityEvents: jest.fn().mockResolvedValue({
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      }),
      getSecurityEvent: jest.fn().mockResolvedValue({ id: 'event-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SecurityEventsController],
      providers: [
        { provide: SecurityEventsService, useValue: securityEventsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(AdminPermissionsGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(SecurityEventsController);
  });

  it('lists security events', async () => {
    await expect(
      controller.listSecurityEvents({ page: 1, limit: 20 }),
    ).resolves.toEqual({
      success: true,
      data: {
        items: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      },
    });
  });
});
