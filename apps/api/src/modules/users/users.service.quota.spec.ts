import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuotaService } from '../../common/quota/quota.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { PasswordService } from '../../common/security/password.service';
import { UserGuardService } from './services/user-guard.service';
import { UserSessionService } from './services/user-session.service';
import { UsersAuditService } from './services/users-audit.service';
import { UsersService } from './users.service';

describe('UsersService quota enforcement', () => {
  let service: UsersService;
  let quotaService: { assertCanCreateUserInTransaction: jest.Mock };

  beforeEach(async () => {
    quotaService = {
      assertCanCreateUserInTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findFirst: jest.fn().mockResolvedValue(null) },
            $transaction: jest.fn((callback: (client: object) => unknown) =>
              callback({}),
            ),
          },
        },
        { provide: PasswordService, useValue: { hash: jest.fn() } },
        { provide: QuotaService, useValue: quotaService },
        { provide: PermissionsService, useValue: {} },
        {
          provide: UserGuardService,
          useValue: { assertActorCanAssignRole: jest.fn() },
        },
        { provide: UserSessionService, useValue: {} },
        { provide: UsersAuditService, useValue: { logUserCreated: jest.fn() } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('throws 403 when user quota is exceeded', async () => {
    quotaService.assertCanCreateUserInTransaction.mockRejectedValue(
      new ForbiddenException('User quota exceeded'),
    );

    await expect(
      service.createUser('tenant-1', 'actor-1', {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        password: 'Password1',
        roleId: 'role-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
