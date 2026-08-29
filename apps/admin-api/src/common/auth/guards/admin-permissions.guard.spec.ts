import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_PERMISSIONS } from '@crmpro/shared';
import {
  ADMIN_ANY_PERMISSIONS_METADATA_KEY,
  ADMIN_PERMISSIONS_METADATA_KEY,
  ADMIN_PUBLIC_ROUTE_METADATA_KEY,
} from '../constants';
import { AdminPermissionsService } from '../services/admin-permissions.service';
import { AdminPermissionsGuard } from './admin-permissions.guard';

const [PERMISSION_A, PERMISSION_B] = Object.values(ADMIN_PERMISSIONS);

function createContext(request: Record<string, unknown> = {}) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function createReflector(metadata: Record<string, unknown>) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: string) => metadata[key]);
  return reflector;
}

function createGuard(
  metadata: Record<string, unknown>,
  permissionsService: Partial<AdminPermissionsService> = {},
) {
  return new AdminPermissionsGuard(
    createReflector(metadata),
    permissionsService as AdminPermissionsService,
  );
}

describe('AdminPermissionsGuard fail-closed behavior', () => {
  it('rejects routes that declare no permissions and are not marked public', async () => {
    const guard = createGuard({});

    await expect(guard.canActivate(createContext())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows routes marked with @PublicAdminRoute() without permission decorators', async () => {
    const guard = createGuard({
      [ADMIN_PUBLIC_ROUTE_METADATA_KEY]: true,
    });

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('rejects requests without an authenticated admin', async () => {
    const guard = createGuard({
      [ADMIN_PERMISSIONS_METADATA_KEY]: [PERMISSION_A],
    });

    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows admins holding every required permission', async () => {
    const guard = createGuard(
      { [ADMIN_PERMISSIONS_METADATA_KEY]: [PERMISSION_A, PERMISSION_B] },
      {
        getPermissionKeysForAdmin: jest
          .fn()
          .mockResolvedValue(new Set([PERMISSION_A, PERMISSION_B])),
      },
    );

    const request = { admin: { id: 'admin-1' } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('rejects admins missing one of the required permissions', async () => {
    const guard = createGuard(
      { [ADMIN_PERMISSIONS_METADATA_KEY]: [PERMISSION_A, PERMISSION_B] },
      {
        getPermissionKeysForAdmin: jest
          .fn()
          .mockResolvedValue(new Set([PERMISSION_A])),
      },
    );

    const request = { admin: { id: 'admin-1' } };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows admins holding at least one of the any-of permissions', async () => {
    const guard = createGuard(
      { [ADMIN_ANY_PERMISSIONS_METADATA_KEY]: [PERMISSION_A, PERMISSION_B] },
      {
        getPermissionKeysForAdmin: jest
          .fn()
          .mockResolvedValue(new Set([PERMISSION_B])),
      },
    );

    const request = { admin: { id: 'admin-1' } };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
  });

  it('rejects admins holding none of the any-of permissions', async () => {
    const guard = createGuard(
      { [ADMIN_ANY_PERMISSIONS_METADATA_KEY]: [PERMISSION_A] },
      {
        getPermissionKeysForAdmin: jest
          .fn()
          .mockResolvedValue(new Set([PERMISSION_B])),
      },
    );

    const request = { admin: { id: 'admin-1' } };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
