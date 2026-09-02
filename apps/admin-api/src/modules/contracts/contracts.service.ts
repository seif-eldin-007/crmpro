import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma, TenantStatus } from '@crmpro/database';
import { buildPlanSnapshot, computeContractAccessEndAt } from '@crmpro/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResponse,
  getPaginationParams,
} from '../../common/pagination/utils/pagination.util';
import type { PaginatedResponse } from '../../common/pagination/types/paginated-response.type';
import type { RequestSecurityMetadata } from '../auth/auth.types';
import { CreateContractDto } from './dto/create-contract.dto';
import { GetContractsQueryDto } from './dto/get-contracts-query.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractsAuditService } from './services/contracts-audit.service';
import { ContractEntitlementSyncService } from './services/contract-entitlement-sync.service';
import type { ContractDetail, ContractListItem } from './types/contract.types';
import { toContractDetail, toContractListItem } from './utils/contract.mapper';

const contractInclude = {
  plan: { select: { id: true, name: true, isActive: true } },
  createdByAdmin: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.TenantContractInclude;

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ContractsAuditService,
    private readonly entitlementSyncService: ContractEntitlementSyncService,
  ) {}

  async listContracts(
    query: GetContractsQueryDto,
  ): Promise<PaginatedResponse<ContractListItem>> {
    const { page, limit, skip, take } = getPaginationParams(query);

    const where: Prisma.TenantContractWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.paymentFrequency
        ? { paymentFrequency: query.paymentFrequency }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                contractName: { contains: query.search, mode: 'insensitive' },
              },
              { notes: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalItems, contracts] = await this.prisma.$transaction([
      this.prisma.tenantContract.count({ where }),
      this.prisma.tenantContract.findMany({
        where,
        include: contractInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(
      contracts.map(toContractListItem),
      page,
      limit,
      totalItems,
    );
  }

  async getContractById(id: string): Promise<ContractDetail> {
    const contract = await this.findContractOrThrow(id);
    return toContractDetail(contract);
  }

  async createContract(
    dto: CreateContractDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<ContractDetail> {
    const plan = await this.loadActivePlan(dto.planId);
    this.assertDateRange(dto.contractStartAt, dto.contractEndAt);

    const contract = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenantContract.create({
        data: {
          contractName: dto.contractName ?? null,
          planId: dto.planId,
          agreedPrice: dto.agreedPrice,
          currency: dto.currency,
          paymentMethod: dto.paymentMethod,
          paymentFrequency: dto.paymentFrequency,
          contractStartAt: new Date(dto.contractStartAt),
          contractEndAt: dto.contractEndAt ? new Date(dto.contractEndAt) : null,
          discountPercent: dto.discountPercent ?? null,
          gracePeriodDays: dto.gracePeriodDays ?? null,
          autoRenew: dto.autoRenew ?? false,
          notes: dto.notes ?? null,
          status: ContractStatus.DRAFT,
          planSnapshot: buildPlanSnapshot(plan),
          createdByAdminId: actorAdminId,
        },
        include: contractInclude,
      });

      // Audit inside the transaction: a failing audit write must roll back
      // the contract creation (commercial mutations are audited atomically).
      await this.auditService.logContractCreated(
        actorAdminId,
        created.id,
        metadata,
        {
          contractName: created.contractName,
          planId: created.planId,
          agreedPrice: dto.agreedPrice,
          currency: dto.currency,
        },
        tx,
      );

      return created;
    });

    return toContractDetail(contract);
  }

  async updateContract(
    id: string,
    dto: UpdateContractDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<ContractDetail> {
    const existing = await this.findContractOrThrow(id);
    this.assertEditable(existing);

    const nextPlan =
      dto.planId !== undefined ? await this.loadActivePlan(dto.planId) : null;

    const startAt = dto.contractStartAt
      ? dto.contractStartAt
      : existing.contractStartAt.toISOString();
    const endAt =
      dto.contractEndAt !== undefined
        ? dto.contractEndAt
        : existing.contractEndAt?.toISOString();
    this.assertDateRange(startAt, endAt ?? undefined);

    const changes = this.collectChanges(existing, dto);

    const contract = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantContract.update({
        where: { id },
        data: {
          ...(dto.contractName !== undefined
            ? { contractName: dto.contractName }
            : {}),
          ...(dto.planId !== undefined ? { planId: dto.planId } : {}),
          // Re-capture the snapshot whenever the signed plan changes so the
          // frozen terms always match the contract's plan.
          ...(nextPlan && dto.planId !== existing.planId
            ? { planSnapshot: buildPlanSnapshot(nextPlan) }
            : {}),
          ...(dto.agreedPrice !== undefined
            ? { agreedPrice: dto.agreedPrice }
            : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.paymentMethod !== undefined
            ? { paymentMethod: dto.paymentMethod }
            : {}),
          ...(dto.paymentFrequency !== undefined
            ? { paymentFrequency: dto.paymentFrequency }
            : {}),
          ...(dto.contractStartAt !== undefined
            ? { contractStartAt: new Date(dto.contractStartAt) }
            : {}),
          ...(dto.contractEndAt !== undefined
            ? {
                contractEndAt: dto.contractEndAt
                  ? new Date(dto.contractEndAt)
                  : null,
              }
            : {}),
          ...(dto.discountPercent !== undefined
            ? { discountPercent: dto.discountPercent }
            : {}),
          ...(dto.gracePeriodDays !== undefined
            ? { gracePeriodDays: dto.gracePeriodDays }
            : {}),
          ...(dto.autoRenew !== undefined ? { autoRenew: dto.autoRenew } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: contractInclude,
      });

      if (
        updated.status === ContractStatus.ACTIVE &&
        updated.tenantId !== null
      ) {
        await this.entitlementSyncService.syncTenantPlanFromContract(
          tx,
          updated.tenantId,
          updated.planId,
        );
        await this.entitlementSyncService.assertTenantContractPlanConsistency(
          updated.tenantId,
          tx,
        );
      }

      if (Object.keys(changes).length > 0) {
        await this.auditService.logContractUpdated(
          actorAdminId,
          id,
          metadata,
          changes,
          tx,
        );
      }

      return updated;
    });

    return toContractDetail(contract);
  }

  async activateContract(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<ContractDetail> {
    const existing = await this.findContractOrThrow(id);

    if (existing.status !== ContractStatus.DRAFT) {
      throw new BadRequestException('Only draft contracts can be activated');
    }

    const plan = await this.loadActivePlan(existing.planId);

    if (existing.tenantId) {
      await this.assertTenantHasNoActiveContract(existing.tenantId, id);
    }

    const contract = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantContract.update({
        where: { id },
        data: {
          status: ContractStatus.ACTIVE,
          // Activation is the signing moment: re-capture the snapshot so the
          // frozen terms reflect the plan as it is when the deal goes live.
          planSnapshot: buildPlanSnapshot(plan),
        },
        include: contractInclude,
      });

      if (updated.tenantId) {
        await this.entitlementSyncService.syncTenantPlanFromContract(
          tx,
          updated.tenantId,
          updated.planId,
        );
        await this.entitlementSyncService.assertTenantContractPlanConsistency(
          updated.tenantId,
          tx,
        );
      }

      await this.auditService.logContractActivated(
        actorAdminId,
        id,
        metadata,
        tx,
      );

      return updated;
    });

    return toContractDetail(contract);
  }

  async terminateContract(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<ContractDetail> {
    const existing = await this.findContractOrThrow(id);

    if (existing.status === ContractStatus.TERMINATED) {
      throw new BadRequestException('Contract is already terminated');
    }

    if (
      existing.status !== ContractStatus.ACTIVE &&
      existing.status !== ContractStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Only active or expired contracts can be terminated',
      );
    }

    const terminatedAt = new Date();

    const accessUntil = computeContractAccessEndAt(
      {
        contractEndAt: existing.contractEndAt,
        gracePeriodDays: existing.gracePeriodDays,
      },
      existing.contractEndAt ? undefined : terminatedAt,
    );

    const contract = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantContract.update({
        where: { id },
        data: { status: ContractStatus.TERMINATED },
        include: contractInclude,
      });

      // Termination suspends the linked tenant immediately and revokes all
      // of its user sessions; the grace window only defines accessUntil for
      // the audit trail (tenant-access.service enforces suspension first).
      const suspension = await this.suspendTenantForTermination(
        tx,
        existing.tenantId,
      );

      await this.auditService.logContractTerminated(
        actorAdminId,
        id,
        metadata,
        {
          tenantId: existing.tenantId,
          accessUntil: accessUntil?.toISOString() ?? null,
          gracePeriodDays: existing.gracePeriodDays,
          tenantSuspended: suspension.suspended,
          revokedSessions: suspension.revokedSessions,
        },
        tx,
      );

      return updated;
    });

    return toContractDetail(contract);
  }

  async archiveContract(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<{ success: true }> {
    const existing = await this.findContractOrThrow(id);

    if (existing.status === ContractStatus.ACTIVE) {
      throw new BadRequestException('Cannot archive an active contract');
    }

    if (
      existing.status !== ContractStatus.DRAFT &&
      existing.status !== ContractStatus.TERMINATED &&
      existing.status !== ContractStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Only draft, terminated, or expired contracts can be archived',
      );
    }

    await this.prisma.tenantContract.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.logContractArchived(actorAdminId, id, metadata);

    return { success: true };
  }

  /**
   * Future invariant: a tenant may have at most one ACTIVE contract.
   * Call when activating a contract or assigning a tenant.
   */
  async assertTenantHasNoActiveContract(
    tenantId: string,
    excludeContractId?: string,
  ): Promise<void> {
    const existing = await this.prisma.tenantContract.findFirst({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        deletedAt: null,
        ...(excludeContractId ? { id: { not: excludeContractId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Tenant already has an active contract');
    }
  }

  private async findContractOrThrow(id: string) {
    const contract = await this.prisma.tenantContract.findFirst({
      where: { id, deletedAt: null },
      include: contractInclude,
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return contract;
  }

  private assertEditable(contract: {
    status: ContractStatus;
    deletedAt: Date | null;
  }): void {
    if (contract.deletedAt !== null) {
      throw new BadRequestException('Cannot update an archived contract');
    }

    if (contract.status === ContractStatus.TERMINATED) {
      throw new BadRequestException('Cannot update a terminated contract');
    }
  }

  private async loadActivePlan(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        isActive: true,
        name: true,
        defaultPrice: true,
        currency: true,
        maxUsers: true,
        maxLeads: true,
        maxProjects: true,
        maxStorageBytes: true,
        featureFlags: true,
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (!plan.isActive) {
      throw new BadRequestException('Plan must be active');
    }

    return plan;
  }

  private async suspendTenantForTermination(
    tx: Prisma.TransactionClient,
    tenantId: string | null,
  ): Promise<{ suspended: boolean; revokedSessions: number }> {
    if (!tenantId) {
      return { suspended: false, revokedSessions: 0 };
    }

    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { status: true },
    });

    if (!tenant) {
      return { suspended: false, revokedSessions: 0 };
    }

    if (tenant.status !== TenantStatus.SUSPENDED) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { status: TenantStatus.SUSPENDED },
      });
    }

    const users = await tx.user.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });

    const result = await tx.userSession.updateMany({
      where: {
        userId: { in: users.map((user) => user.id) },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { suspended: true, revokedSessions: result.count };
  }

  private assertDateRange(startAt: string, endAt?: string): void {
    const start = new Date(startAt);

    if (endAt) {
      const end = new Date(endAt);
      if (end <= start) {
        throw new BadRequestException(
          'Contract end date must be after start date',
        );
      }
    }
  }

  private collectChanges(
    existing: Awaited<ReturnType<typeof this.findContractOrThrow>>,
    dto: UpdateContractDto,
  ): Record<string, unknown> {
    const changes: Record<string, unknown> = {};

    if (
      dto.contractName !== undefined &&
      dto.contractName !== existing.contractName
    ) {
      changes.contractName = dto.contractName;
    }
    if (dto.planId !== undefined && dto.planId !== existing.planId) {
      changes.planId = dto.planId;
    }
    if (dto.agreedPrice !== undefined) {
      const current = existing.agreedPrice.toNumber();
      if (dto.agreedPrice !== current) {
        changes.agreedPrice = dto.agreedPrice;
      }
    }
    if (dto.currency !== undefined && dto.currency !== existing.currency) {
      changes.currency = dto.currency;
    }
    if (
      dto.paymentMethod !== undefined &&
      dto.paymentMethod !== existing.paymentMethod
    ) {
      changes.paymentMethod = dto.paymentMethod;
    }
    if (
      dto.paymentFrequency !== undefined &&
      dto.paymentFrequency !== existing.paymentFrequency
    ) {
      changes.paymentFrequency = dto.paymentFrequency;
    }
    if (dto.discountPercent !== undefined) {
      changes.discountPercent = dto.discountPercent;
    }
    if (dto.gracePeriodDays !== undefined) {
      changes.gracePeriodDays = dto.gracePeriodDays;
    }
    if (dto.autoRenew !== undefined && dto.autoRenew !== existing.autoRenew) {
      changes.autoRenew = dto.autoRenew;
    }
    if (dto.notes !== undefined && dto.notes !== existing.notes) {
      changes.notes = dto.notes;
    }

    return changes;
  }
}
