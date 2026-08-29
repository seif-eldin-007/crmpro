import { Test, TestingModule } from '@nestjs/testing';
import { LeadActivityService } from './services/lead-activity.service';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import { QuotaService } from '../../common/quota/quota.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeadsService } from './leads.service';

describe('LeadsService quota enforcement', () => {
  let service: LeadsService;
  let quotaService: { canCreateLeadInTransaction: jest.Mock };

  const pipeline = {
    pipelineId: 'pipeline-1',
    pipelineStageId: 'stage-1',
  };

  beforeEach(async () => {
    quotaService = {
      canCreateLeadInTransaction: jest.fn(),
    };

    const prisma = {
      lead: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      leadSource: { findFirst: jest.fn() },
      $transaction: jest.fn(
        (callback: (client: { lead: { create: jest.Mock } }) => unknown) =>
          callback({
            lead: {
              create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
            },
          }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: LeadActivityService,
          useValue: { createActivity: jest.fn() },
        },
        { provide: DomainEventBus, useValue: { publish: jest.fn() } },
        { provide: QuotaService, useValue: quotaService },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  it('returns row error when import exceeds lead quota', async () => {
    quotaService.canCreateLeadInTransaction.mockResolvedValue(false);

    const result = await service.createLeadFromImport(
      'tenant-1',
      'user-1',
      'job-1',
      {
        fullName: 'Jane Doe',
        primaryPhone: '+201001112233',
      },
      pipeline,
    );

    expect(result).toEqual({
      success: false,
      reason: 'Lead quota exceeded',
    });
  });
});
