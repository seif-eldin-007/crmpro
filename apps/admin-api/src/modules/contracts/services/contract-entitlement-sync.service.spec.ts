import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContractEntitlementSyncService } from './contract-entitlement-sync.service';

describe('ContractEntitlementSyncService', () => {
  let service: ContractEntitlementSyncService;
  let prisma: {
    tenant: { findFirst: jest.Mock; update: jest.Mock };
    tenantContract: { findFirst: jest.Mock };
  };

  const tx = {
    tenant: { update: jest.fn() },
    tenantContract: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      tenantContract: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractEntitlementSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ContractEntitlementSyncService);
    jest.clearAllMocks();
  });

  it('syncs tenant subscription plan from contract', async () => {
    await service.syncTenantPlanFromContract(tx as never, 'tenant-1', 'plan-2');

    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { subscriptionPlanId: 'plan-2' },
    });
  });

  it('passes when tenant plan matches active contract', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue({
      planId: 'plan-growth',
    });
    prisma.tenant.findFirst.mockResolvedValue({
      subscriptionPlanId: 'plan-growth',
    });

    await expect(
      service.assertTenantContractPlanConsistency('tenant-1'),
    ).resolves.toBeUndefined();
  });

  it('throws when tenant plan diverges from active contract', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue({
      planId: 'plan-enterprise',
    });
    prisma.tenant.findFirst.mockResolvedValue({
      subscriptionPlanId: 'plan-growth',
    });

    await expect(
      service.assertTenantContractPlanConsistency('tenant-1'),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('skips consistency check when no active contract exists', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue(null);

    await expect(
      service.assertTenantContractPlanConsistency('tenant-1'),
    ).resolves.toBeUndefined();

    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it('uses transaction client when provided', async () => {
    const txClient = {
      tenant: {
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          subscriptionPlanId: 'plan-growth',
        }),
      },
      tenantContract: {
        findFirst: jest.fn().mockResolvedValue({
          planId: 'plan-growth',
        }),
      },
    };

    await expect(
      service.assertTenantContractPlanConsistency(
        'tenant-1',
        txClient as never,
      ),
    ).resolves.toBeUndefined();

    expect(txClient.tenantContract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: ContractStatus.ACTIVE,
        }) as Record<string, unknown>,
      }),
    );
  });
});
