import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { TENANT_ROLE_NAMES } from '@crmpro/shared/bootstrap';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RolesAuditService } from './services/roles-audit.service';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: {
    role: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    permission: { findMany: jest.Mock };
    rolePermission: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    user: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let permissionsService: {
    getPermissionKeysForUser: jest.Mock;
  };

  const systemOwnerRole = {
    id: 'role-owner',
    name: TENANT_ROLE_NAMES.owner,
    description: 'Owner role',
    isSystem: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const customRole = {
    id: 'role-custom',
    name: 'Sales Lead',
    description: null,
    isSystem: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    prisma = {
      role: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      permission: { findMany: jest.fn() },
      rolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (arg: unknown) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }

        return (arg as (client: typeof prisma) => unknown)(prisma);
      }),
    };

    permissionsService = {
      getPermissionKeysForUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsService, useValue: permissionsService },
        {
          provide: RolesAuditService,
          useValue: {
            logRoleUpdated: jest.fn(),
            logRolePermissionsUpdated: jest.fn(),
            logRoleArchived: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  describe('system role immutability', () => {
    it('rejects renaming Owner', async () => {
      prisma.role.findFirst.mockResolvedValue(systemOwnerRole);

      await expect(
        service.updateRole('tenant-1', 'actor-1', 'role-owner', {
          name: 'Super Owner',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects editing Owner permissions', async () => {
      prisma.role.findFirst.mockResolvedValue(systemOwnerRole);
      prisma.permission.findMany.mockResolvedValue([
        { id: 'perm-1', key: PERMISSIONS.LEAD_READ },
      ]);

      await expect(
        service.updateRolePermissions('tenant-1', 'actor-1', 'role-owner', {
          permissionKeys: [PERMISSIONS.LEAD_READ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects archiving Owner', async () => {
      prisma.role.findFirst.mockResolvedValue(systemOwnerRole);

      await expect(
        service.archiveRole('tenant-1', 'actor-1', 'role-owner'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('permission escalation protection', () => {
    it('rejects granting permissions the actor does not have', async () => {
      prisma.role.findFirst.mockResolvedValue(customRole);
      prisma.permission.findMany.mockResolvedValue([
        { id: 'perm-billing', key: PERMISSIONS.BILLING_MANAGE },
      ]);
      permissionsService.getPermissionKeysForUser.mockResolvedValue(
        new Set([PERMISSIONS.USER_READ, PERMISSIONS.USER_CREATE]),
      );

      await expect(
        service.updateRolePermissions('tenant-1', 'actor-1', 'role-custom', {
          permissionKeys: [PERMISSIONS.BILLING_MANAGE],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
