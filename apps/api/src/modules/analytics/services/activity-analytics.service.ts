import { Injectable } from '@nestjs/common';
import { JobStatus, LeadActivityEventType, Prisma } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BULK_LEAD_AUDIT_ACTIONS } from '../../leads/constants/leads-bulk.constants';
import {
  EXPORT_AUDIT_ACTIONS,
  IMPORT_AUDIT_ACTIONS,
} from '../../audit/audit.constants';
import { ACTIVITY_FEED_LIMIT } from '../analytics.constants';
import type { ActivityFeedItem } from '../analytics.types';

@Injectable()
export class ActivityAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivity(
    tenantId: string,
    options: { includeAudit: boolean },
  ): Promise<ActivityFeedItem[]> {
    const [activities, importJobs, exportJobs] = await Promise.all([
      this.prisma.leadActivity.findMany({
        where: {
          tenantId,
          eventType: {
            in: [
              LeadActivityEventType.LEAD_CREATED,
              LeadActivityEventType.ASSIGNED,
              LeadActivityEventType.REASSIGNED,
              LeadActivityEventType.STAGE_CHANGED,
            ],
          },
        },
        select: {
          id: true,
          leadId: true,
          eventType: true,
          metadata: true,
          createdAt: true,
          lead: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.importJob.findMany({
        where: {
          tenantId,
          status: JobStatus.COMPLETED,
          completedAt: { not: null },
        },
        select: {
          id: true,
          completedAt: true,
          successfulRows: true,
          fileAsset: { select: { originalFilename: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),
      this.prisma.exportJob.findMany({
        where: {
          tenantId,
          status: JobStatus.COMPLETED,
          completedAt: { not: null },
        },
        select: {
          id: true,
          completedAt: true,
          rowCount: true,
          exportType: true,
        },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),
    ]);

    const auditLogs = options.includeAudit
      ? await this.prisma.auditLog.findMany({
          where: {
            tenantId,
            action: {
              in: [
                BULK_LEAD_AUDIT_ACTIONS.ASSIGNED,
                BULK_LEAD_AUDIT_ACTIONS.STAGE_CHANGED,
                IMPORT_AUDIT_ACTIONS.COMPLETED,
                EXPORT_AUDIT_ACTIONS.COMPLETED,
              ],
            },
          },
          select: {
            id: true,
            action: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : [];

    const merged: ActivityFeedItem[] = [
      ...activities.map((activity) => ({
        id: activity.id,
        type: this.mapLeadActivityType(activity.eventType),
        title: this.buildLeadActivityTitle(
          activity.eventType,
          activity.lead.fullName,
        ),
        occurredAt: activity.createdAt.toISOString(),
        metadata: {
          ...this.asMetadataRecord(activity.metadata),
          leadId: activity.leadId,
        },
      })),
      ...importJobs.map((job) => ({
        id: job.id,
        type: 'IMPORT_COMPLETED',
        title: `Import completed: ${job.fileAsset.originalFilename}`,
        occurredAt: job.completedAt!.toISOString(),
        metadata: {
          successfulRows: job.successfulRows,
        },
      })),
      ...exportJobs.map((job) => ({
        id: job.id,
        type: 'EXPORT_COMPLETED',
        title: `Export completed: ${job.exportType}`,
        occurredAt: job.completedAt!.toISOString(),
        metadata: {
          rowCount: job.rowCount,
          exportType: job.exportType,
        },
      })),
      ...auditLogs.map((log) => ({
        id: log.id,
        type: log.action,
        title: this.buildAuditTitle(log.action, log.metadata),
        occurredAt: log.createdAt.toISOString(),
        metadata: this.asMetadataRecord(log.metadata),
      })),
    ];

    return merged
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      )
      .slice(0, ACTIVITY_FEED_LIMIT);
  }

  private mapLeadActivityType(eventType: LeadActivityEventType): string {
    switch (eventType) {
      case LeadActivityEventType.LEAD_CREATED:
        return 'LEAD_CREATED';
      case LeadActivityEventType.ASSIGNED:
      case LeadActivityEventType.REASSIGNED:
        return 'LEAD_ASSIGNED';
      default:
        return 'STAGE_CHANGED';
    }
  }

  private buildLeadActivityTitle(
    eventType: LeadActivityEventType,
    leadName: string,
  ): string {
    switch (eventType) {
      case LeadActivityEventType.LEAD_CREATED:
        return `Lead created: ${leadName}`;
      case LeadActivityEventType.ASSIGNED:
      case LeadActivityEventType.REASSIGNED:
        return `Lead assigned: ${leadName}`;
      default:
        return `Stage changed: ${leadName}`;
    }
  }

  private buildAuditTitle(action: string, metadata: Prisma.JsonValue): string {
    switch (action) {
      case BULK_LEAD_AUDIT_ACTIONS.ASSIGNED:
        return `Bulk assign: ${this.formatBulkLeadCount(metadata)} leads`;
      case BULK_LEAD_AUDIT_ACTIONS.STAGE_CHANGED:
        return `Bulk stage change: ${this.formatBulkLeadCount(metadata)} leads`;
      case IMPORT_AUDIT_ACTIONS.COMPLETED:
        return 'Import completed';
      case EXPORT_AUDIT_ACTIONS.COMPLETED:
        return 'Export completed';
      default:
        return action;
    }
  }

  private formatBulkLeadCount(metadata: Prisma.JsonValue): string {
    const data = this.asMetadataRecord(metadata);

    return typeof data.leadCount === 'number'
      ? String(data.leadCount)
      : 'multiple';
  }

  private asMetadataRecord(value: Prisma.JsonValue): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value;
    }

    return {};
  }
}
