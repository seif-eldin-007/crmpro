import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus, TenantStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantOwnerService } from './services/tenant-owner.service';
import { TenantProvisioningService } from './services/tenant-provisioning.service';
import { TenantUsageService } from './services/tenant-usage.service';
import { TenantsAuditService } from './services/tenants-audit.service';
import { TenantsService } from './tenants.service';

describe('TenantsService reactivateTenant', () => {
  let service: TenantsService;

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    deviceName: null,
    country: null,
    city: null,
  };

  let prisma: {
    tenant: { findFirst: jest.Mock; update: jest.Mock };
    tenantContract: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  let auditService: { logTenantReactivated: jest.Mock };

  beforeEach(async () => {
    auditService = {
      logTenantReactivated: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      tenant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          name: 'Acme',
          status: TenantStatus.SUSPENDED,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      tenantContract: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'contract-1',
          plan: { id: 'plan-1', isActive: true },
        }),
      },
      $transaction: jest.fn((callback: (client: unknown) => unknown) =>
        callback({
          tenant: prisma.tenant,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TenantProvisioningService,
          useValue: {},
        },
        {
          provide: TenantOwnerService,
          useValue: {},
        },
        {
          provide: TenantUsageService,
          useValue: {},
        },
        {
          provide: TenantsAuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  it('reactivates when tenant has an active contract on an active plan', async () => {
    const result = await service.reactivateTenant(
      'tenant-1',
      'admin-1',
      metadata,
    );

    expect(result).toEqual({
      tenantId: 'tenant-1',
      status: TenantStatus.ACTIVE,
    });
    expect(prisma.tenantContract.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          status: ContractStatus.ACTIVE,
          deletedAt: null,
        },
      }),
    );
    expect(auditService.logTenantReactivated).toHaveBeenCalled();
  });

  it('rejects when tenant is already active', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      status: TenantStatus.ACTIVE,
    });

    await expect(
      service.reactivateTenant('tenant-1', 'admin-1', metadata),
    ).rejects.toThrow('Tenant is already active');

    expect(prisma.tenantContract.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when tenant has no active contract', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue(null);

    await expect(
      service.reactivateTenant('tenant-1', 'admin-1', metadata),
    ).rejects.toMatchObject({
      message: 'Tenant must have an active contract before reactivation',
      constructor: BadRequestException,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when active contract plan is archived', async () => {
    prisma.tenantContract.findFirst.mockResolvedValue({
      id: 'contract-1',
      plan: { id: 'plan-1', isActive: false },
    });

    await expect(
      service.reactivateTenant('tenant-1', 'admin-1', metadata),
    ).rejects.toThrow(
      'Active contract plan must be active before reactivation',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
