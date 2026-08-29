import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContractStatus } from '@crmpro/database';
import { PERMISSIONS } from '@crmpro/shared';
import { PasswordService } from '../../../common/security/password.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantsAuditService } from './tenants-audit.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

describe('TenantProvisioningService contract concurrency', () => {
  let service: TenantProvisioningService;

  const dto = {
    contractId: 'contract-1',
    name: 'Acme Realty',
    slug: 'acme-realty',
    ownerFullName: 'Jane Owner',
    ownerEmail: 'owner@acme.test',
    ownerPassword: 'Password1',
  };

  const metadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    deviceName: null,
    country: null,
    city: null,
  };

  const lockedContractRow = {
    id: 'contract-1',
    planId: 'plan-1',
    tenantId: null,
    status: ContractStatus.ACTIVE,
    deletedAt: null,
    planIsActive: true,
  };

  let prisma: {
    tenantContract: { findFirst: jest.Mock };
    tenant: { findFirst: jest.Mock; create: jest.Mock };
    user: { findFirst: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  let tx: {
    $queryRaw: jest.Mock;
    tenant: { create: jest.Mock };
    tenantContract: { updateMany: jest.Mock };
    role: { createMany: jest.Mock };
    permission: { findMany: jest.Mock };
    rolePermission: { createMany: jest.Mock };
    leadSource: { createMany: jest.Mock };
    pipeline: { create: jest.Mock };
    pipelineStage: { createMany: jest.Mock };
    user: { create: jest.Mock };
  };

  const allPermissions = Object.values(PERMISSIONS).map((key, index) => ({
    id: `perm-${index}`,
    key,
  }));

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([lockedContractRow]),
      tenant: {
        create: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          name: dto.name,
          slug: dto.slug,
        }),
      },
      tenantContract: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      role: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
      permission: {
        findMany: jest.fn().mockResolvedValue(allPermissions),
      },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      leadSource: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      pipeline: {
        create: jest.fn().mockResolvedValue({ id: 'pipeline-1' }),
      },
      pipelineStage: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    };

    prisma = {
      tenantContract: {
        findFirst: jest.fn().mockResolvedValue({
          id: dto.contractId,
          status: ContractStatus.ACTIVE,
          tenantId: null,
          plan: { isActive: true },
        }),
      },
      tenant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantProvisioningService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PasswordService,
          useValue: { hash: jest.fn().mockResolvedValue('hashed-password') },
        },
        {
          provide: TenantsAuditService,
          useValue: {
            logTenantCreated: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(TenantProvisioningService);
  });

  it('locks the contract row inside the provisioning transaction', async () => {
    await service.provisionTenant(dto, 'admin-1', metadata);

    expect(tx.$queryRaw).toHaveBeenCalled();
    const [query] = tx.$queryRaw.mock.calls[0] as unknown[];
    expect(String(query)).toContain('FOR UPDATE');
    expect(String(query)).toContain('"TenantContract"');
  });

  it('links the contract with a conditional update on tenantId IS NULL', async () => {
    await service.provisionTenant(dto, 'admin-1', metadata);

    expect(tx.tenantContract.updateMany).toHaveBeenCalledWith({
      where: {
        id: dto.contractId,
        tenantId: null,
        deletedAt: null,
        status: ContractStatus.ACTIVE,
      },
      data: { tenantId: 'tenant-1' },
    });
  });

  it('rolls back when the contract is already linked after acquiring the lock', async () => {
    tx.$queryRaw.mockResolvedValue([
      { ...lockedContractRow, tenantId: 'tenant-existing' },
    ]);

    await expect(
      service.provisionTenant(dto, 'admin-1', metadata),
    ).rejects.toThrow(ConflictException);

    expect(tx.tenant.create).not.toHaveBeenCalled();
    expect(tx.tenantContract.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back when the conditional contract link affects zero rows', async () => {
    tx.tenantContract.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.provisionTenant(dto, 'admin-1', metadata),
    ).rejects.toThrow(ConflictException);

    expect(tx.tenant.create).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
