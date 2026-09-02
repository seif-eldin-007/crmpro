import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma } from '@crmpro/database';
import { parsePlanSnapshot, type PlanSnapshotQuotas } from '@crmpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QUOTA_EXCEEDED_MESSAGES } from './quota.constants';
import type {
  QuotaTransactionClient,
  TenantPlanLimits,
  TenantQuotaContext,
} from './quota.types';

const tenantQuotaSelect = {
  storageUsedBytes: true,
  subscriptionPlan: {
    select: {
      maxUsers: true,
      maxLeads: true,
      maxProjects: true,
      maxStorageBytes: true,
    },
  },
} as const;

/** Structural reader satisfied by both PrismaService and a transaction client. */
type SnapshotReader = {
  tenantContract: {
    findFirst(args: {
      where: Prisma.TenantContractWhereInput;
      select: { planSnapshot: true };
      orderBy: { createdAt: 'desc' };
    }): Promise<{ planSnapshot: Prisma.JsonValue } | null>;
  };
};

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanCreateLead(tenantId: string): Promise<void> {
    if (!(await this.canCreateLead(tenantId))) {
      throw new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.LEAD);
    }
  }

  async canCreateLead(tenantId: string): Promise<boolean> {
    const plan = await this.getTenantPlanLimits(tenantId);

    if (plan.maxLeads === null) {
      return true;
    }

    const used = await this.prisma.lead.count({
      where: { tenantId, deletedAt: null },
    });

    return used < plan.maxLeads;
  }

  async assertCanCreateLeadInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<void> {
    if (!(await this.canCreateLeadInTransaction(tx, tenantId))) {
      throw new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.LEAD);
    }
  }

  async canCreateLeadInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<boolean> {
    const plan = await this.loadTenantQuotaContextInTransaction(tx, tenantId);

    if (plan.maxLeads === null) {
      return true;
    }

    const used = await tx.lead.count({
      where: { tenantId, deletedAt: null },
    });

    return used < plan.maxLeads;
  }

  async assertCanCreateProject(tenantId: string): Promise<void> {
    if (!(await this.canCreateProject(tenantId))) {
      throw new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.PROJECT);
    }
  }

  async canCreateProject(tenantId: string): Promise<boolean> {
    const plan = await this.getTenantPlanLimits(tenantId);

    if (plan.maxProjects === null) {
      return true;
    }

    const used = await this.prisma.project.count({
      where: { tenantId, deletedAt: null },
    });

    return used < plan.maxProjects;
  }

  async assertCanCreateProjectInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<void> {
    if (!(await this.canCreateProjectInTransaction(tx, tenantId))) {
      throw new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.PROJECT);
    }
  }

  async canCreateProjectInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<boolean> {
    const plan = await this.loadTenantQuotaContextInTransaction(tx, tenantId);

    if (plan.maxProjects === null) {
      return true;
    }

    const used = await tx.project.count({
      where: { tenantId, deletedAt: null },
    });

    return used < plan.maxProjects;
  }

  async assertCanCreateUser(tenantId: string): Promise<void> {
    if (!(await this.canCreateUser(tenantId))) {
      throw new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.USER);
    }
  }

  async canCreateUser(tenantId: string): Promise<boolean> {
    const plan = await this.getTenantPlanLimits(tenantId);

    if (plan.maxUsers === null) {
      return true;
    }

    const used = await this.prisma.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });

    return used < plan.maxUsers;
  }

  async assertCanCreateUserInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<void> {
    if (!(await this.canCreateUserInTransaction(tx, tenantId))) {
      throw new ForbiddenException(QUOTA_EXCEEDED_MESSAGES.USER);
    }
  }

  async canCreateUserInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<boolean> {
    const plan = await this.loadTenantQuotaContextInTransaction(tx, tenantId);

    if (plan.maxUsers === null) {
      return true;
    }

    const used = await tx.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });

    return used < plan.maxUsers;
  }

  async assertCanUseStorageInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
    sizeBytes: number,
    options?: { excludeUploadIntentId?: string },
  ): Promise<void> {
    const context = await this.loadTenantQuotaContextInTransaction(
      tx,
      tenantId,
    );

    if (context.maxStorageBytes === null) {
      return;
    }

    const pendingBytes = await this.sumPendingUploadBytes(
      tx,
      tenantId,
      options?.excludeUploadIntentId,
    );
    const projected =
      context.storageUsedBytes + pendingBytes + BigInt(sizeBytes);

    if (projected > context.maxStorageBytes) {
      throw new BadRequestException('Storage quota exceeded');
    }
  }

  async getTenantPlanLimits(tenantId: string): Promise<TenantPlanLimits> {
    const snapshot = await this.loadSnapshotQuotas(this.prisma, tenantId);

    if (snapshot) {
      return {
        maxUsers: snapshot.maxUsers,
        maxLeads: snapshot.maxLeads,
        maxProjects: snapshot.maxProjects,
      };
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        subscriptionPlan: {
          select: {
            maxUsers: true,
            maxLeads: true,
            maxProjects: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant.subscriptionPlan;
  }

  private async loadTenantQuotaContextInTransaction(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<TenantQuotaContext> {
    await this.lockTenantRow(tx, tenantId);

    const snapshot = await this.loadSnapshotQuotas(tx, tenantId);

    if (snapshot) {
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { storageUsedBytes: true },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      return {
        maxUsers: snapshot.maxUsers,
        maxLeads: snapshot.maxLeads,
        maxProjects: snapshot.maxProjects,
        storageUsedBytes: tenant.storageUsedBytes,
        maxStorageBytes:
          snapshot.maxStorageBytes !== null
            ? BigInt(snapshot.maxStorageBytes)
            : null,
      };
    }

    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: tenantQuotaSelect,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      ...tenant.subscriptionPlan,
      storageUsedBytes: tenant.storageUsedBytes,
    };
  }

  /**
   * Quotas frozen in the active contract's planSnapshot take precedence over
   * the live SubscriptionPlan row, so editing a plan never retroactively
   * changes a signed tenant's limits. Returns null for legacy contracts
   * without a snapshot (caller falls back to the live plan).
   */
  private async loadSnapshotQuotas(
    client: SnapshotReader,
    tenantId: string,
  ): Promise<PlanSnapshotQuotas | null> {
    const contract = await client.tenantContract.findFirst({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        deletedAt: null,
      },
      select: { planSnapshot: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!contract) {
      return null;
    }

    const snapshot = parsePlanSnapshot(contract.planSnapshot);
    return snapshot ? snapshot.quotas : null;
  }

  private async sumPendingUploadBytes(
    tx: QuotaTransactionClient,
    tenantId: string,
    excludeUploadIntentId?: string,
  ): Promise<bigint> {
    const result = await tx.fileUploadIntent.aggregate({
      where: {
        tenantId,
        expiresAt: { gt: new Date() },
        ...(excludeUploadIntentId
          ? { id: { not: excludeUploadIntentId } }
          : {}),
      },
      _sum: { sizeBytes: true },
    });

    return result._sum.sizeBytes ?? 0n;
  }

  private async lockTenantRow(
    tx: QuotaTransactionClient,
    tenantId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Tenant"
      WHERE id = ${tenantId} AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }
  }
}
