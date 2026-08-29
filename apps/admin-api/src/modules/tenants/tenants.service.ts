import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma, TenantStatus } from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResponse,
  getPaginationParams,
} from '../../common/pagination/utils/pagination.util';
import type { PaginatedResponse } from '../../common/pagination/types/paginated-response.type';
import type { RequestSecurityMetadata } from '../auth/auth.types';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { GetTenantUsersQueryDto } from './dto/get-tenant-users-query.dto';
import { GetTenantsQueryDto } from './dto/get-tenants-query.dto';
import { ResetTenantOwnerPasswordDto } from './dto/reset-tenant-owner-password.dto';
import type { TenantUsageResponse } from './dto/tenant-usage-response.dto';
import { UpdateTenantDetailsDto } from './dto/update-tenant-details.dto';
import { UpdateTenantOwnerDto } from './dto/update-tenant-owner.dto';
import { TenantOwnerService } from './services/tenant-owner.service';
import { TenantProvisioningService } from './services/tenant-provisioning.service';
import { TenantUsageService } from './services/tenant-usage.service';
import { TenantsAuditService } from './services/tenants-audit.service';
import type {
  ProvisionTenantResult,
  TenantDetail,
  TenantListItem,
} from './types/tenant.types';
import { toTenantDetail, toTenantListItem } from './utils/tenant.mapper';

const tenantListInclude = {
  subscriptionPlan: { select: { id: true, name: true } },
} satisfies Prisma.TenantInclude;

const tenantDetailInclude = {
  subscriptionPlan: { select: { id: true, name: true } },
  contracts: {
    where: { deletedAt: null },
    select: {
      id: true,
      contractName: true,
      status: true,
      agreedPrice: true,
      currency: true,
      deletedAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  users: {
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      deletedAt: true,
      role: { select: { name: true } },
    },
  },
} satisfies Prisma.TenantInclude;

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioningService: TenantProvisioningService,
    private readonly ownerService: TenantOwnerService,
    private readonly usageService: TenantUsageService,
    private readonly auditService: TenantsAuditService,
  ) {}

  async listTenants(
    query: GetTenantsQueryDto,
  ): Promise<PaginatedResponse<TenantListItem>> {
    const { page, limit, skip, take } = getPaginationParams(query);

    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.planId ? { subscriptionPlanId: query.planId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalItems, tenants] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        include: tenantListInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(
      tenants.map(toTenantListItem),
      page,
      limit,
      totalItems,
    );
  }

  async getTenantById(id: string): Promise<TenantDetail> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: tenantDetailInclude,
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return toTenantDetail(tenant);
  }

  async listTenantUsers(
    tenantId: string,
    query: GetTenantUsersQueryDto,
  ): Promise<
    PaginatedResponse<{
      id: string;
      name: string;
      email: string;
      phone: string | null;
      isActive: boolean;
      lastLoginAt: string | null;
      createdAt: string;
      role: { id: string; name: string };
    }>
  > {
    await this.assertTenantExists(tenantId);

    const { page, limit, skip, take } = getPaginationParams(query);
    const where: Prisma.UserWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalItems, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
        },
      }),
    ]);

    return buildPaginatedResponse(
      users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        role: user.role,
      })),
      page,
      limit,
      totalItems,
    );
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
  }

  async createTenant(
    dto: CreateTenantDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<ProvisionTenantResult> {
    return this.provisioningService.provisionTenant(
      dto,
      actorAdminId,
      metadata,
    );
  }

  async suspendTenant(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<{
    tenantId: string;
    status: TenantStatus;
    revokedSessions: number;
  }> {
    const tenant = await this.findTenantOrThrow(id);

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new BadRequestException('Tenant is already suspended');
    }

    await this.ownerService.resolveOwnerUser(id);

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id },
        data: { status: TenantStatus.SUSPENDED },
      });

      const userIds = await tx.user.findMany({
        where: { tenantId: id, deletedAt: null },
        select: { id: true },
      });

      const result = await tx.userSession.updateMany({
        where: {
          userId: { in: userIds.map((user) => user.id) },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await this.auditService.logTenantSuspended(
        actorAdminId,
        id,
        metadata,
        result.count,
        tx,
      );

      return result.count;
    });

    return {
      tenantId: id,
      status: TenantStatus.SUSPENDED,
      revokedSessions,
    };
  }

  async reactivateTenant(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<{ tenantId: string; status: TenantStatus }> {
    const tenant = await this.findTenantOrThrow(id);

    if (tenant.status === TenantStatus.ACTIVE) {
      throw new BadRequestException('Tenant is already active');
    }

    await this.assertTenantEligibleForReactivation(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id },
        data: { status: TenantStatus.ACTIVE },
      });

      await this.auditService.logTenantReactivated(
        actorAdminId,
        id,
        metadata,
        tx,
      );
    });

    return { tenantId: id, status: TenantStatus.ACTIVE };
  }

  async updateTenantDetails(
    id: string,
    dto: UpdateTenantDetailsDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<TenantDetail> {
    if (!dto.name) {
      throw new BadRequestException('At least one field must be provided');
    }

    const tenant = await this.findTenantOrThrow(id);

    if (dto.name === tenant.name) {
      return this.getTenantById(id);
    }

    await this.prisma.tenant.update({
      where: { id },
      data: { name: dto.name },
    });

    await this.auditService.logTenantUpdated(actorAdminId, id, metadata, [
      'name',
    ]);

    return this.getTenantById(id);
  }

  async updateOwner(
    id: string,
    dto: UpdateTenantOwnerDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ) {
    await this.ownerService.updateOwner(id, dto, actorAdminId, metadata);
    return this.getTenantById(id);
  }

  async resetOwnerPassword(
    id: string,
    dto: ResetTenantOwnerPasswordDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ) {
    return this.ownerService.resetOwnerPassword(
      id,
      dto,
      actorAdminId,
      metadata,
    );
  }

  async revokeOwnerSessions(
    id: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ) {
    return this.ownerService.revokeOwnerSessions(id, actorAdminId, metadata);
  }

  async getTenantUsage(id: string): Promise<TenantUsageResponse> {
    return this.usageService.getTenantUsage(id);
  }

  private async findTenantOrThrow(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, status: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  private async assertTenantEligibleForReactivation(
    tenantId: string,
  ): Promise<void> {
    const activeContract = await this.prisma.tenantContract.findFirst({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        plan: { select: { id: true, isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeContract) {
      throw new BadRequestException(
        'Tenant must have an active contract before reactivation',
      );
    }

    if (!activeContract.plan.isActive) {
      throw new BadRequestException(
        'Active contract plan must be active before reactivation',
      );
    }
  }
}
