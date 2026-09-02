import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ContractsAuditService } from './services/contracts-audit.service';
import { ContractEntitlementSyncService } from './services/contract-entitlement-sync.service';
import { ContractsService } from './contracts.service';
import type { CreateContractDto } from './dto/create-contract.dto';

describe('ContractsService entitlement sync', () => {
  let service: ContractsService;
  let prisma: {
    tenantContract: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    subscriptionPlan: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let auditService: {
    logContractCreated: jest.Mock;
    logContractActivated: jest.Mock;
    logContractUpdated: jest.Mock;
  };
  let entitlementSyncService: {
    syncTenantPlanFromContract: jest.Mock;
    assertTenantContractPlanConsistency: jest.Mock;
  };

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    deviceName: null,
    country: null,
    city: null,
  };

  beforeEach(async () => {
    entitlementSyncService = {
      syncTenantPlanFromContract: jest.fn().mockResolvedValue(undefined),
      assertTenantContractPlanConsistency: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    auditService = {
      logContractCreated: jest.fn().mockResolvedValue(undefined),
      logContractActivated: jest.fn().mockResolvedValue(undefined),
      logContractUpdated: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      tenantContract: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan-enterprise',
          isActive: true,
          name: 'Enterprise',
          defaultPrice: null,
          currency: null,
          maxUsers: null,
          maxLeads: null,
          maxProjects: null,
          maxStorageBytes: null,
          featureFlags: {},
        }),
      },
      $transaction: jest.fn(),
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
          useValue: entitlementSyncService,
        },
      ],
    }).compile();

    service = module.get(ContractsService);
  });

  it('syncs tenant plan when activating a linked contract', async () => {
    prisma.tenantContract.findFirst
      .mockResolvedValueOnce({
        id: 'contract-1',
        status: ContractStatus.DRAFT,
        planId: 'plan-enterprise',
        tenantId: 'tenant-1',
        plan: { isActive: true },
        deletedAt: null,
        contractStartAt: new Date('2026-01-01'),
        contractEndAt: null,
        contractName: null,
        agreedPrice: { toNumber: () => 1000 },
        currency: 'EGP',
        paymentMethod: 'BANK_TRANSFER',
        paymentFrequency: 'MONTHLY',
        discountPercent: null,
        gracePeriodDays: null,
        autoRenew: false,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdByAdminId: 'admin-1',
        createdByAdmin: { id: 'admin-1', fullName: 'Admin', email: 'a@x.com' },
      })
      .mockResolvedValueOnce(null);

    prisma.$transaction.mockImplementation(
      (callback: (client: unknown) => unknown) =>
        callback({
          tenantContract: {
            update: jest.fn().mockResolvedValue({
              id: 'contract-1',
              status: ContractStatus.ACTIVE,
              planId: 'plan-enterprise',
              tenantId: 'tenant-1',
              plan: {
                id: 'plan-enterprise',
                name: 'Enterprise',
                isActive: true,
              },
              createdByAdmin: {
                id: 'admin-1',
                fullName: 'Admin',
                email: 'a@x.com',
              },
              contractStartAt: new Date('2026-01-01'),
              contractEndAt: null,
              contractName: null,
              agreedPrice: { toNumber: () => 1000 },
              currency: 'EGP',
              paymentMethod: 'BANK_TRANSFER',
              paymentFrequency: 'MONTHLY',
              discountPercent: null,
              gracePeriodDays: null,
              autoRenew: false,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        }),
    );

    await service.activateContract('contract-1', 'admin-1', metadata);

    expect(
      entitlementSyncService.syncTenantPlanFromContract,
    ).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'plan-enterprise');
    expect(
      entitlementSyncService.assertTenantContractPlanConsistency,
    ).toHaveBeenCalledWith('tenant-1', expect.anything());
  });

  it('re-captures the plan snapshot when activating a draft contract', async () => {
    prisma.tenantContract.findFirst.mockResolvedValueOnce({
      id: 'contract-1',
      status: ContractStatus.DRAFT,
      planId: 'plan-enterprise',
      tenantId: null,
      plan: { isActive: true },
      deletedAt: null,
      contractStartAt: new Date('2026-01-01'),
      contractEndAt: null,
      contractName: null,
      agreedPrice: { toNumber: () => 1000 },
      currency: 'EGP',
      paymentMethod: 'BANK_TRANSFER',
      paymentFrequency: 'MONTHLY',
      discountPercent: null,
      gracePeriodDays: null,
      autoRenew: false,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdByAdminId: 'admin-1',
      createdByAdmin: { id: 'admin-1', fullName: 'Admin', email: 'a@x.com' },
    });

    const txUpdate = jest.fn().mockResolvedValue({
      id: 'contract-1',
      status: ContractStatus.ACTIVE,
      tenantId: null,
      planId: 'plan-enterprise',
      planSnapshot: null,
      plan: { id: 'plan-enterprise', name: 'Enterprise', isActive: true },
      createdByAdmin: { id: 'admin-1', fullName: 'Admin', email: 'a@x.com' },
      contractStartAt: new Date('2026-01-01'),
      contractEndAt: null,
      contractName: null,
      agreedPrice: { toNumber: () => 1000 },
      currency: 'EGP',
      paymentMethod: 'BANK_TRANSFER',
      paymentFrequency: 'MONTHLY',
      discountPercent: null,
      gracePeriodDays: null,
      autoRenew: false,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    prisma.$transaction.mockImplementation(
      (callback: (client: unknown) => unknown) =>
        callback({ tenantContract: { update: txUpdate } }),
    );

    await service.activateContract('contract-1', 'admin-1', metadata);

    const calls = txUpdate.mock.calls as unknown[][];
    const updateArgs = calls[0][0] as { data: Record<string, unknown> };
    const data = updateArgs.data;
    const snapshot = data.planSnapshot as Record<string, unknown>;

    expect(data.status).toBe(ContractStatus.ACTIVE);
    expect(snapshot.planId).toBe('plan-enterprise');
    expect(snapshot.name).toBe('Enterprise');
    expect(typeof snapshot.capturedAt).toBe('string');
  });
});

describe('ContractsService audit atomicity', () => {
  let service: ContractsService;
  let prisma: {
    subscriptionPlan: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { logContractCreated: jest.Mock };

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    deviceName: null,
    country: null,
    city: null,
  };

  const createDto = {
    planId: 'plan-enterprise',
    agreedPrice: 1000,
    currency: 'EGP',
    paymentMethod: 'BANK_TRANSFER',
    paymentFrequency: 'MONTHLY',
    contractStartAt: '2026-01-01T00:00:00.000Z',
  } as CreateContractDto;

  beforeEach(async () => {
    auditService = {
      logContractCreated: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      subscriptionPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan-enterprise',
          isActive: true,
          name: 'Enterprise',
          defaultPrice: null,
          currency: null,
          maxUsers: null,
          maxLeads: null,
          maxProjects: null,
          maxStorageBytes: null,
          featureFlags: {},
        }),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContractsAuditService, useValue: auditService },
        {
          provide: ContractEntitlementSyncService,
          useValue: {
            syncTenantPlanFromContract: jest.fn(),
            assertTenantContractPlanConsistency: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ContractsService);
  });

  it('rolls back contract creation when the audit write fails', async () => {
    const txCreate = jest.fn().mockResolvedValue({
      id: 'contract-1',
      contractName: null,
      planId: 'plan-enterprise',
    });

    prisma.$transaction.mockImplementation(
      (callback: (client: unknown) => unknown) =>
        callback({ tenantContract: { create: txCreate } }),
    );

    auditService.logContractCreated.mockRejectedValue(
      new Error('audit write failed'),
    );

    // The audit write runs inside $transaction, so its failure rejects the
    // whole transaction and Prisma rolls back the contract insert.
    await expect(
      service.createContract(createDto, 'admin-1', metadata),
    ).rejects.toThrow('audit write failed');

    expect(txCreate).toHaveBeenCalled();
    expect(auditService.logContractCreated).toHaveBeenCalled();
  });

  it('persists the plan snapshot captured at signing', async () => {
    const txCreate = jest.fn().mockResolvedValue({
      id: 'contract-1',
      contractName: null,
      status: ContractStatus.DRAFT,
      planId: 'plan-enterprise',
      planSnapshot: null,
      tenantId: null,
      agreedPrice: { toNumber: () => 1000 },
      currency: 'EGP',
      paymentMethod: 'BANK_TRANSFER',
      paymentFrequency: 'MONTHLY',
      contractStartAt: new Date('2026-01-01'),
      contractEndAt: null,
      discountPercent: null,
      gracePeriodDays: null,
      autoRenew: false,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: { id: 'plan-enterprise', name: 'Enterprise', isActive: true },
      createdByAdmin: { id: 'admin-1', fullName: 'Admin', email: 'a@x.com' },
    });

    prisma.$transaction.mockImplementation(
      (callback: (client: unknown) => unknown) =>
        callback({ tenantContract: { create: txCreate } }),
    );

    await service.createContract(createDto, 'admin-1', metadata);

    const calls = txCreate.mock.calls as unknown[][];
    const createArgs = calls[0][0] as { data: Record<string, unknown> };
    const snapshot = createArgs.data.planSnapshot as Record<string, unknown>;

    expect(snapshot.planId).toBe('plan-enterprise');
    expect(snapshot.name).toBe('Enterprise');
    expect(snapshot.quotas).toEqual({
      maxUsers: null,
      maxLeads: null,
      maxProjects: null,
      maxStorageBytes: null,
    });
  });
});
