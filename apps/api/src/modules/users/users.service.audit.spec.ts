import { Test, TestingModule } from '@nestjs/testing';
import { QuotaService } from '../../common/quota/quota.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { PasswordService } from '../../common/security/password.service';
import { UserGuardService } from './services/user-guard.service';
import { UserSessionService } from './services/user-session.service';
import { UsersAuditService } from './services/users-audit.service';
import { UsersService } from './users.service';

describe('UsersService audit integration', () => {
  let service: UsersService;
  let auditService: { logUserCreated: jest.Mock };
  let prisma: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    auditService = {
      logUserCreated: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-new',
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: null,
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: { id: 'role-1', name: 'Agent' },
        }),
      },
      $transaction: jest.fn((callback: (client: typeof prisma) => unknown) =>
        callback(prisma),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PasswordService,
          useValue: { hash: jest.fn().mockResolvedValue('hash') },
        },
        {
          provide: QuotaService,
          useValue: { assertCanCreateUserInTransaction: jest.fn() },
        },
        { provide: PermissionsService, useValue: {} },
        {
          provide: UserGuardService,
          useValue: {
            assertActorCanAssignRole: jest
              .fn()
              .mockResolvedValue({ id: 'role-1', name: 'Agent' }),
          },
        },
        { provide: UserSessionService, useValue: {} },
        { provide: UsersAuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('writes USER_CREATED audit entry when creating a user', async () => {
    await service.createUser('tenant-1', 'actor-1', {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Password1',
      roleId: 'role-1',
    });

    expect(auditService.logUserCreated).toHaveBeenCalledWith(
      'tenant-1',
      'actor-1',
      'user-new',
      expect.objectContaining({ email: 'jane@example.com', roleId: 'role-1' }),
      prisma,
    );
  });
});
