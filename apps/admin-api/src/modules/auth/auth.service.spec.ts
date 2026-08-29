import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PasswordService } from '../../common/security/password.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminSessionService } from './services/admin-session.service';
import { AdminSecurityService } from './services/admin-security.service';
import { AuthAuditService } from './services/auth-audit.service';

describe('AuthService', () => {
  let service: AuthService;

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp-test',
    deviceName: null,
    country: null,
    city: null,
  };

  const admin = {
    id: '99999999-9999-4999-8999-999999999901',
    email: 'admin@crmpro.local',
    passwordHash: 'hash',
    fullName: 'System Administrator',
    roleId: '88888888-8888-4888-8888-888888888801',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const session = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    adminId: admin.id,
    hashedRefreshToken: 'stored-hash',
    ipAddress: null,
    userAgent: null,
    deviceFingerprint: null,
    deviceName: null,
    country: null,
    city: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prisma = {
    platformAdmin: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    adminSession: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const passwordService = {
    verify: jest.fn(),
  };

  const tokenService = {
    generateRawRefreshSecret: jest.fn().mockReturnValue('raw-secret'),
    hashRefreshToken: jest.fn().mockResolvedValue('hashed-secret'),
    verifyRefreshToken: jest.fn(),
    formatRefreshToken: jest.fn().mockReturnValue('session.raw-secret'),
    generateAccessToken: jest.fn().mockReturnValue('access-token'),
    getRefreshTokenExpiresAt: jest
      .fn()
      .mockReturnValue(new Date(Date.now() + 86_400_000)),
    parseRefreshToken: jest.fn(),
  };

  const adminSessionService = {
    findById: jest.fn(),
  };

  const adminSecurityService = {
    logLoginFailed: jest.fn(),
    logLoginSuccess: jest.fn(),
    logTokenReuse: jest.fn(),
    logTokenRefresh: jest.fn(),
    logSessionRevoked: jest.fn(),
  };

  const authAuditService = {
    logLogin: jest.fn(),
    logLogout: jest.fn(),
    logLogoutAll: jest.fn(),
    logSessionRevoked: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        callback({
          adminSession: { create: jest.fn().mockResolvedValue(session) },
          platformAdmin: { update: jest.fn() },
          adminSession_updateMany: jest.fn(),
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: passwordService },
        { provide: TokenService, useValue: tokenService },
        { provide: AdminSessionService, useValue: adminSessionService },
        { provide: AdminSecurityService, useValue: adminSecurityService },
        { provide: AuthAuditService, useValue: authAuditService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('rejects login for unknown admin', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue(null);

    await expect(
      service.login(
        { email: 'missing@crmpro.local', password: 'Admin123!' },
        metadata,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(adminSecurityService.logLoginFailed).toHaveBeenCalled();
  });

  it('rejects login for inactive admin', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue({
      ...admin,
      isActive: false,
    });

    await expect(
      service.login({ email: admin.email, password: 'Admin123!' }, metadata),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revokes all sessions on refresh token reuse', async () => {
    tokenService.parseRefreshToken.mockReturnValue({
      sessionId: session.id,
      rawSecret: 'old-secret',
    });
    adminSessionService.findById.mockResolvedValue(session);
    tokenService.verifyRefreshToken.mockResolvedValue(false);

    const tx = {
      adminSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      service.refresh('session.old-secret', metadata),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(adminSecurityService.logTokenReuse).toHaveBeenCalledWith(
      admin.id,
      metadata,
      tx,
    );
    expect(tx.adminSession.updateMany).toHaveBeenCalledWith({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });
});
