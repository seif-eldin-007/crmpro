import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ContractsAuditService } from './services/contracts-audit.service';
import { ContractEntitlementSyncService } from './services/contract-entitlement-sync.service';
import { ContractsService } from './contracts.service';

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

    prisma = {
      tenantContract: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      subscriptionPlan: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'plan-enterprise', isActive: true }),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ContractsAuditService,
          useValue: {
            logContractActivated: jest.fn(),
            logContractUpdated: jest.fn(),
          },
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
});
