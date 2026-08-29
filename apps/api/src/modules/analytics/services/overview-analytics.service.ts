import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { STALE_LEAD_DAYS } from '../analytics.constants';
import type {
  AnalyticsDateRange,
  DashboardOverviewData,
} from '../analytics.types';
import { AnalyticsQueryService } from '../queries/analytics-query.service';

@Injectable()
export class OverviewAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: AnalyticsQueryService,
  ) {}

  async getOverview(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<DashboardOverviewData> {
    const [base, staleLeads, unassignedLeads] = await Promise.all([
      this.queryService.getOverview(tenantId, range),
      this.countStaleLeads(tenantId),
      this.countUnassignedLeads(tenantId),
    ]);

    return {
      ...base,
      staleLeads,
      unassignedLeads,
    };
  }

  private async countStaleLeads(tenantId: string): Promise<number> {
    const staleBefore = new Date();
    staleBefore.setUTCDate(staleBefore.getUTCDate() - STALE_LEAD_DAYS);

    return this.prisma.lead.count({
      where: {
        tenantId,
        deletedAt: null,
        status: LeadStatus.OPEN,
        pipelineStage: { isClosed: false },
        OR: [
          {
            lastContactedAt: null,
            createdAt: { lt: staleBefore },
          },
          {
            lastContactedAt: { lt: staleBefore },
          },
        ],
      },
    });
  }

  private async countUnassignedLeads(tenantId: string): Promise<number> {
    return this.prisma.lead.count({
      where: {
        tenantId,
        deletedAt: null,
        status: LeadStatus.OPEN,
        pipelineStage: { isClosed: false },
        assignedUserId: null,
      },
    });
  }
}
