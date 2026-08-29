import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadActivityEventType, LeadStatus, Prisma } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MoveStageDto } from '../dto/move-stage.dto';
import { leadSelect, toLeadResponse } from '../lead.mapper';
import { LeadWorkflowResult } from '../types/lead.types';
import { LeadActivityService } from './lead-activity.service';
import { DomainEventBus } from '../../../common/events/domain-event-bus.service';
import { LeadMovedStageEvent } from '../../../common/events/domain-event.types';
import { NotificationTriggerService } from '../../notifications/notification-trigger.service';

const workflowLeadSelect = {
  id: true,
  tenantId: true,
  status: true,
  pipelineId: true,
  pipelineStageId: true,
  pipelineStage: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.LeadSelect;

type WorkflowLeadRecord = Prisma.LeadGetPayload<{
  select: typeof workflowLeadSelect;
}>;

@Injectable()
export class LeadStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadActivityService: LeadActivityService,
    private readonly domainEventBus: DomainEventBus,
    private readonly notificationTrigger: NotificationTriggerService,
  ) {}

  async moveStage(
    leadId: string,
    tenantId: string,
    actorUserId: string,
    dto: MoveStageDto,
  ): Promise<LeadWorkflowResult> {
    const lead = await this.getWorkflowLeadOrThrow(leadId, tenantId);
    this.ensureLeadIsOpen(lead.status, 'move stages');

    if (lead.pipelineStageId === dto.pipelineStageId) {
      throw new BadRequestException('Lead is already in this stage');
    }

    const targetStage = await this.prisma.pipelineStage.findFirst({
      where: {
        id: dto.pipelineStageId,
        tenantId,
        pipelineId: lead.pipelineId,
      },
      select: {
        id: true,
        name: true,
        isClosed: true,
        closeType: true,
      },
    });

    if (!targetStage) {
      throw new BadRequestException(
        'Pipeline stage not found or does not belong to lead pipeline',
      );
    }

    const fromStage = lead.pipelineStage;
    const isClosedTransition = targetStage.isClosed;

    const activity = await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: { pipelineStageId: targetStage.id },
      });

      return this.leadActivityService.createActivity(
        {
          tenantId,
          leadId: lead.id,
          actorUserId,
          eventType: LeadActivityEventType.STAGE_CHANGED,
          metadata: {
            fromStageId: fromStage.id,
            fromStageName: fromStage.name,
            toStageId: targetStage.id,
            toStageName: targetStage.name,
            isClosedTransition,
            closeType: targetStage.closeType,
          },
        },
        tx,
      );
    });

    const updatedLead = await this.prisma.lead.findFirst({
      where: { id: lead.id, tenantId, deletedAt: null },
      select: leadSelect,
    });

    if (!updatedLead) {
      throw new NotFoundException('Lead not found');
    }

    void this.domainEventBus.publish(
      new LeadMovedStageEvent(tenantId, lead.id),
    );

    if (updatedLead.assignedUser) {
      void this.notificationTrigger.notifyLeadStageChanged({
        tenantId,
        recipientUserId: updatedLead.assignedUser.id,
        leadId: updatedLead.id,
        leadName: updatedLead.fullName,
        fromStageName: fromStage.name,
        toStageName: targetStage.name,
        closeType: targetStage.closeType,
        actorUserId,
      });
    }

    return {
      lead: toLeadResponse(updatedLead),
      activity,
    };
  }

  private async getWorkflowLeadOrThrow(
    id: string,
    tenantId: string,
  ): Promise<WorkflowLeadRecord> {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: workflowLeadSelect,
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  private ensureLeadIsOpen(status: LeadStatus, action: string): void {
    if (status === LeadStatus.ARCHIVED) {
      throw new BadRequestException(`Archived leads cannot ${action}`);
    }
  }
}
