import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AUDIT_ENTITY_TYPES } from '../audit/audit.constants';
import {
  BULK_LEAD_ACTION_TYPES,
  BULK_LEAD_AUDIT_ACTIONS,
  BULK_ACTION_VALIDATION_MESSAGE,
  MAX_BULK_ACTION_SIZE,
} from './constants/leads-bulk.constants';
import { BulkAssignLeadsDto } from './dto/bulk-assign-leads.dto';
import { LeadsBulkService } from './leads-bulk.service';
import { LeadAssignmentService } from './services/lead-assignment.service';
import { LeadStageService } from './services/lead-stage.service';

describe('LeadsBulkService', () => {
  let service: LeadsBulkService;
  let leadAssignmentService: { assignLead: jest.Mock };
  let auditWriter: { createAuditLog: jest.Mock };

  beforeEach(async () => {
    leadAssignmentService = {
      assignLead: jest.fn(),
    };
    auditWriter = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsBulkService,
        { provide: LeadAssignmentService, useValue: leadAssignmentService },
        { provide: LeadStageService, useValue: { moveStage: jest.fn() } },
        { provide: AuditWriterService, useValue: auditWriter },
      ],
    }).compile();

    service = module.get(LeadsBulkService);
  });

  it('deduplicates lead IDs before processing', async () => {
    leadAssignmentService.assignLead.mockResolvedValue({});

    const result = await service.bulkAssignLeads('tenant-1', 'actor-1', {
      leadIds: ['lead-a', 'lead-a', 'lead-b'],
      userId: 'user-1',
    });

    expect(leadAssignmentService.assignLead).toHaveBeenCalledTimes(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(auditWriter.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          leadCount: 2,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('returns partial success when some leads fail', async () => {
    leadAssignmentService.assignLead
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new BadRequestException('Archived leads cannot be assigned'),
      );

    const result = await service.bulkAssignLeads('tenant-1', 'actor-1', {
      leadIds: ['lead-1', 'lead-2', 'lead-3'],
      userId: 'user-1',
    });

    expect(result).toEqual({
      successCount: 2,
      failureCount: 1,
      failures: [
        {
          leadId: 'lead-3',
          reason: 'Archived leads cannot be assigned',
        },
      ],
    });
  });

  it('writes a single bulk assign audit log', async () => {
    leadAssignmentService.assignLead.mockResolvedValue({});

    await service.bulkAssignLeads('tenant-1', 'actor-1', {
      leadIds: ['lead-1'],
      userId: 'user-1',
    });

    expect(auditWriter.createAuditLog).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorUserId: 'actor-1',
      action: BULK_LEAD_AUDIT_ACTIONS.ASSIGNED,
      entityType: AUDIT_ENTITY_TYPES.LEAD_BULK_ACTION,
      metadata: {
        actionType: BULK_LEAD_ACTION_TYPES.ASSIGN,
        targetUserId: 'user-1',
        leadCount: 1,
        successCount: 1,
        failureCount: 0,
      },
    });
  });

  it('captures not-found failures without aborting the batch', async () => {
    leadAssignmentService.assignLead
      .mockRejectedValueOnce(new NotFoundException('Lead not found'))
      .mockResolvedValueOnce({});

    const result = await service.bulkAssignLeads('tenant-1', 'actor-1', {
      leadIds: ['missing-lead', 'lead-2'],
      userId: null,
    });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.failures[0]?.reason).toBe('Lead not found');
  });
});

describe('BulkAssignLeadsDto validation', () => {
  it('rejects batches above the max size', async () => {
    const dto = new BulkAssignLeadsDto();
    dto.leadIds = Array.from(
      { length: MAX_BULK_ACTION_SIZE + 1 },
      (_, index) =>
        `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    );
    dto.userId = '22222222-2222-4222-8222-222222222201';

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'leadIds')).toBe(true);
    expect(
      errors.find((error) => error.property === 'leadIds')?.constraints,
    ).toEqual(
      expect.objectContaining({
        arrayMaxSize: BULK_ACTION_VALIDATION_MESSAGE,
      }),
    );
  });
});
