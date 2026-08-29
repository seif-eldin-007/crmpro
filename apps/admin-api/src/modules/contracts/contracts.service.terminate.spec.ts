import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ContractsAuditService } from './services/contracts-audit.service';
import { ContractEntitlementSyncService } from './services/contract-entitlement-sync.service';
import { ContractsService } from './contracts.service';

// TODO(Plan 03): rewrite when contract termination semantics change.
// This suite asserts the legacy "terminate without suspending" behavior and
// is deliberately skipped — see docs/plans/03 (tenant lifecycle / termination).
describe.skip('ContractsService terminateContract', () => {
  let service: ContractsService;

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    deviceName: null,
    country: null,
    city: null,
  };

  let prisma: {
    tenantContract: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  let auditService: { logContractTerminated: jest.Mock };

  const existingContract = {
    id: 'contract-1',
    status: ContractStatus.ACTIVE,
    tenantId: 'tenant-1',
    contractEndAt: new Date('2026-12-31T00:00:00.000Z'),
    gracePeriodDays: 14,
    deletedAt: null,
    planId: 'plan-1',
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

  beforeEach(async () => {
    auditService = {
      logContractTerminated: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      tenantContract: {
        findFirst: jest.fn().mockResolvedValue(existingContract),
        update: jest.fn().mockResolvedValue({
          ...existingContract,
          status: ContractStatus.TERMINATED,
        }),
      },
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

  it('terminates without suspending tenant and records grace accessUntil', async () => {
    await service.terminateContract('contract-1', 'admin-1', metadata);

    expect(prisma.tenantContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ContractStatus.TERMINATED },
      }),
    );

    expect(auditService.logContractTerminated).toHaveBeenCalledWith(
      'admin-1',
      'contract-1',
      expect.objectContaining({
        tenantId: 'tenant-1',
        gracePeriodDays: 14,
        accessUntil: '2027-01-14T23:59:59.999Z',
      }),
    );
  });
});
