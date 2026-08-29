import { Injectable } from '@nestjs/common';
import {
  JobStatus,
  LeadActivityEventType,
  LeadStatus,
  PipelineCloseType,
  Prisma,
} from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  DEFAULT_RECENT_ACTIVITY_LIMIT,
  DEFAULT_TREND_MONTHS,
  UNKNOWN_SOURCE_LABEL,
} from '../analytics.constants';
import {
  AgentPerformanceAnalytics,
  AnalyticsDateRange,
  DashboardOverviewBaseData,
  DeveloperPerformanceAnalytics,
  LeadSourceAnalytics,
  LeadStatusDistribution,
  LeadTrendPoint,
  PipelineFunnelAnalytics,
  ProjectPerformanceAnalytics,
  RecentActivityItem,
  RecentActivityResult,
} from '../analytics.types';
import {
  buildLeadCreatedAtFilter,
  startOfUtcDay,
  startOfUtcMonth,
  startOfUtcWeek,
  subtractUtcMonths,
} from './analytics-date.util';
import {
  calculateConversionRate,
  calculateDropOffPercentage,
  calculatePercentage,
  calculateSourceConversionRate,
  nullableAverage,
} from '../mappers/analytics.mapper';
import {
  queryAgentTimingMetrics,
  queryAvgLeadAgeDays,
  queryAvgResponseTimeHours,
} from './analytics-timing.query';

