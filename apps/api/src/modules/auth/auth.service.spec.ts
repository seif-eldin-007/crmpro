import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantStatus } from '@crmpro/database';
import { AuthLoggingService } from '../../common/logging/auth-logging.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/security/password.service';
import { TENANT_ACCESS_MESSAGES } from '../../common/tenant-access/tenant-access.constants';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService tenant suspension enforcement', () => {
  let service: AuthService;
  let usersService: {
    findTenantBySlug: jest.Mock;
    findByTenantAndEmail: jest.Mock;
    findById: jest.Mock;
  };
  let passwordService: { verify: jest.Mock };
  let tokenService: {
    generateRawRefreshSecret: jest.Mock;
    hashRefreshToken: jest.Mock;
    getRefreshTokenExpiresAt: jest.Mock;
    generateAccessToken: jest.Mock;
    formatRefreshToken: jest.Mock;
    parseRefreshToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
  };
  let prisma: {
    userSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let tenantAccessService: { assertTenantAccessible: jest.Mock };

  const activeUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    roleId: 'role-1',
    deletedAt: null,
    isActive: true,
    passwordHash: 'hash',
    name: 'Owner',
    email: 'owner@example.com',
    phone: null,
    lastLoginAt: null,
    role: { id: 'role-1', name: 'Owner' },
    tenant: {
      id: 'tenant-1',
      name: 'Demo',
      slug: 'demo',
      status: TenantStatus.ACTIVE,
      deletedAt: null,
    },
  };

  beforeEach(async () => {
    usersService = {
      findTenantBySlug: jest.fn().mockResolvedValue(activeUser.tenant),
      findByTenantAndEmail: jest.fn().mockResolvedValue(activeUser),
      findById: jest.fn().mockResolvedValue(activeUser),
    };
    passwordService = {
      verify: jest.fn().mockResolvedValue(true),
    };
    tokenService = {
      generateRawRefreshSecret: jest.fn().mockReturnValue('secret'),
      hashRefreshToken: jest.fn().mockResolvedValue('hashed'),
      getRefreshTokenExpiresAt: jest
        .fn()
        .mockReturnValue(new Date('2099-01-01')),
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
      formatRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      parseRefreshToken: jest.fn().mockReturnValue({
        sessionId: 'session-1',
        rawSecret: 'secret',
      }),
      verifyRefreshToken: jest.fn().mockResolvedValue(true),
    };
    prisma = {
      userSession: {
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          hashedRefreshToken: 'hashed',
          revokedAt: null,
          expiresAt: new Date('2099-01-01'),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    tenantAccessService = {
      assertTenantAccessible: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: PasswordService, useValue: passwordService },
        { provide: TokenService, useValue: tokenService },
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuthLoggingService,
          useValue: {
            loginSuccess: jest.fn(),
            loginFailure: jest.fn(),
            refreshSuccess: jest.fn(),
            refreshFailure: jest.fn(),
            sessionRevoked: jest.fn(),
          },
        },
        { provide: TenantAccessService, useValue: tenantAccessService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('blocks login for suspended tenants', async () => {
    tenantAccessService.assertTenantAccessible.mockRejectedValue(
      new ForbiddenException(TENANT_ACCESS_MESSAGES.SUSPENDED),
    );

    await expect(
      service.login(
        {
          tenantSlug: 'demo',
          email: 'owner@example.com',
          password: 'Password1',
        },
        { deviceName: null, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(tenantAccessService.assertTenantAccessible).toHaveBeenCalledWith(
      'tenant-1',
    );
    expect(prisma.userSession.create).not.toHaveBeenCalled();
  });

  it('blocks refresh for suspended tenants', async () => {
    tenantAccessService.assertTenantAccessible.mockRejectedValue(
      new ForbiddenException(TENANT_ACCESS_MESSAGES.SUSPENDED),
    );

    await expect(service.refresh('session.secret')).rejects.toThrow(
      ForbiddenException,
    );

    expect(tenantAccessService.assertTenantAccessible).toHaveBeenCalledWith(
      'tenant-1',
    );
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it('allows login and refresh for active tenants', async () => {
    await expect(
      service.login(
        {
          tenantSlug: 'demo',
          email: 'owner@example.com',
          password: 'Password1',
        },
        { deviceName: null, ipAddress: null, userAgent: null },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );

    await expect(service.refresh('session.secret')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('rejects refresh for inactive users before tenant check', async () => {
    usersService.findById.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    await expect(service.refresh('session.secret')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(tenantAccessService.assertTenantAccessible).not.toHaveBeenCalled();
  });
});

describe('AuthService refresh token rotation', () => {
  let service: AuthService;
  let tokenService: {
    generateRawRefreshSecret: jest.Mock;
    hashRefreshToken: jest.Mock;
    generateAccessToken: jest.Mock;
    formatRefreshToken: jest.Mock;
    parseRefreshToken: jest.Mock;
    verifyRefreshToken: jest.Mock;
  };
  let prisma: {
    userSession: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let authLoggingService: {
    refreshSuccess: jest.Mock;
    refreshFailure: jest.Mock;
  };

  const session = {
    id: 'session-1',
    userId: 'user-1',
    hashedRefreshToken: 'old-hash',
    revokedAt: null,
    expiresAt: new Date('2099-01-01'),
  };

  const activeUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    roleId: 'role-1',
    deletedAt: null,
    isActive: true,
    tenant: {
      id: 'tenant-1',
      deletedAt: null,
    },
  };

  beforeEach(async () => {
    tokenService = {
      generateRawRefreshSecret: jest.fn().mockReturnValue('new-secret'),
      hashRefreshToken: jest.fn().mockResolvedValue('new-hash'),
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
      formatRefreshToken: jest.fn().mockReturnValue('new-refresh-token'),
      parseRefreshToken: jest.fn().mockReturnValue({
        sessionId: 'session-1',
        rawSecret: 'old-secret',
      }),
      verifyRefreshToken: jest.fn().mockResolvedValue(true),
    };
    prisma = {
      userSession: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    authLoggingService = {
      refreshSuccess: jest.fn(),
      refreshFailure: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findById: jest.fn().mockResolvedValue(activeUser) },
        },
        { provide: PasswordService, useValue: {} },
        { provide: TokenService, useValue: tokenService },
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuthLoggingService,
          useValue: {
            ...authLoggingService,
            loginSuccess: jest.fn(),
            loginFailure: jest.fn(),
            sessionRevoked: jest.fn(),
          },
        },
        {
          provide: TenantAccessService,
          useValue: {
            assertTenantAccessible: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('rotates refresh token atomically using the previous hash', async () => {
    await service.refresh('session-1.old-secret');

    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        hashedRefreshToken: 'old-hash',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { hashedRefreshToken: 'new-hash' },
    });
    expect(authLoggingService.refreshSuccess).toHaveBeenCalled();
  });

  it('rejects concurrent refresh when the stored hash already rotated', async () => {
    prisma.userSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh('session-1.old-secret')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(authLoggingService.refreshFailure).toHaveBeenCalledWith({
      reason: 'refresh_token_replay',
      sessionId: 'session-1',
    });
    expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
    expect(authLoggingService.refreshSuccess).not.toHaveBeenCalled();
  });

  it('revokes every user session when an old refresh token is replayed on an active session', async () => {
    tokenService.verifyRefreshToken.mockResolvedValue(false);

    await expect(service.refresh('session-1.old-secret')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(authLoggingService.refreshFailure).toHaveBeenCalledWith({
      reason: 'refresh_token_reuse',
      sessionId: 'session-1',
    });
    expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
    expect(authLoggingService.refreshSuccess).not.toHaveBeenCalled();
  });
});
