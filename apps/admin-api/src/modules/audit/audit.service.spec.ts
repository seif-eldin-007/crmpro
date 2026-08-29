import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminActorType } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    adminAuditLog: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const newerLog = {
    id: 'audit-new',
    actorType: AdminActorType.ADMIN,
    action: 'TENANT_CREATED',
    entityType: 'Tenant',
    entityId: 'tenant-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    metadata: { contractId: 'contract-1' },
    createdAt: new Date('2026-06-29T12:00:00.000Z'),
    actorAdmin: {
      id: 'admin-1',
      fullName: 'Platform Admin',
      email: 'admin@example.com',
    },
  };

  const olderLog = {
    ...newerLog,
    id: 'audit-old',
    createdAt: new Date('2026-06-28T12:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      adminAuditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (queries) => Promise.all(queries)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditService);
  });

  it('returns newest audit logs first', async () => {
    prisma.adminAuditLog.findMany.mockResolvedValue([newerLog, olderLog]);
    prisma.adminAuditLog.count.mockResolvedValue(2);

    const result = await service.listAuditLogs({ page: 1, limit: 20 });

    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.items[0]?.id).toBe('audit-new');
    expect(result.items[1]?.id).toBe('audit-old');
  });

  it('filters by actor, action, entityType, and tenant', async () => {
    prisma.adminAuditLog.findMany.mockResolvedValue([]);
    prisma.adminAuditLog.count.mockResolvedValue(0);

    await service.listAuditLogs({
      page: 1,
      limit: 20,
      actorAdminId: 'admin-1',
      action: 'TENANT_SUSPENDED',
      entityType: 'Tenant',
      tenantId: 'tenant-1',
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorAdminId: 'admin-1',
          action: 'TENANT_SUSPENDED',
          entityType: 'Tenant',
          entityId: 'tenant-1',
          createdAt: expect.objectContaining({
            gte: expect.any(Date) as Date,
            lte: expect.any(Date) as Date,
          }) as Record<string, unknown>,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('rejects invalid date ranges', async () => {
    await expect(
      service.listAuditLogs({
        page: 1,
        limit: 20,
        from: '2026-06-30',
        to: '2026-06-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns a single audit log by id', async () => {
    prisma.adminAuditLog.findUnique.mockResolvedValue(newerLog);

    const result = await service.getAuditLog('audit-new');

    expect(result.id).toBe('audit-new');
    expect(result.actor?.email).toBe('admin@example.com');
  });

  it('throws when audit log is missing', async () => {
    prisma.adminAuditLog.findUnique.mockResolvedValue(null);

    await expect(service.getAuditLog('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
