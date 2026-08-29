import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminSecurityEventType, SecuritySeverity } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SecurityEventsService } from './security-events.service';

describe('SecurityEventsService', () => {
  let service: SecurityEventsService;
  let prisma: {
    adminSecurityEvent: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const event = {
    id: 'event-1',
    eventType: AdminSecurityEventType.TOKEN_REUSE,
    severity: SecuritySeverity.CRITICAL,
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
    fingerprint: 'fp',
    metadata: { revokedCount: 2 },
    createdAt: new Date('2026-06-29T12:00:00.000Z'),
    admin: {
      id: 'admin-1',
      fullName: 'Platform Admin',
      email: 'admin@example.com',
    },
  };

  beforeEach(async () => {
    prisma = {
      adminSecurityEvent: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (queries) => Promise.all(queries)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityEventsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SecurityEventsService);
  });

  it('lists security events with filters', async () => {
    prisma.adminSecurityEvent.findMany.mockResolvedValue([event]);
    prisma.adminSecurityEvent.count.mockResolvedValue(1);

    const result = await service.listSecurityEvents({
      page: 1,
      limit: 20,
      adminId: 'admin-1',
      eventType: AdminSecurityEventType.TOKEN_REUSE,
      severity: SecuritySeverity.CRITICAL,
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(prisma.adminSecurityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          adminId: 'admin-1',
          eventType: AdminSecurityEventType.TOKEN_REUSE,
          severity: SecuritySeverity.CRITICAL,
          createdAt: expect.objectContaining({
            gte: expect.any(Date) as Date,
            lte: expect.any(Date) as Date,
          }) as Record<string, unknown>,
        }) as Record<string, unknown>,
      }),
    );
    expect(result.items[0]?.id).toBe('event-1');
  });

  it('rejects invalid date ranges', async () => {
    await expect(
      service.listSecurityEvents({
        page: 1,
        limit: 20,
        from: '2026-06-30',
        to: '2026-06-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns a single security event by id', async () => {
    prisma.adminSecurityEvent.findUnique.mockResolvedValue(event);

    const result = await service.getSecurityEvent('event-1');

    expect(result.eventType).toBe(AdminSecurityEventType.TOKEN_REUSE);
    expect(result.admin?.email).toBe('admin@example.com');
  });

  it('throws when security event is missing', async () => {
    prisma.adminSecurityEvent.findUnique.mockResolvedValue(null);

    await expect(service.getSecurityEvent('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
