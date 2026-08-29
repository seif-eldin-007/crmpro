import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../../../common/security/password.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantsAuditService } from './tenants-audit.service';
import { TenantOwnerService } from './tenant-owner.service';

describe('TenantOwnerService resetOwnerPassword', () => {
  let service: TenantOwnerService;

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    deviceName: null,
    country: null,
    city: null,
  };

  let tx: {
    user: { update: jest.Mock };
    userSession: { updateMany: jest.Mock };
  };

  let prisma: {
    tenant: { findFirst: jest.Mock };
    user: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  let auditService: { logOwnerPasswordReset: jest.Mock };

  beforeEach(async () => {
    tx = {
      user: { update: jest.fn().mockResolvedValue(undefined) },
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'owner-1', name: 'Owner', email: 'owner@test.com' },
          ]),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    auditService = {
      logOwnerPasswordReset: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantOwnerService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PasswordService,
          useValue: { hash: jest.fn().mockResolvedValue('hashed-password') },
        },
        {
          provide: TenantsAuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = module.get(TenantOwnerService);
  });

  it('updates password, revokes sessions, and audits in one transaction', async () => {
    const result = await service.resetOwnerPassword(
      'tenant-1',
      { newPassword: 'NewStrongPass123!' },
      'admin-1',
      metadata,
    );

    expect(result).toEqual({ revokedSessions: 2 });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'owner-1' },
      data: { passwordHash: 'hashed-password' },
    });
    expect(tx.userSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(auditService.logOwnerPasswordReset).toHaveBeenCalledWith(
      'admin-1',
      'tenant-1',
      metadata,
      2,
      tx,
    );
  });

  it('rolls back password change when session revoke fails', async () => {
    tx.userSession.updateMany.mockRejectedValue(new Error('db error'));

    await expect(
      service.resetOwnerPassword(
        'tenant-1',
        { newPassword: 'NewStrongPass123!' },
        'admin-1',
        metadata,
      ),
    ).rejects.toThrow('db error');

    expect(auditService.logOwnerPasswordReset).not.toHaveBeenCalled();
  });
});
