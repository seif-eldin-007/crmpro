import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus, Prisma, TenantStatus } from '@crmpro/database';
import { PasswordService } from '../../../common/security/password.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  AGENT_PERMISSION_KEYS,
  DEFAULT_LEAD_SOURCES,
  DEFAULT_PIPELINE,
  DEFAULT_PIPELINE_STAGES,
  DEFAULT_TENANT_ROLES,
  MANAGER_PERMISSION_KEYS,
} from '@crmpro/shared/bootstrap';
import type { CreateTenantDto } from '../dto/create-tenant.dto';
import type { ProvisionTenantResult } from '../types/tenant.types';
import { TenantsAuditService } from './tenants-audit.service';
import type { RequestSecurityMetadata } from '../../auth/auth.types';

type PrismaTx = Prisma.TransactionClient;

type ProvisionableContract = {
  id: string;
  planId: string;
};

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: TenantsAuditService,
  ) {}

  async provisionTenant(
    dto: CreateTenantDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<ProvisionTenantResult> {
    await this.assertSlugAvailable(dto.slug);
    await this.assertOwnerEmailAvailable(dto.ownerEmail);

    await this.findProvisionableContract(dto.contractId);
    const passwordHash = await this.passwordService.hash(dto.ownerPassword);

    return this.prisma.$transaction(async (tx) => {
      const contract = await this.lockProvisionableContractInTx(
        tx,
        dto.contractId,
      );

      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          subscriptionPlanId: contract.planId,
          status: TenantStatus.ACTIVE,
          storageUsedBytes: 0n,
        },
      });

      await this.linkContractToTenantInTx(tx, contract.id, tenant.id);

      const ownerRoleId = await this.createDefaultRoles(tx, tenant.id);
      await this.createOwnerUser(tx, {
        tenantId: tenant.id,
        roleId: ownerRoleId,
        fullName: dto.ownerFullName,
        email: dto.ownerEmail,
        passwordHash,
      });
      await this.createDefaultLeadSources(tx, tenant.id);
      await this.createDefaultPipeline(tx, tenant.id);

      await this.auditService.logTenantCreated(
        actorAdminId,
        tenant.id,
        metadata,
        { contractId: contract.id, ownerEmail: dto.ownerEmail },
        tx,
      );

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        ownerUser: {
          email: dto.ownerEmail,
        },
      };
    });
  }

  /**
   * Future invariant: a tenant may have at most one ACTIVE contract.
   */
  async assertTenantHasNoActiveContract(
    tenantId: string,
    excludeContractId?: string,
  ): Promise<void> {
    await this.assertTenantHasNoActiveContractInTx(
      this.prisma,
      excludeContractId,
      tenantId,
    );
  }

  private async assertTenantHasNoActiveContractInTx(
    tx: PrismaTx,
    excludeContractId?: string,
    tenantId?: string,
  ): Promise<void> {
    if (!tenantId) {
      return;
    }

    const existing = await tx.tenantContract.findFirst({
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

  private async findProvisionableContract(contractId: string): Promise<void> {
    const contract = await this.prisma.tenantContract.findFirst({
      where: { id: contractId, deletedAt: null },
      select: {
        id: true,
        status: true,
        tenantId: true,
        plan: { select: { isActive: true } },
      },
    });

    this.assertProvisionableContract(contract);
  }

  /**
   * Locks the contract row and re-validates eligibility inside the provisioning
   * transaction so concurrent requests cannot both pass a pre-tx availability check.
   */
  private async lockProvisionableContractInTx(
    tx: PrismaTx,
    contractId: string,
  ): Promise<ProvisionableContract> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        planId: string;
        tenantId: string | null;
        status: ContractStatus;
        deletedAt: Date | null;
        planIsActive: boolean;
      }>
    >`
      SELECT
        tc.id,
        tc."planId",
        tc."tenantId",
        tc.status,
        tc."deletedAt",
        sp."isActive" AS "planIsActive"
      FROM "TenantContract" tc
      INNER JOIN "SubscriptionPlan" sp ON sp.id = tc."planId"
      WHERE tc.id = ${contractId}::uuid
      FOR UPDATE OF tc
    `;

    const contract = rows[0] ?? null;
    this.assertProvisionableContract(
      contract
        ? {
            id: contract.id,
            status: contract.status,
            tenantId: contract.tenantId,
            plan: { isActive: contract.planIsActive },
          }
        : null,
    );

    return { id: contract.id, planId: contract.planId };
  }

  /**
   * Conditional link: only one provisioner may attach a tenant when tenantId is still null.
   */
  private async linkContractToTenantInTx(
    tx: PrismaTx,
    contractId: string,
    tenantId: string,
  ): Promise<void> {
    const result = await tx.tenantContract.updateMany({
      where: {
        id: contractId,
        tenantId: null,
        deletedAt: null,
        status: ContractStatus.ACTIVE,
      },
      data: { tenantId },
    });

    if (result.count !== 1) {
      throw new ConflictException('Contract is already linked to a tenant');
    }
  }

  private assertProvisionableContract(
    contract: {
      id: string;
      status: ContractStatus;
      tenantId: string | null;
      plan: { isActive: boolean };
    } | null,
  ): void {
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException(
        'Only active contracts can be used for tenant provisioning',
      );
    }

    if (!contract.plan.isActive) {
      throw new BadRequestException('Contract plan must be active');
    }

    if (contract.tenantId !== null) {
      throw new ConflictException('Contract is already linked to a tenant');
    }
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const existing = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Tenant slug is already in use');
    }
  }

  private async assertOwnerEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Owner email is already in use');
    }
  }

  private async createDefaultRoles(
    tx: PrismaTx,
    tenantId: string,
  ): Promise<string> {
    const managerPermissionMap = await this.loadPermissionMap(
      tx,
      MANAGER_PERMISSION_KEYS,
    );
    const agentPermissionMap = await this.loadPermissionMap(
      tx,
      AGENT_PERMISSION_KEYS,
    );

    const ownerRoleId = crypto.randomUUID();
    const managerRoleId = crypto.randomUUID();
    const agentRoleId = crypto.randomUUID();

    await tx.role.createMany({
      data: DEFAULT_TENANT_ROLES.map((role, index) => ({
        id: [ownerRoleId, managerRoleId, agentRoleId][index],
        tenantId,
        name: role.name,
        description: role.description,
        isSystem: true,
      })),
    });

    const allPermissions = await tx.permission.findMany({
      select: { id: true },
    });
    await tx.rolePermission.createMany({
      data: allPermissions.map((permission) => ({
        roleId: ownerRoleId,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    await this.attachPermissions(
      tx,
      managerRoleId,
      MANAGER_PERMISSION_KEYS,
      managerPermissionMap,
    );
    await this.attachPermissions(
      tx,
      agentRoleId,
      AGENT_PERMISSION_KEYS,
      agentPermissionMap,
    );

    return ownerRoleId;
  }

  private async loadPermissionMap(
    tx: PrismaTx,
    keys: readonly string[],
  ): Promise<Map<string, string>> {
    const permissions = await tx.permission.findMany({
      where: { key: { in: [...keys] } },
      select: { id: true, key: true },
    });

    const map = new Map(permissions.map((p) => [p.key, p.id]));

    for (const key of keys) {
      if (!map.has(key)) {
        throw new Error(`Unknown permission key: ${key}`);
      }
    }

    return map;
  }

  private async attachPermissions(
    tx: PrismaTx,
    roleId: string,
    keys: readonly string[],
    permissionMap: Map<string, string>,
  ): Promise<void> {
    await tx.rolePermission.createMany({
      data: keys.map((key) => ({
        roleId,
        permissionId: permissionMap.get(key)!,
      })),
      skipDuplicates: true,
    });
  }

  private async createOwnerUser(
    tx: PrismaTx,
    input: {
      tenantId: string;
      roleId: string;
      fullName: string;
      email: string;
      passwordHash: string;
    },
  ): Promise<void> {
    await tx.user.create({
      data: {
        tenantId: input.tenantId,
        roleId: input.roleId,
        name: input.fullName,
        email: input.email,
        passwordHash: input.passwordHash,
        isActive: true,
      },
    });
  }

  private async createDefaultLeadSources(
    tx: PrismaTx,
    tenantId: string,
  ): Promise<void> {
    await tx.leadSource.createMany({
      data: DEFAULT_LEAD_SOURCES.map((name) => ({ tenantId, name })),
    });
  }

  private async createDefaultPipeline(
    tx: PrismaTx,
    tenantId: string,
  ): Promise<void> {
    const pipeline = await tx.pipeline.create({
      data: {
        tenantId,
        name: DEFAULT_PIPELINE.name,
        isDefault: DEFAULT_PIPELINE.isDefault,
      },
    });

    await tx.pipelineStage.createMany({
      data: DEFAULT_PIPELINE_STAGES.map((stage, index) => ({
        tenantId,
        pipelineId: pipeline.id,
        name: stage.name,
        color: stage.color,
        sortOrder: index,
        isSystem: stage.isClosed,
        isClosed: stage.isClosed,
        closeType: stage.closeType,
      })),
    });
  }
}
