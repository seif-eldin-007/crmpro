import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma } from '@crmpro/database';
import { computeContractAccessEndAt } from '@crmpro/shared';
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
    await this.assertPlanActive(dto.planId);
    this.assertDateRange(dto.contractStartAt, dto.contractEndAt);

    const contract = await this.prisma.tenantContract.create({
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
        createdByAdminId: actorAdminId,
      },
      include: contractInclude,
    });

    await this.auditService.logContractCreated(
      actorAdminId,
      contract.id,
      metadata,
      {
        contractName: contract.contractName,
        planId: contract.planId,
        agreedPrice: dto.agreedPrice,
        currency: dto.currency,
      },
    );

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

    if (dto.planId) {
      await this.assertPlanActive(dto.planId);
    }

    const startAt = dto.contractStartAt
      ? dto.contractStartAt
      : existing.contractStartAt.toISOString();
    const endAt =
      dto.contractEndAt !== undefined
        ? dto.contractEndAt
        : existing.contractEndAt?.toISOString();
    this.assertDateRange(startAt, endAt ?? undefined);

    const contract = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantContract.update({
        where: { id },
        data: {
          ...(dto.contractName !== undefined
            ? { contractName: dto.contractName }
            : {}),
          ...(dto.planId !== undefined ? { planId: dto.planId } : {}),
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

      return updated;
    });

    const changes = this.collectChanges(existing, dto);
    if (Object.keys(changes).length > 0) {
      await this.auditService.logContractUpdated(
        actorAdminId,
        id,
        metadata,
        changes,
      );
    }

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

    await this.assertPlanActive(existing.planId);

    if (existing.tenantId) {
      await this.assertTenantHasNoActiveContract(existing.tenantId, id);
    }

    const contract = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantContract.update({
        where: { id },
        data: { status: ContractStatus.ACTIVE },
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

      return updated;
    });

    await this.auditService.logContractActivated(actorAdminId, id, metadata);

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

    const contract = await this.prisma.tenantContract.update({
      where: { id },
      data: { status: ContractStatus.TERMINATED },
      include: contractInclude,
    });

    const accessUntil = computeContractAccessEndAt(
      {
        contractEndAt: existing.contractEndAt,
        gracePeriodDays: existing.gracePeriodDays,
      },
      existing.contractEndAt ? undefined : terminatedAt,
    );

    await this.auditService.logContractTerminated(actorAdminId, id, metadata, {
      tenantId: existing.tenantId,
      accessUntil: accessUntil?.toISOString() ?? null,
      gracePeriodDays: existing.gracePeriodDays,
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

  private async assertPlanActive(planId: string): Promise<void> {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: { id: true, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (!plan.isActive) {
      throw new BadRequestException('Plan must be active');
    }
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
