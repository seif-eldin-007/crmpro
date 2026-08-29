import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResponse,
  getPaginationParams,
} from '../../common/pagination/utils/pagination.util';
import type { PaginatedResponse } from '../../common/pagination/types/paginated-response.type';
import type { RequestSecurityMetadata } from '../auth/auth.types';
import { CreatePlanDto } from './dto/create-plan.dto';
import { GetPlansQueryDto } from './dto/get-plans-query.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansAuditService } from './services/plans-audit.service';
import type { PlanDetail, PlanListItem } from './types/plan.types';
import { toPlanDetail, toPlanListItem } from './utils/plan.mapper';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: PlansAuditService,
  ) {}

  async listPlans(
    query: GetPlansQueryDto,
  ): Promise<PaginatedResponse<PlanListItem>> {
    const { page, limit, skip, take } = getPaginationParams(query);

    const where: Prisma.SubscriptionPlanWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                description: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };

    const [totalItems, plans] = await this.prisma.$transaction([
      this.prisma.subscriptionPlan.count({ where }),
      this.prisma.subscriptionPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(
      plans.map(toPlanListItem),
      page,
      limit,
      totalItems,
    );
  }

  async getPlanById(id: string): Promise<PlanDetail> {
    const plan = await this.findPlanOrThrow(id);
    const tenantCount = await this.countTenants(id);
    return toPlanDetail(plan, tenantCount);
  }

  async createPlan(
    dto: CreatePlanDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<PlanDetail> {
    await this.assertNameAvailable(dto.name);

    const plan = await this.prisma.subscriptionPlan.create({
      data: this.toCreateData(dto),
    });

    await this.auditService.logPlanCreated(actorAdminId, plan.id, metadata, {
      name: plan.name,
      defaultPrice: dto.defaultPrice ?? null,
      currency: dto.currency ?? null,
      maxUsers: dto.maxUsers ?? null,
      maxLeads: dto.maxLeads ?? null,
      maxProjects: dto.maxProjects ?? null,
      maxStorageBytes: dto.maxStorageBytes ?? null,
    });

    return toPlanDetail(plan, 0);
  }

  async updatePlan(
    id: string,
    dto: UpdatePlanDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<PlanDetail> {
    const existing = await this.findPlanOrThrow(id);

    if (dto.name && dto.name !== existing.name) {
      await this.assertNameAvailable(dto.name, id);
    }

    const plan = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: this.toUpdateData(dto),
    });

    const changes = this.collectChanges(existing, dto);
    if (Object.keys(changes).length > 0) {
      await this.auditService.logPlanUpdated(
        actorAdminId,
        id,
        metadata,
        changes,
      );
    }

    const tenantCount = await this.countTenants(id);
    return toPlanDetail(plan, tenantCount);
  }

  async archivePlan(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<PlanDetail> {
    const existing = await this.findPlanOrThrow(id);

    if (!existing.isActive) {
      throw new BadRequestException('Plan is already archived');
    }

    const plan = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.logPlanArchived(actorAdminId, id, metadata);

    const tenantCount = await this.countTenants(id);
    return toPlanDetail(plan, tenantCount);
  }

  async unarchivePlan(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<PlanDetail> {
    const existing = await this.findPlanOrThrow(id);

    if (existing.isActive) {
      throw new BadRequestException('Plan is already active');
    }

    const plan = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: true },
    });

    await this.auditService.logPlanUnarchived(actorAdminId, id, metadata);

    const tenantCount = await this.countTenants(id);
    return toPlanDetail(plan, tenantCount);
  }

  private async findPlanOrThrow(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.subscriptionPlan.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Plan name is already in use');
    }
  }

  private async countTenants(planId: string): Promise<number> {
    return this.prisma.tenant.count({
      where: {
        subscriptionPlanId: planId,
        deletedAt: null,
      },
    });
  }

  private toCreateData(dto: CreatePlanDto): Prisma.SubscriptionPlanCreateInput {
    return {
      name: dto.name,
      description: dto.description ?? null,
      isActive: true,
      defaultPrice: dto.defaultPrice ?? null,
      currency: dto.currency ?? null,
      maxUsers: dto.maxUsers ?? null,
      maxLeads: dto.maxLeads ?? null,
      maxProjects: dto.maxProjects ?? null,
      maxStorageBytes:
        dto.maxStorageBytes !== undefined && dto.maxStorageBytes !== null
          ? BigInt(dto.maxStorageBytes)
          : null,
      featureFlags: dto.featureFlags ?? {},
    };
  }

  private toUpdateData(dto: UpdatePlanDto): Prisma.SubscriptionPlanUpdateInput {
    const data: Prisma.SubscriptionPlanUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.defaultPrice !== undefined) data.defaultPrice = dto.defaultPrice;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.maxUsers !== undefined) data.maxUsers = dto.maxUsers;
    if (dto.maxLeads !== undefined) data.maxLeads = dto.maxLeads;
    if (dto.maxProjects !== undefined) data.maxProjects = dto.maxProjects;
    if (dto.maxStorageBytes !== undefined) {
      data.maxStorageBytes =
        dto.maxStorageBytes === null ? null : BigInt(dto.maxStorageBytes);
    }
    if (dto.featureFlags !== undefined) data.featureFlags = dto.featureFlags;

    return data;
  }

  private collectChanges(
    existing: Awaited<ReturnType<typeof this.findPlanOrThrow>>,
    dto: UpdatePlanDto,
  ): Record<string, unknown> {
    const changes: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== existing.name) {
      changes.name = dto.name;
    }
    if (
      dto.description !== undefined &&
      dto.description !== existing.description
    ) {
      changes.description = dto.description;
    }
    if (dto.defaultPrice !== undefined) {
      const current =
        existing.defaultPrice === null
          ? null
          : existing.defaultPrice.toNumber();
      if (dto.defaultPrice !== current) {
        changes.defaultPrice = dto.defaultPrice;
      }
    }
    if (dto.currency !== undefined && dto.currency !== existing.currency) {
      changes.currency = dto.currency;
    }
    if (dto.maxUsers !== undefined && dto.maxUsers !== existing.maxUsers) {
      changes.maxUsers = dto.maxUsers;
    }
    if (dto.maxLeads !== undefined && dto.maxLeads !== existing.maxLeads) {
      changes.maxLeads = dto.maxLeads;
    }
    if (
      dto.maxProjects !== undefined &&
      dto.maxProjects !== existing.maxProjects
    ) {
      changes.maxProjects = dto.maxProjects;
    }
    if (dto.maxStorageBytes !== undefined) {
      const current =
        existing.maxStorageBytes === null
          ? null
          : Number(existing.maxStorageBytes);
      if (dto.maxStorageBytes !== current) {
        changes.maxStorageBytes = dto.maxStorageBytes;
      }
    }
    if (dto.featureFlags !== undefined) {
      changes.featureFlags = dto.featureFlags;
    }

    return changes;
  }
}
