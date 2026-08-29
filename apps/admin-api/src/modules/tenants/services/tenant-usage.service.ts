import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TenantUsageResponse } from '../dto/tenant-usage-response.dto';

@Injectable()
export class TenantUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantUsage(tenantId: string): Promise<TenantUsageResponse> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
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

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const [usersUsed, leadsUsed, projectsUsed] = await this.prisma.$transaction(
      [
        this.prisma.user.count({
          where: { tenantId, deletedAt: null, isActive: true },
        }),
        this.prisma.lead.count({
          where: { tenantId, deletedAt: null },
        }),
        this.prisma.project.count({
          where: { tenantId, deletedAt: null },
        }),
      ],
    );

    const plan = tenant.subscriptionPlan;

    return {
      users: {
        used: usersUsed,
        limit: plan.maxUsers,
      },
      leads: {
        used: leadsUsed,
        limit: plan.maxLeads,
      },
      projects: {
        used: projectsUsed,
        limit: plan.maxProjects,
      },
      storage: {
        usedBytes: Number(tenant.storageUsedBytes),
        limitBytes:
          plan.maxStorageBytes === null ? null : Number(plan.maxStorageBytes),
      },
    };
  }
}
