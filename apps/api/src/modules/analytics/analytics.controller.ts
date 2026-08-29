import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS, type PermissionKey } from '@crmpro/shared/auth';
import { PermissionsGuard, RequirePermission } from '../../common/auth';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { PLAN_FEATURES } from '../../common/entitlements/entitlement.constants';
import { RequirePlanFeature } from '../../common/entitlements/decorators/require-plan-feature.decorator';
import { PlanEntitlementGuard } from '../../common/entitlements/guards/plan-entitlement.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AnalyticsAggregatorService } from './analytics-aggregator.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsDateQueryDto } from './dto/analytics-date-query.dto';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';
import { AnalyticsRecentActivityQueryDto } from './dto/analytics-recent-activity-query.dto';
import { parseAnalyticsDateRange } from './queries/analytics-date.util';
import { parseAnalyticsRange } from './utils/analytics-range.util';
import { canViewActivitySection } from './utils/analytics-section-permissions.util';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanEntitlementGuard)
@RequirePlanFeature(PLAN_FEATURES.ANALYTICS)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly aggregatorService: AnalyticsAggregatorService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Permission-aware analytics dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard analytics sections' })
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    const data = await this.aggregatorService.getDashboard(
      user.id,
      user.tenantId,
      query.range ?? '30d',
    );
    return { success: true, data };
  }

  @Get('overview')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Dashboard overview metrics' })
  @ApiResponse({ status: 200, description: 'Overview analytics snapshot' })
  async getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateQueryDto,
  ) {
    const result = await this.analyticsService.getOverview(
      user.tenantId,
      parseAnalyticsDateRange(query),
    );
    return { success: true, data: result.data };
  }

  @Get('pipeline')
  @RequirePermission(PERMISSIONS.PIPELINE_READ)
  @ApiOperation({ summary: 'Pipeline funnel analytics' })
  async getPipeline(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.analyticsService.getPipelineAnalytics(
      user.tenantId,
    );
    return { success: true, data: result.data };
  }

  @Get('trends')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Daily lead creation and closing trends' })
  async getTrends(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    const result = await this.analyticsService.getTrendAnalytics(
      user.tenantId,
      parseAnalyticsRange(query.range),
    );
    return { success: true, data: result.data };
  }

  @Get('team')
  @RequirePermission(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Top performing team members' })
  async getTeam(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.analyticsService.getTeamAnalytics(user.tenantId);
    return { success: true, data: result.data };
  }

  @Get('activity')
  @ApiOperation({ summary: 'Recent CRM activity feed' })
  async getActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: { permissionKeys?: Set<PermissionKey> },
  ) {
    const permissionKeys =
      request.permissionKeys ??
      (await this.permissionsService.getPermissionKeysForUser(
        user.id,
        user.tenantId,
      ));

    if (!canViewActivitySection(permissionKeys)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const result = await this.analyticsService.getActivityFeed(
      user.tenantId,
      permissionKeys.has(PERMISSIONS.AUDIT_READ),
    );
    return { success: true, data: result.data };
  }

  @Get('sources')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Lead source performance' })
  async getSources(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateQueryDto,
  ) {
    const result = await this.analyticsService.getLeadSources(
      user.tenantId,
      parseAnalyticsDateRange(query),
    );
    return { success: true, data: result.data };
  }

  @Get('agents')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Sales agent performance' })
  async getAgents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateQueryDto,
  ) {
    const result = await this.analyticsService.getAgentPerformance(
      user.tenantId,
      parseAnalyticsDateRange(query),
    );
    return { success: true, data: result.data };
  }

  @Get('projects')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Project interest analytics' })
  async getProjects(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateQueryDto,
  ) {
    const result = await this.analyticsService.getProjectPerformance(
      user.tenantId,
      parseAnalyticsDateRange(query),
    );
    return { success: true, data: result.data };
  }

  @Get('developers')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Developer performance analytics' })
  async getDevelopers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateQueryDto,
  ) {
    const result = await this.analyticsService.getDeveloperPerformance(
      user.tenantId,
      parseAnalyticsDateRange(query),
    );
    return { success: true, data: result.data };
  }

  @Get('status')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Lead status distribution' })
  async getStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsDateQueryDto,
  ) {
    const result = await this.analyticsService.getStatusDistribution(
      user.tenantId,
      parseAnalyticsDateRange(query),
    );
    return { success: true, data: result.data };
  }

  @Get('recent-activity')
  @RequirePermission(PERMISSIONS.ANALYTICS_READ)
  @ApiOperation({ summary: 'Recent CRM activity feed (legacy)' })
  async getRecentActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRecentActivityQueryDto,
  ) {
    const result = await this.analyticsService.getRecentActivity(
      user.tenantId,
      parseAnalyticsDateRange(query),
      query.page ?? 1,
      query.limit ?? 20,
    );
    return { success: true, data: result.data };
  }
}
