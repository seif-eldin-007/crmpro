import { Injectable } from '@nestjs/common';
import {
  ContractStatus,
  JobStatus,
  PaymentFrequency,
  TenantStatus,
} from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  PlatformAnalyticsDashboardData,
  PlatformAttentionItem,
  PlatformFailedImportItem,
  PlatformMrrByCurrency,
  PlatformSystemHealth,
  PlatformUsageAtRiskTenant,
} from './platform-analytics.types';

const USAGE_RISK_THRESHOLD = 90;

@Injectable()
export class PlatformAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(): Promise<PlatformAnalyticsDashboardData> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      tenantGroups,
      usersTotal,
      usersActive,
      leadsTotal,
      contractGroups,
      plansTotal,
      plansActive,
      importsLast24h,
      importsLast7d,
      importStatusGroups,
      recentAudit,
      databaseUp,
      suspendedTenants,
      trialTenants,
      draftContracts,
      failedImportsRecent,
      failedImportJobs,
      activeContracts,
      usageAtRiskTenants,
    ] = await Promise.all([
      this.prisma.tenant.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.tenantContract.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.subscriptionPlan.count(),
      this.prisma.subscriptionPlan.count({
        where: { isActive: true },
      }),
      this.prisma.importJob.count({
        where: { createdAt: { gte: last24h } },
      }),
      this.prisma.importJob.count({
        where: { createdAt: { gte: last7d } },
      }),
      this.prisma.importJob.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.adminAuditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          actorAdmin: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.checkDatabase(),
      this.prisma.tenant.findMany({
        where: { deletedAt: null, status: TenantStatus.SUSPENDED },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.tenant.findMany({
        where: { deletedAt: null, status: TenantStatus.TRIAL },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.tenantContract.findMany({
        where: { deletedAt: null, status: ContractStatus.DRAFT },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          plan: { select: { name: true } },
        },
      }),
      this.prisma.importJob.count({
        where: {
          status: { in: [JobStatus.FAILED, JobStatus.PARTIAL_SUCCESS] },
          createdAt: { gte: last7d },
        },
      }),
      this.prisma.importJob.findMany({
        where: {
          status: { in: [JobStatus.FAILED, JobStatus.PARTIAL_SUCCESS] },
          createdAt: { gte: last7d },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          status: true,
          failedRows: true,
          totalRows: true,
          createdAt: true,
          completedAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.tenantContract.findMany({
        where: { deletedAt: null, status: ContractStatus.ACTIVE },
        select: {
          agreedPrice: true,
          currency: true,
          paymentFrequency: true,
          discountPercent: true,
        },
      }),
      this.findUsageAtRiskTenants(),
    ]);

    const tenantCounts = {
      total: 0,
      active: 0,
      trial: 0,
      suspended: 0,
      cancelled: 0,
    };
    for (const row of tenantGroups) {
      const count = row._count._all;
      tenantCounts.total += count;
      switch (row.status) {
        case TenantStatus.ACTIVE:
          tenantCounts.active = count;
          break;
        case TenantStatus.TRIAL:
          tenantCounts.trial = count;
          break;
        case TenantStatus.SUSPENDED:
          tenantCounts.suspended = count;
          break;
        case TenantStatus.CANCELLED:
          tenantCounts.cancelled = count;
          break;
      }
    }

    const contractCounts = { total: 0, active: 0, draft: 0 };
    for (const row of contractGroups) {
      const count = row._count._all;
      contractCounts.total += count;
      if (row.status === ContractStatus.ACTIVE) {
        contractCounts.active = count;
      }
      if (row.status === ContractStatus.DRAFT) {
        contractCounts.draft = count;
      }
    }

    const byStatus = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
      PARTIAL_SUCCESS: 0,
    };
    for (const row of importStatusGroups) {
      byStatus[row.status] = row._count._all;
    }

    const systemHealth: PlatformSystemHealth = {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      checkedAt: now.toISOString(),
    };

    const failedImports: PlatformFailedImportItem[] = failedImportJobs.map(
      (job) => ({
        id: job.id,
        status: job.status,
        failedRows: job.failedRows,
        totalRows: job.totalRows,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
        tenant: job.tenant,
      }),
    );

    const mrrByCurrency = this.computeMrrByCurrency(activeContracts);

    const attentionItems = this.buildAttentionItems({
      suspended: tenantCounts.suspended,
      trial: tenantCounts.trial,
      draftContracts: contractCounts.draft,
      failedImportsRecent,
      usageAtRisk: usageAtRiskTenants.length,
      databaseUp,
    });

    return {
      tenants: tenantCounts,
      users: { total: usersTotal, active: usersActive },
      leads: { total: leadsTotal },
      contracts: contractCounts,
      plans: { total: plansTotal, active: plansActive },
      revenue: {
        mrrByCurrency,
        activeContractCount: activeContracts.length,
      },
      importActivity: {
        last24h: importsLast24h,
        last7d: importsLast7d,
        byStatus,
      },
      systemHealth,
      recentAudit: recentAudit.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        createdAt: entry.createdAt.toISOString(),
        actor: entry.actorAdmin
          ? {
              id: entry.actorAdmin.id,
              fullName: entry.actorAdmin.fullName,
              email: entry.actorAdmin.email,
            }
          : null,
      })),
      attention: {
        items: attentionItems,
        suspendedTenants: suspendedTenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          createdAt: tenant.createdAt.toISOString(),
        })),
        trialTenants: trialTenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          createdAt: tenant.createdAt.toISOString(),
        })),
        draftContracts: draftContracts.map((contract) => ({
          id: contract.id,
          contractName: contract.contractName,
          status: contract.status,
          planName: contract.plan.name,
          agreedPrice: Number(contract.agreedPrice),
          currency: contract.currency,
        })),
        usageAtRiskTenants,
        failedImports,
      },
    };
  }

  private computeMrrByCurrency(
    contracts: Array<{
      agreedPrice: { toString(): string } | number;
      currency: string;
      paymentFrequency: PaymentFrequency;
      discountPercent: number | null;
    }>,
  ): PlatformMrrByCurrency[] {
    const byCurrency = new Map<
      string,
      { mrr: number; contractCount: number }
    >();

    for (const contract of contracts) {
      const monthly = toMonthlyRevenue(
        Number(contract.agreedPrice),
        contract.paymentFrequency,
        contract.discountPercent,
      );
      if (monthly === null) continue;

      const current = byCurrency.get(contract.currency) ?? {
        mrr: 0,
        contractCount: 0,
      };
      current.mrr += monthly;
      current.contractCount += 1;
      byCurrency.set(contract.currency, current);
    }

    return Array.from(byCurrency.entries())
      .map(([currency, value]) => ({
        currency,
        mrr: Math.round(value.mrr * 100) / 100,
        contractCount: value.contractCount,
      }))
      .sort((a, b) => b.mrr - a.mrr);
  }

  private async findUsageAtRiskTenants(): Promise<PlatformUsageAtRiskTenant[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        status: { in: [TenantStatus.ACTIVE, TenantStatus.TRIAL] },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        storageUsedBytes: true,
        subscriptionPlan: {
          select: {
            maxUsers: true,
            maxLeads: true,
            maxProjects: true,
            maxStorageBytes: true,
          },
        },
      },
    });

    if (tenants.length === 0) {
      return [];
    }

    const tenantIds = tenants.map((tenant) => tenant.id);

    const [userCounts, leadCounts, projectCounts] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['tenantId'],
        where: {
          tenantId: { in: tenantIds },
          deletedAt: null,
          isActive: true,
        },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.project.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const usersByTenant = new Map(
      userCounts.map((row) => [row.tenantId, row._count._all]),
    );
    const leadsByTenant = new Map(
      leadCounts.map((row) => [row.tenantId, row._count._all]),
    );
    const projectsByTenant = new Map(
      projectCounts.map((row) => [row.tenantId, row._count._all]),
    );

    const atRisk: PlatformUsageAtRiskTenant[] = [];

    for (const tenant of tenants) {
      const plan = tenant.subscriptionPlan;
      const checks: Array<{
        metric: PlatformUsageAtRiskTenant['metric'];
        used: number;
        limit: number | null;
      }> = [
        {
          metric: 'users',
          used: usersByTenant.get(tenant.id) ?? 0,
          limit: plan.maxUsers,
        },
        {
          metric: 'leads',
          used: leadsByTenant.get(tenant.id) ?? 0,
          limit: plan.maxLeads,
        },
        {
          metric: 'projects',
          used: projectsByTenant.get(tenant.id) ?? 0,
          limit: plan.maxProjects,
        },
        {
          metric: 'storage',
          used: Number(tenant.storageUsedBytes),
          limit:
            plan.maxStorageBytes === null ? null : Number(plan.maxStorageBytes),
        },
      ];

      for (const check of checks) {
        if (check.limit === null || check.limit <= 0) continue;
        const percent = (check.used / check.limit) * 100;
        if (percent < USAGE_RISK_THRESHOLD) continue;
        atRisk.push({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          metric: check.metric,
          used: check.used,
          limit: check.limit,
          percent: Math.round(percent),
        });
      }
    }

    return atRisk.sort((a, b) => b.percent - a.percent).slice(0, 8);
  }

  private buildAttentionItems(input: {
    suspended: number;
    trial: number;
    draftContracts: number;
    failedImportsRecent: number;
    usageAtRisk: number;
    databaseUp: boolean;
  }): PlatformAttentionItem[] {
    const items: PlatformAttentionItem[] = [];

    if (!input.databaseUp) {
      items.push({
        id: 'database-down',
        severity: 'critical',
        title: 'Database unreachable',
        description:
          'Platform health check failed. Investigate connectivity now.',
        href: '/system',
        count: 1,
      });
    }

    if (input.suspended > 0) {
      items.push({
        id: 'suspended-tenants',
        severity: 'critical',
        title: 'Suspended tenants',
        description: 'Workspaces currently locked out of the CRM.',
        href: '/tenants?status=SUSPENDED',
        count: input.suspended,
      });
    }

    if (input.usageAtRisk > 0) {
      items.push({
        id: 'usage-at-risk',
        severity: 'warning',
        title: 'Tenants near plan limits',
        description:
          'Usage at or above 90% — upgrade or intervene before hard limits.',
        href: '/dashboard',
        count: input.usageAtRisk,
      });
    }

    if (input.failedImportsRecent > 0) {
      items.push({
        id: 'failed-imports',
        severity: 'warning',
        title: 'Failed imports (7d)',
        description:
          'Import jobs that failed or partially succeeded this week.',
        href: '/imports',
        count: input.failedImportsRecent,
      });
    }

    if (input.draftContracts > 0) {
      items.push({
        id: 'draft-contracts',
        severity: 'warning',
        title: 'Draft contracts awaiting activation',
        description:
          'Commercial deals still in draft — activate before provisioning.',
        href: '/contracts?status=DRAFT',
        count: input.draftContracts,
      });
    }

    if (input.trial > 0) {
      items.push({
        id: 'trial-tenants',
        severity: 'info',
        title: 'Tenants on trial',
        description: 'Monitor conversion and follow up before trials stall.',
        href: '/tenants?status=TRIAL',
        count: input.trial,
      });
    }

    return items;
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

function toMonthlyRevenue(
  agreedPrice: number,
  frequency: PaymentFrequency,
  discountPercent: number | null,
): number | null {
  if (!Number.isFinite(agreedPrice) || agreedPrice < 0) {
    return null;
  }

  const discount = Math.min(Math.max(discountPercent ?? 0, 0), 100);
  const net = agreedPrice * (1 - discount / 100);

  switch (frequency) {
    case PaymentFrequency.MONTHLY:
      return net;
    case PaymentFrequency.QUARTERLY:
      return net / 3;
    case PaymentFrequency.SEMI_ANNUAL:
      return net / 6;
    case PaymentFrequency.ANNUAL:
      return net / 12;
    case PaymentFrequency.CUSTOM:
    default:
      return null;
  }
}
