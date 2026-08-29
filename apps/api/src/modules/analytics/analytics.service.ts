import { Injectable } from '@nestjs/common';
import { CacheService } from '../../common/cache/cache.service';
import { LoggingService } from '../../common/logging/logging.service';
import { ANALYTICS_ENDPOINTS } from './analytics.constants';
import {
  AgentPerformanceAnalytics,
  AnalyticsCacheResult,
  AnalyticsDateRange,
  ActivityFeedItem,
  DashboardOverviewData,
  DeveloperPerformanceAnalytics,
  LeadSourceAnalytics,
  LeadStatusDistribution,
  LeadTrendPoint,
  PipelineAnalyticsData,
  PipelineFunnelAnalytics,
  ProjectPerformanceAnalytics,
  RecentActivityResult,
  TeamAnalyticsData,
  TrendAnalyticsData,
} from './analytics.types';
import { AnalyticsQueryService } from './queries/analytics-query.service';
import { OverviewAnalyticsService } from './services/overview-analytics.service';
import { PipelineAnalyticsService } from './services/pipeline-analytics.service';
import { TrendAnalyticsService } from './services/trend-analytics.service';
import { TeamAnalyticsService } from './services/team-analytics.service';
import { ActivityAnalyticsService } from './services/activity-analytics.service';

type AnalyticsHandler<T> = () => Promise<T>;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly queryService: AnalyticsQueryService,
    private readonly overviewService: OverviewAnalyticsService,
    private readonly pipelineService: PipelineAnalyticsService,
    private readonly trendService: TrendAnalyticsService,
    private readonly teamService: TeamAnalyticsService,
    private readonly activityService: ActivityAnalyticsService,
    private readonly cacheService: CacheService,
    private readonly loggingService: LoggingService,
  ) {}

  getOverview(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<DashboardOverviewData>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.overview, range, () =>
      this.overviewService.getOverview(tenantId, range),
    );
  }

  getPipelineAnalytics(
    tenantId: string,
  ): Promise<AnalyticsCacheResult<PipelineAnalyticsData>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.pipeline, {}, () =>
      this.pipelineService.getPipeline(tenantId),
    );
  }

  getTrendAnalytics(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<TrendAnalyticsData>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.trends, range, () =>
      this.trendService.getTrends(tenantId, range),
    );
  }

  getTeamAnalytics(
    tenantId: string,
  ): Promise<AnalyticsCacheResult<TeamAnalyticsData>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.team, {}, () =>
      this.teamService.getTeam(tenantId),
    );
  }

  getActivityFeed(
    tenantId: string,
    includeAudit: boolean,
  ): Promise<AnalyticsCacheResult<ActivityFeedItem[]>> {
    return this.withCache(
      tenantId,
      ANALYTICS_ENDPOINTS.activity,
      {},
      () => this.activityService.getActivity(tenantId, { includeAudit }),
      includeAudit ? 'audit' : 'lead',
    );
  }

  getPipelineFunnel(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<PipelineFunnelAnalytics[]>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.pipeline, range, () =>
      this.queryService.getPipelineFunnel(tenantId, range),
    );
  }

  getLeadSources(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<LeadSourceAnalytics[]>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.sources, range, () =>
      this.queryService.getLeadSources(tenantId, range),
    );
  }

  getAgentPerformance(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<AgentPerformanceAnalytics[]>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.agents, range, () =>
      this.queryService.getAgentPerformance(tenantId, range),
    );
  }

  getProjectPerformance(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<ProjectPerformanceAnalytics[]>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.projects, range, () =>
      this.queryService.getProjectPerformance(tenantId, range),
    );
  }

  getDeveloperPerformance(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<DeveloperPerformanceAnalytics[]>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.developers, range, () =>
      this.queryService.getDeveloperPerformance(tenantId, range),
    );
  }

  getLeadTrends(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<LeadTrendPoint[]>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.trends, range, () =>
      this.queryService.getLeadTrends(tenantId, range),
    );
  }

  getStatusDistribution(
    tenantId: string,
    range: AnalyticsDateRange,
  ): Promise<AnalyticsCacheResult<LeadStatusDistribution>> {
    return this.withCache(tenantId, ANALYTICS_ENDPOINTS.status, range, () =>
      this.queryService.getStatusDistribution(tenantId, range),
    );
  }

  getRecentActivity(
    tenantId: string,
    range: AnalyticsDateRange,
    page: number,
    limit: number,
  ): Promise<AnalyticsCacheResult<RecentActivityResult>> {
    const fromKey = range.from?.toISOString();
    const toKey = range.to?.toISOString();
    const extra = `p${page}:l${limit}`;

    return this.withCache(
      tenantId,
      ANALYTICS_ENDPOINTS.recentActivity,
      { from: range.from, to: range.to },
      () => this.queryService.getRecentActivity(tenantId, range, page, limit),
      extra,
      fromKey,
      toKey,
    );
  }

  private async withCache<T>(
    tenantId: string,
    endpoint: string,
    range: AnalyticsDateRange,
    handler: AnalyticsHandler<T>,
    extra?: string,
    fromKey?: string,
    toKey?: string,
  ): Promise<AnalyticsCacheResult<T>> {
    const startedAt = Date.now();
    const cacheKey = this.cacheService.buildAnalyticsKey(
      tenantId,
      endpoint,
      fromKey ?? range.from?.toISOString(),
      toKey ?? range.to?.toISOString(),
      extra,
    );

    const cached = await this.cacheService.get<T>(cacheKey);
    if (cached !== null) {
      this.logAnalytics(endpoint, Date.now() - startedAt, true);
      return { data: cached, cacheHit: true };
    }

    const data = await handler();
    await this.cacheService.set(
      cacheKey,
      data,
      this.cacheService.getAnalyticsTtlSeconds(),
    );

    this.logAnalytics(endpoint, Date.now() - startedAt, false);
    return { data, cacheHit: false };
  }

  private logAnalytics(
    endpoint: string,
    durationMs: number,
    cacheHit: boolean,
  ): void {
    this.loggingService.info({
      module: 'Analytics',
      operation: endpoint,
      durationMs,
      status: cacheHit ? 'cache_hit' : 'cache_miss',
      metadata: {
        cacheHit,
      },
    });
  }
}
