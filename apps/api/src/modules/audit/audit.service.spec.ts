import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditActorType } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditLog: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
    user: { findMany: jest.Mock };
    role: { findMany: jest.Mock };
    lead: { findMany: jest.Mock };
    project: { findMany: jest.Mock };
    fileAsset: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const newerLog = {
    id: 'audit-new',
    actorType: AuditActorType.USER,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: 'user-2',
    metadata: {},
    createdAt: new Date('2026-06-29T12:00:00.000Z'),
    actor: {
      id: 'actor-1',
      name: 'Owner User',
      email: 'owner@example.com',
    },
  };

  const olderLog = {
    ...newerLog,
    id: 'audit-old',
    createdAt: new Date('2026-06-28T12:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'user-2', name: 'Target User' }]),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      lead: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      fileAsset: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (queries: unknown) => {
        if (Array.isArray(queries)) {
          return Promise.all(queries);
        }

        return (queries as (client: typeof prisma) => unknown)(prisma);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AuditService);
  });

  it('returns newest audit logs first', async () => {
    prisma.auditLog.findMany.mockResolvedValue([newerLog, olderLog]);
    prisma.auditLog.count.mockResolvedValue(2);

    const result = await service.listAuditLogs('tenant-1', {
      page: 1,
      limit: 20,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.items[0]?.id).toBe('audit-new');
    expect(result.items[0]?.entityLabel).toBe('Target User');
    expect(result.items[1]?.id).toBe('audit-old');
  });

  it('returns 404 when audit log belongs to another tenant', async () => {
    prisma.auditLog.findFirst.mockResolvedValue(null);

    await expect(service.getAuditLog('tenant-a', 'audit-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
