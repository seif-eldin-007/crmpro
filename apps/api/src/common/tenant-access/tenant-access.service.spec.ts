import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantStatus } from '@crmpro/database';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ACCESS_MESSAGES } from './tenant-access.constants';
import { TenantAccessService } from './tenant-access.service';

describe('TenantAccessService', () => {
  let service: TenantAccessService;
  let prisma: {
    tenant: { findFirst: jest.Mock };
    tenantContract: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findFirst: jest.fn(),
      },
      tenantContract: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantAccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TenantAccessService);
  });

  function mockActiveTenant(): void {
    prisma.tenant.findFirst.mockResolvedValue({
      id: 'tenant-1',
      status: TenantStatus.ACTIVE,
    });
  }

  it('allows ACTIVE tenants with an in-term active contract', async () => {
    mockActiveTenant();
    prisma.tenantContract.findFirst.mockResolvedValue({
      contractEndAt: new Date('2027-01-01T00:00:00.000Z'),
      gracePeriodDays: 10,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.assertTenantAccessible('tenant-1'),
    ).resolves.toBeUndefined();
  });

  it('allows ACTIVE tenants during post-termination grace', async () => {
    mockActiveTenant();
    prisma.tenantContract.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        contractEndAt: new Date('2026-06-01T00:00:00.000Z'),
        gracePeriodDays: 30,
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
      });

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));

    await expect(
      service.assertTenantAccessible('tenant-1'),
    ).resolves.toBeUndefined();

    jest.useRealTimers();
  });

  it('blocks tenants after grace has expired', async () => {
    mockActiveTenant();
    prisma.tenantContract.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        contractEndAt: new Date('2026-05-01T00:00:00.000Z'),
        gracePeriodDays: 7,
        updatedAt: new Date('2026-05-02T00:00:00.000Z'),
      });

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));

    await expect(service.assertTenantAccessible('tenant-1')).rejects.toThrow(
      new ForbiddenException(TENANT_ACCESS_MESSAGES.CONTRACT_LAPSED),
    );

    jest.useRealTimers();
  });

  it('blocks SUSPENDED tenants with suspended message', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: 'tenant-1',
      status: TenantStatus.SUSPENDED,
    });

    await expect(service.assertTenantAccessible('tenant-1')).rejects.toThrow(
      new ForbiddenException(TENANT_ACCESS_MESSAGES.SUSPENDED),
    );
    await expect(service.isTenantAccessible('tenant-1')).resolves.toBe(false);
  });

  it('blocks CANCELLED tenants with inactive message', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      id: 'tenant-1',
      status: TenantStatus.CANCELLED,
    });

    await expect(service.assertTenantAccessible('tenant-1')).rejects.toThrow(
      new ForbiddenException(TENANT_ACCESS_MESSAGES.INACTIVE),
    );
  });

  it('blocks missing tenants', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);

    await expect(service.assertTenantAccessible('tenant-1')).rejects.toThrow(
      new ForbiddenException(TENANT_ACCESS_MESSAGES.INACTIVE),
    );
  });

  it('blocks ACTIVE tenants with an active contract past end + grace', async () => {
    mockActiveTenant();
    prisma.tenantContract.findFirst.mockResolvedValueOnce({
      contractEndAt: new Date('2026-01-01T00:00:00.000Z'),
      gracePeriodDays: 0,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));

    await expect(service.assertTenantAccessible('tenant-1')).rejects.toThrow(
      TENANT_ACCESS_MESSAGES.CONTRACT_LAPSED,
    );

    jest.useRealTimers();
  });
});
