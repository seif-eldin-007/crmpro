import { Test, TestingModule } from '@nestjs/testing';
import { LeadActivityEventType } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ActivityAnalyticsService } from './activity-analytics.service';

describe('ActivityAnalyticsService', () => {
  let service: ActivityAnalyticsService;
  let prisma: {
    leadActivity: { findMany: jest.Mock };
    importJob: { findMany: jest.Mock };
    exportJob: { findMany: jest.Mock };
    auditLog: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      leadActivity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'act-1',
            eventType: LeadActivityEventType.ASSIGNED,
            metadata: {},
            createdAt: new Date('2026-06-28T10:00:00.000Z'),
            lead: { fullName: 'Jane Doe' },
          },
          {
            id: 'act-2',
            eventType: LeadActivityEventType.STAGE_CHANGED,
            metadata: { toStageName: 'Won' },
            createdAt: new Date('2026-06-29T12:00:00.000Z'),
            lead: { fullName: 'John Smith' },
          },
        ]),
      },
      importJob: { findMany: jest.fn().mockResolvedValue([]) },
      exportJob: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityAnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ActivityAnalyticsService);
  });

  it('orders activity feed newest first', async () => {
    const result = await service.getActivity('tenant-1', {
      includeAudit: false,
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('act-2');
    expect(result[1].id).toBe('act-1');
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});
