import { Test, TestingModule } from '@nestjs/testing';
import { TenantStatus } from '@crmpro/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  TenantInactiveException,
  TenantStatusService,
} from './tenant-status.service';

describe('TenantStatusService', () => {
  let service: TenantStatusService;
  let prisma: { tenant: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      tenant: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantStatusService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TenantStatusService);
  });

  it('allows ACTIVE tenants', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ status: TenantStatus.ACTIVE });

    await expect(
      service.assertTenantActive('tenant-1'),
    ).resolves.toBeUndefined();
    await expect(service.isTenantActive('tenant-1')).resolves.toBe(true);
  });

  it('blocks SUSPENDED tenants', async () => {
    prisma.tenant.findFirst.mockResolvedValue({
      status: TenantStatus.SUSPENDED,
    });

    await expect(service.assertTenantActive('tenant-1')).rejects.toThrow(
      TenantInactiveException,
    );
    await expect(service.isTenantActive('tenant-1')).resolves.toBe(false);
  });
});