@Injectable()
export class AnalyticsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  private baseLeadWhere(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Prisma.LeadWhereInput {
    const createdAt = buildLeadCreatedAtFilter(range);

    return {
      tenantId,
      deletedAt: null,
      ...(createdAt && { createdAt }),
    };
  }

  async getOverview(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<DashboardOverviewBaseData> {
    const baseWhere = this.baseLeadWhere(tenantId, range);
    const now = new Date();
    const todayStart = startOfUtcDay(now);
    const weekStart = startOfUtcWeek(now);
    const monthStart = startOfUtcMonth(now);

    const [
      totalLeads,
      openLeads,
      wonLeads,
      lostLeads,
      newToday,
      newThisWeek,
      newThisMonth,
      activePipelines,
      activeProjects,
      developers,
      importsToday,
      exportsToday,
      avgResponseTimeHoursRaw,
      avgLeadAgeDaysRaw,
    ] = await Promise.all([
      this.prisma.lead.count({ where: baseWhere }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          status: LeadStatus.OPEN,
          pipelineStage: { isClosed: false },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          pipelineStage: { closeType: PipelineCloseType.WON },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          pipelineStage: { closeType: PipelineCloseType.LOST },
        },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: weekStart },
        },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: monthStart },
        },
      }),
      this.prisma.pipeline.count({ where: { tenantId } }),
      this.prisma.project.count({
        where: { tenantId, isActive: true, deletedAt: null },
      }),
      this.prisma.developer.count({
        where: { tenantId, deletedAt: null },
      }),
      this.prisma.importJob.count({
        where: {
          tenantId,
          status: JobStatus.COMPLETED,
          completedAt: { gte: todayStart },
        },
      }),
      this.prisma.exportJob.count({
        where: {
          tenantId,
          status: JobStatus.COMPLETED,
          completedAt: { gte: todayStart },
        },
      }),
      queryAvgResponseTimeHours(this.prisma, tenantId, range),
      queryAvgLeadAgeDays(this.prisma, tenantId, range),
    ]);

    return {
      totalLeads,
      openLeads,
      wonLeads,
      lostLeads,
      newToday,
      newThisWeek,
      newThisMonth,
      conversionRate: calculateConversionRate(wonLeads, lostLeads),
      avgResponseTimeHours: nullableAverage(avgResponseTimeHoursRaw),
      avgLeadAgeDays: nullableAverage(avgLeadAgeDaysRaw),
      activePipelines,
      activeProjects,
      developers,
      importsToday,
      exportsToday,
    };
  }

  async getPipelineFunnel(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<PipelineFunnelAnalytics[]> {
    const baseWhere = this.baseLeadWhere(tenantId, range);

    const pipelines = await this.prisma.pipeline.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        stages: {
          select: { id: true, name: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const counts = await this.prisma.lead.groupBy({
      by: ['pipelineId', 'pipelineStageId'],
      where: baseWhere,
      _count: { _all: true },
    });

    const countMap = new Map<string, number>();
    for (const row of counts) {
      countMap.set(`${row.pipelineId}:${row.pipelineStageId}`, row._count._all);
    }

    return pipelines.map((pipeline) => {
      const totalInPipeline = pipeline.stages.reduce(
        (sum, stage) => sum + (countMap.get(`${pipeline.id}:${stage.id}`) ?? 0),
        0,
      );

      return {
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        stages: pipeline.stages.map((stage, index) => {
          const count = countMap.get(`${pipeline.id}:${stage.id}`) ?? 0;
          const previousCount =
            index > 0
              ? (countMap.get(
                  `${pipeline.id}:${pipeline.stages[index - 1].id}`,
                ) ?? 0)
              : null;

          return {
            stageId: stage.id,
            stageName: stage.name,
            count,
            percentage: calculatePercentage(count, totalInPipeline),
            dropOffFromPrevious:
              previousCount === null
                ? null
                : calculateDropOffPercentage(previousCount, count),
          };
        }),
      };
    });
  }

  async getLeadSources(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<LeadSourceAnalytics[]> {
    const baseWhere = this.baseLeadWhere(tenantId, range);

    const grouped = await this.prisma.lead.groupBy({
      by: ['sourceId'],
      where: baseWhere,
      _count: { _all: true },
    });

    const wonGrouped = await this.prisma.lead.groupBy({
      by: ['sourceId'],
      where: {
        ...baseWhere,
        pipelineStage: { closeType: PipelineCloseType.WON },
      },
      _count: { _all: true },
    });

    const wonBySource = new Map(
      wonGrouped.map((row) => [row.sourceId ?? '__null__', row._count._all]),
    );

    const sourceIds = grouped
      .map((row) => row.sourceId)
      .filter((id): id is string => id !== null);

    const sources = sourceIds.length
      ? await this.prisma.leadSource.findMany({
          where: { id: { in: sourceIds }, tenantId },
          select: { id: true, name: true },
        })
      : [];

    const sourceNameById = new Map(
      sources.map((source) => [source.id, source.name]),
    );
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

    const results = grouped.map((row) => {
      const count = row._count._all;
      const sourceKey = row.sourceId ?? '__null__';
      const won = wonBySource.get(sourceKey) ?? 0;
      const sourceName = row.sourceId
        ? (sourceNameById.get(row.sourceId) ?? UNKNOWN_SOURCE_LABEL)
        : UNKNOWN_SOURCE_LABEL;

      return {
        sourceId: row.sourceId,
        sourceName,
        count,
        percentage: calculatePercentage(count, total),
        won,
        conversionRate: calculateSourceConversionRate(won, count),
      };
    });

    return results.sort((a, b) => b.count - a.count);
  }

  async getAgentPerformance(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AgentPerformanceAnalytics[]> {
    const baseWhere = this.baseLeadWhere(tenantId, range);

    const assigned = await this.prisma.lead.groupBy({
      by: ['assignedUserId'],
      where: { ...baseWhere, assignedUserId: { not: null } },
      _count: { _all: true },
    });

    const wonGrouped = await this.prisma.lead.groupBy({
      by: ['assignedUserId'],
      where: {
        ...baseWhere,
        assignedUserId: { not: null },
        pipelineStage: { closeType: PipelineCloseType.WON },
      },
      _count: { _all: true },
    });

    const lostGrouped = await this.prisma.lead.groupBy({
      by: ['assignedUserId'],
      where: {
        ...baseWhere,
        assignedUserId: { not: null },
        pipelineStage: { closeType: PipelineCloseType.LOST },
      },
      _count: { _all: true },
    });

    const userIds = assigned
      .map((row) => row.assignedUserId)
      .filter((id): id is string => id !== null);

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds }, tenantId },
          select: { id: true, name: true },
        })
      : [];

    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    const wonByUser = new Map(
      wonGrouped.map((row) => [row.assignedUserId!, row._count._all]),
    );
    const lostByUser = new Map(
      lostGrouped.map((row) => [row.assignedUserId!, row._count._all]),
    );

    const timingRows = await queryAgentTimingMetrics(
      this.prisma,
      tenantId,
      range,
    );
    const timingByUser = new Map(
      timingRows.map((row) => [
        row.user_id,
        {
          avgResponseTimeHours: nullableAverage(row.avg_response_hours),
          avgClosingTimeDays: nullableAverage(row.avg_closing_days),
        },
      ]),
    );

    return assigned
      .filter((row) => row.assignedUserId)
      .map((row) => {
        const userId = row.assignedUserId!;
        const won = wonByUser.get(userId) ?? 0;
        const lost = lostByUser.get(userId) ?? 0;
        const timing = timingByUser.get(userId);

        return {
          userId,
          name: userNameById.get(userId) ?? 'Unknown Agent',
          assignedLeads: row._count._all,
          won,
          lost,
          conversionRate: calculateConversionRate(won, lost),
          avgResponseTimeHours: timing?.avgResponseTimeHours ?? null,
          avgClosingTimeDays: timing?.avgClosingTimeDays ?? null,
        };
      })
      .sort((a, b) => b.assignedLeads - a.assignedLeads);
  }

  async getProjectPerformance(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<ProjectPerformanceAnalytics[]> {
    const createdAt = buildLeadCreatedAtFilter(range);

    const grouped = await this.prisma.leadProjectInterest.groupBy({
      by: ['projectId'],
      where: {
        project: { tenantId, deletedAt: null },
        ...(createdAt && { createdAt }),
      },
      _count: { _all: true },
    });

    if (grouped.length === 0) {
      return [];
    }

    const projects = await this.prisma.project.findMany({
      where: {
        tenantId,
        id: { in: grouped.map((row) => row.projectId) },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        developer: { select: { name: true } },
      },
    });

    const projectById = new Map(
      projects.map((project) => [project.id, project]),
    );

    return grouped
      .map((row) => {
        const project = projectById.get(row.projectId);
        if (!project) {
          return null;
        }

        return {
          projectId: project.id,
          projectName: project.name,
          developer: project.developer.name,
          interestedLeads: row._count._all,
        };
      })
      .filter((item): item is ProjectPerformanceAnalytics => item !== null)
      .sort((a, b) => b.interestedLeads - a.interestedLeads);
  }

  async getDeveloperPerformance(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<DeveloperPerformanceAnalytics[]> {
    const developers = await this.prisma.developer.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            projects: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    const createdAt = buildLeadCreatedAtFilter(range);

    const interestCounts = await this.prisma.leadProjectInterest.groupBy({
      by: ['projectId'],
      where: {
        project: { tenantId, deletedAt: null },
        ...(createdAt && { createdAt }),
      },
      _count: { _all: true },
    });

    const projects = interestCounts.length
      ? await this.prisma.project.findMany({
          where: {
            tenantId,
            id: { in: interestCounts.map((row) => row.projectId) },
          },
          select: { id: true, developerId: true },
        })
      : [];

    const developerIdByProject = new Map(
      projects.map((project) => [project.id, project.developerId]),
    );

    const interestedByDeveloper = new Map<string, number>();
    for (const row of interestCounts) {
      const developerId = developerIdByProject.get(row.projectId);
      if (!developerId) {
        continue;
      }
      interestedByDeveloper.set(
        developerId,
        (interestedByDeveloper.get(developerId) ?? 0) + row._count._all,
      );
    }

    return developers
      .map((developer) => ({
        developerId: developer.id,
        developerName: developer.name,
        projects: developer._count.projects,
        interestedLeads: interestedByDeveloper.get(developer.id) ?? 0,
      }))
      .sort((a, b) => b.interestedLeads - a.interestedLeads);
  }

  async getLeadTrends(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<LeadTrendPoint[]> {
    const trendRange = this.resolveTrendRange(range);

    const rows = await this.prisma.$queryRaw<
      Array<{ month: string; new_leads: bigint; won: bigint; lost: bigint }>
    >`
      SELECT
        to_char(date_trunc('month', l."createdAt"), 'YYYY-MM') AS month,
        COUNT(*)::bigint AS new_leads,
        COUNT(*) FILTER (WHERE ps."closeType" = 'WON')::bigint AS won,
        COUNT(*) FILTER (WHERE ps."closeType" = 'LOST')::bigint AS lost
      FROM "Lead" l
      INNER JOIN "PipelineStage" ps ON ps."id" = l."pipelineStageId"
      WHERE l."tenantId" = ${tenantId}::uuid
        AND l."deletedAt" IS NULL
        AND l."createdAt" >= ${trendRange.from}
        AND l."createdAt" <= ${trendRange.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      month: row.month,
      newLeads: Number(row.new_leads),
      won: Number(row.won),
      lost: Number(row.lost),
    }));
  }

  async getStatusDistribution(
    tenantId: string,
    _range: AnalyticsDateRange,
  ): Promise<LeadStatusDistribution> {
    // Lifecycle distribution is a current-state snapshot (like pipeline funnel),
    // not limited to leads created within the selected analytics range.
    const baseWhere: Prisma.LeadWhereInput = {
      tenantId,
      deletedAt: null,
    };

    const [open, won, lost, archived] = await Promise.all([
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          status: LeadStatus.OPEN,
          pipelineStage: { isClosed: false },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          pipelineStage: { closeType: PipelineCloseType.WON },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...baseWhere,
          pipelineStage: { closeType: PipelineCloseType.LOST },
        },
      }),
      this.prisma.lead.count({
        where: { ...baseWhere, status: LeadStatus.ARCHIVED },
      }),
    ]);

    return { open, won, lost, archived };
  }

  async getRecentActivity(
    tenantId: string,
    range: AnalyticsDateRange,
    page: number,
    limit: number,
  ): Promise<RecentActivityResult> {
    const createdAt = buildLeadCreatedAtFilter(range);
    const take = limit ?? DEFAULT_RECENT_ACTIVITY_LIMIT;
    const skip = (page - 1) * take;

    const activityWhere: Prisma.LeadActivityWhereInput = {
      tenantId,
      eventType: {
        in: [
          LeadActivityEventType.LEAD_CREATED,
          LeadActivityEventType.ASSIGNED,
          LeadActivityEventType.REASSIGNED,
          LeadActivityEventType.STAGE_CHANGED,
        ],
      },
      ...(createdAt && { createdAt }),
    };

    const jobDateFilter = createdAt ? { completedAt: createdAt } : undefined;

    const [activities, importJobs, exportJobs] = await Promise.all([
      this.prisma.leadActivity.findMany({
        where: activityWhere,
        select: {
          id: true,
          eventType: true,
          metadata: true,
          createdAt: true,
          lead: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.importJob.findMany({
        where: {
          tenantId,
          status: JobStatus.COMPLETED,
          ...(jobDateFilter ?? {}),
        },
        select: {
          id: true,
          completedAt: true,
          successfulRows: true,
          fileAsset: { select: { originalFilename: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 100,
      }),
      this.prisma.exportJob.findMany({
        where: {
          tenantId,
          status: JobStatus.COMPLETED,
          ...(jobDateFilter ?? {}),
        },
        select: {
          id: true,
          completedAt: true,
          rowCount: true,
          exportType: true,
        },
        orderBy: { completedAt: 'desc' },
        take: 100,
      }),
    ]);

    const merged: RecentActivityItem[] = [
      ...activities.map((activity) => ({
        id: activity.id,
        type: this.mapActivityType(activity.eventType),
        title: this.buildActivityTitle(
          activity.eventType,
          activity.lead.fullName,
        ),
        occurredAt: activity.createdAt.toISOString(),
        metadata: {
          ...(typeof activity.metadata === 'object' &&
          activity.metadata !== null
            ? (activity.metadata as Record<string, unknown>)
            : {}),
        },
      })),
      ...importJobs
        .filter((job) => job.completedAt)
        .map((job) => ({
          id: job.id,
          type: 'IMPORT_COMPLETED' as const,
          title: `Import completed: ${job.fileAsset.originalFilename}`,
          occurredAt: job.completedAt!.toISOString(),
          metadata: {
            successfulRows: job.successfulRows,
          },
        })),
      ...exportJobs
        .filter((job) => job.completedAt)
        .map((job) => ({
          id: job.id,
          type: 'EXPORT_COMPLETED' as const,
          title: `Export completed: ${job.exportType}`,
          occurredAt: job.completedAt!.toISOString(),
          metadata: {
            rowCount: job.rowCount,
            exportType: job.exportType,
          },
        })),
    ].sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const totalItems = merged.length;
    const items = merged.slice(skip, skip + take);

    return {
      items,
      page,
      limit: take,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / take)),
    };
  }

  private resolveTrendRange(range: AnalyticsDateRange): {
    from: Date;
    to: Date;
  } {
    if (range.from && range.to) {
      return { from: range.from, to: range.to };
    }

    const to = range.to ?? new Date();
    const from =
      range.from ??
      subtractUtcMonths(startOfUtcMonth(to), DEFAULT_TREND_MONTHS - 1);

    return { from, to };
  }

  private mapActivityType(
    eventType: LeadActivityEventType,
  ): RecentActivityItem['type'] {
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

  private buildActivityTitle(
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
}
