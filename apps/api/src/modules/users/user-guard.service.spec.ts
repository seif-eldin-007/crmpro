import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { TENANT_ROLE_NAMES } from '@crmpro/shared/bootstrap';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserGuardService } from './services/user-guard.service';

describe('UserGuardService last owner protection', () => {
  let service: UserGuardService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      count: jest.Mock;
    };
  };

  const ownerUser = {
    id: 'owner-1',
    tenantId: 'tenant-1',
    name: 'Owner User',
    email: 'owner@example.com',
    isActive: true,
    role: {
      id: 'role-owner',
      name: TENANT_ROLE_NAMES.owner,
      tenantId: 'tenant-1',
      deletedAt: null,
    },
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserGuardService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PermissionsService,
          useValue: {
            getPermissionKeysForUser: jest.fn(),
            getPermissionKeysForRole: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UserGuardService);
  });

  it('rejects deactivating the last active owner', async () => {
    prisma.user.findFirst.mockResolvedValue(ownerUser);
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.assertNotLastOwner('tenant-1', 'owner-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects demoting the last active owner', async () => {
    prisma.user.findFirst.mockResolvedValue(ownerUser);
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.assertOwnerRoleChangeAllowed(
        'tenant-1',
        'owner-1',
        TENANT_ROLE_NAMES.manager,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('UserGuardService role assignment escalation protection', () => {
  let service: UserGuardService;
  let permissionsService: {
    getPermissionKeysForUser: jest.Mock;
    getPermissionKeysForRole: jest.Mock;
  };
  let prisma: {
    role: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    permissionsService = {
      getPermissionKeysForUser: jest.fn(),
      getPermissionKeysForRole: jest.fn(),
    };
    prisma = {
      role: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'role-owner',
          name: TENANT_ROLE_NAMES.owner,
          isSystem: true,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserGuardService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsService, useValue: permissionsService },
      ],
    }).compile();

    service = module.get(UserGuardService);
  });

  it('rejects assigning a role with permissions the actor does not have', async () => {
    permissionsService.getPermissionKeysForUser.mockResolvedValue(
      new Set([PERMISSIONS.USER_CREATE, PERMISSIONS.USER_UPDATE]),
    );
    permissionsService.getPermissionKeysForRole.mockResolvedValue([
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_UPDATE,
      PERMISSIONS.BILLING_MANAGE,
    ]);

    await expect(
      service.assertActorCanAssignRole('tenant-1', 'manager-1', 'role-owner'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows assigning a role whose permissions are a subset of the actor', async () => {
    permissionsService.getPermissionKeysForUser.mockResolvedValue(
      new Set([
        PERMISSIONS.USER_CREATE,
        PERMISSIONS.USER_UPDATE,
        PERMISSIONS.USER_READ,
      ]),
    );
    permissionsService.getPermissionKeysForRole.mockResolvedValue([
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_READ,
    ]);

    await expect(
      service.assertActorCanAssignRole('tenant-1', 'manager-1', 'role-agent'),
    ).resolves.toEqual({
      id: 'role-owner',
      name: TENANT_ROLE_NAMES.owner,
      isSystem: true,
    });
  });
});
