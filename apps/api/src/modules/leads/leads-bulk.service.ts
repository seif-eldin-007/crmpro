import { HttpException, Injectable } from '@nestjs/common';
import { AuditWriterService } from '../audit/audit-writer.service';
import { AUDIT_ENTITY_TYPES } from '../audit/audit.constants';
import {
  BULK_LEAD_ACTION_TYPES,
  BULK_LEAD_AUDIT_ACTIONS,
} from './constants/leads-bulk.constants';
import { BulkAssignLeadsDto } from './dto/bulk-assign-leads.dto';
import { BulkMoveStageDto } from './dto/bulk-move-stage.dto';
import { LeadAssignmentService } from './services/lead-assignment.service';
import { LeadStageService } from './services/lead-stage.service';
import type { BulkLeadActionResult } from './types/leads-bulk.types';

@Injectable()
export class LeadsBulkService {
  constructor(
    private readonly leadAssignmentService: LeadAssignmentService,
    private readonly leadStageService: LeadStageService,
    private readonly auditWriter: AuditWriterService,
  ) {}

  async bulkAssignLeads(
    tenantId: string,
    actorUserId: string,
    dto: BulkAssignLeadsDto,
  ): Promise<BulkLeadActionResult> {
    const leadIds = this.deduplicateLeadIds(dto.leadIds);
    const result = await this.processLeads(leadIds, async (leadId) => {
      await this.leadAssignmentService.assignLead(
        leadId,
        tenantId,
        actorUserId,
        {
          userId: dto.userId,
        },
      );
    });

    await this.auditWriter.createAuditLog({
      tenantId,
      actorUserId,
      action: BULK_LEAD_AUDIT_ACTIONS.ASSIGNED,
      entityType: AUDIT_ENTITY_TYPES.LEAD_BULK_ACTION,
      metadata: {
        actionType: BULK_LEAD_ACTION_TYPES.ASSIGN,
        targetUserId: dto.userId,
        leadCount: leadIds.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
      },
    });

    return result;
  }

  async bulkMoveStage(
    tenantId: string,
    actorUserId: string,
    dto: BulkMoveStageDto,
  ): Promise<BulkLeadActionResult> {
    const leadIds = this.deduplicateLeadIds(dto.leadIds);
    const result = await this.processLeads(leadIds, async (leadId) => {
      await this.leadStageService.moveStage(leadId, tenantId, actorUserId, {
        pipelineStageId: dto.targetStageId,
      });
    });

    await this.auditWriter.createAuditLog({
      tenantId,
      actorUserId,
      action: BULK_LEAD_AUDIT_ACTIONS.STAGE_CHANGED,
      entityType: AUDIT_ENTITY_TYPES.LEAD_BULK_ACTION,
      metadata: {
        actionType: BULK_LEAD_ACTION_TYPES.MOVE_STAGE,
        targetStageId: dto.targetStageId,
        leadCount: leadIds.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
      },
    });

    return result;
  }

  private deduplicateLeadIds(leadIds: string[]): string[] {
    return [...new Set(leadIds)];
  }

  private async processLeads(
    leadIds: string[],
    action: (leadId: string) => Promise<void>,
  ): Promise<BulkLeadActionResult> {
    const failures: BulkLeadActionResult['failures'] = [];
    let successCount = 0;

    for (const leadId of leadIds) {
      try {
        await action(leadId);
        successCount += 1;
      } catch (error) {
        failures.push({
          leadId,
          reason: this.extractFailureReason(error),
        });
      }
    }

    return {
      successCount,
      failureCount: failures.length,
      failures,
    };
  }

  private extractFailureReason(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return response;
      }

      if (typeof response === 'object' && response !== null) {
        const message = (response as { message?: string | string[] }).message;

        if (Array.isArray(message)) {
          return message.join(', ');
        }

        if (typeof message === 'string') {
          return message;
        }
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Operation failed';
  }
}
