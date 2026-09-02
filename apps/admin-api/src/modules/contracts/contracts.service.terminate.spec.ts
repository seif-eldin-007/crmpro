import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus, TenantStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ContractsAuditService } from './services/contracts-audit.service';
import { ContractEntitlementSyncService } from './services/contract-entitlement-sync.service';
import { ContractsService } from './contracts.service';

/**
 * Plan 03 termination lifecycle: terminating a contract suspends the linked
 * tenant and revokes all of its user sessions inside the same transaction as
 * the status flip and the audit write. The grace window only defines the
 * accessUntil value recorded in the audit trail.
 */
describe('ContractsService terminateContract', () => {
  let service: ContractsService;

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    deviceName: null,
    country: null,
    city: null,
  };

  const existingContract = {
    id: 'contract-1',
    status: ContractStatus.ACTIVE,
    tenantId: 'tenant-1',
    contractEndAt: new Date('2026-12-31T00:00:00.000Z'),
    gracePeriodDays: 14,
    deletedAt: null,
    planId: 'plan-1',
    planSnapshot: null,
    plan: { id: 'plan-1', name: 'Growth', isActive: true },
    createdByAdmin: { id: 'admin-1', fullName: 'Admin', email: 'a@x.com' },
    contractStartAt: new Date('2026-01-01'),
    contractName: 'Deal',
    agreedPrice: { toNumber: () => 1000 },
    currency: 'EGP',
    paymentMethod: 'BANK_TRANSFER',
    paymentFrequency: 'MONTHLY',
    discountPercent: null,
    autoRenew: false,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByAdminId: 'admin-1',
  };

  let prisma: {
    tenantContract: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  let tx: {
    tenantContract: { update: jest.Mock };
    tenant: { findFirst: jest.Mock; update: jest.Mock };
    user: { findMany: jest.Mock };
    userSession: { updateMany: jest.Mock };
  };

  let auditService: { logContractTerminated: jest.Mock };

  beforeEach(async () => {
    auditService = {
      logContractTerminated: jest.fn().mockResolvedValue(undefined),
    };

    tx = {
      tenantContract: {
        update: jest.fn().mockResolvedValue({
          ...existingContract,
          status: ContractStatus.TERMINATED,
        }),
      },
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ status: TenantStatus.ACTIVE }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]),
      },
      userSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    prisma = {
      tenantContract: {
        findFirst: jest.fn().mockResolvedValue(existingContract),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ContractsAuditService,
          useValue: auditService,
        },
        {
          provide: ContractEntitlementSyncService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(ContractsService);
  });

  it('terminates the contract, suspends the tenant and revokes all sessions', async () => {
    await service.terminateContract('contract-1', 'admin-1', metadata);

    expect(tx.tenantContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contract-1' },
        data: { status: ContractStatus.TERMINATED },
      }),
    );

    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { status: TenantStatus.SUSPENDED },
    });

    expect(tx.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['user-1', 'user-2'] },
        revokedAt: null,
      },
      data: { revokedAt: expect.any(Date) as Date },
    });

    expect(auditService.logContractTerminated).toHaveBeenCalledWith(
      'admin-1',
      'contract-1',
      expect.objectContaining({
        ipAddress: '127.0.0.1',
      }) as Record<string, unknown>,
      expect.objectContaining({
        tenantId: 'tenant-1',
        gracePeriodDays: 14,
        accessUntil: '2027-01-14T23:59:59.999Z',
        tenantSuspended: true,
        revokedSessions: 2,
      }) as Record<string, unknown>,
      tx,
    );
  });

  it('keeps an already suspended tenant suspended and still revokes sessions', async () => {
    tx.tenant.findFirst.mockResolvedValue({ status: TenantStatus.SUSPENDED });

    await service.terminateContract('contract-1', 'admin-1', metadata);

    expect(tx.tenant.update).not.toHaveBeenCalled();
    expect(tx.userSession.updateMany).toHaveBeenCalled();
  });

  it('terminates an unlinked contract without tenant side effects', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue({
      ...existingContract,
      tenantId: null,
    });

    await service.terminateContract('contract-1', 'admin-1', metadata);

    expect(tx.tenant.findFirst).not.toHaveBeenCalled();
    expect(tx.userSession.updateMany).not.toHaveBeenCalled();

    expect(auditService.logContractTerminated).toHaveBeenCalledWith(
      'admin-1',
      'contract-1',
      expect.anything(),
      expect.objectContaining({
        tenantId: null,
        tenantSuspended: false,
        revokedSessions: 0,
      }) as Record<string, unknown>,
      tx,
    );
  });

  it('records the grace window from termination time for open-ended contracts', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue({
      ...existingContract,
      contractEndAt: null,
      gracePeriodDays: 7,
    });

    await service.terminateContract('contract-1', 'admin-1', metadata);

    const calls = auditService.logContractTerminated.mock.calls as unknown[][];
    const details = calls[0][3] as Record<string, unknown>;

    // Open-ended contract: grace is counted from the termination moment.
    expect(details.accessUntil).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/);
  });

  it('rejects terminating an already terminated contract', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue({
      ...existingContract,
      status: ContractStatus.TERMINATED,
    });

    await expect(
      service.terminateContract('contract-1', 'admin-1', metadata),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects terminating a draft contract', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue({
      ...existingContract,
      status: ContractStatus.DRAFT,
    });

    await expect(
      service.terminateContract('contract-1', 'admin-1', metadata),
    ).rejects.toThrow(BadRequestException);
  });
});
