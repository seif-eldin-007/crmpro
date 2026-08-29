import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import { PasswordService } from '../../../common/security/password.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { RequestSecurityMetadata } from '../../auth/auth.types';
import { TENANT_ROLE_NAMES } from '../constants/tenant-provisioning.constants';
import { ResetTenantOwnerPasswordDto } from '../dto/reset-tenant-owner-password.dto';
import { UpdateTenantOwnerDto } from '../dto/update-tenant-owner.dto';
import { TenantsAuditService } from './tenants-audit.service';

type OwnerUser = {
  id: string;
  name: string;
  email: string;
};

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class TenantOwnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: TenantsAuditService,
  ) {}

  async updateOwner(
    tenantId: string,
    dto: UpdateTenantOwnerDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<OwnerUser> {
    if (!dto.fullName && !dto.email) {
      throw new BadRequestException('At least one field must be provided');
    }

    await this.assertTenantExists(tenantId);
    const owner = await this.resolveOwnerUser(tenantId);

    if (dto.email && dto.email !== owner.email) {
      await this.assertEmailAvailable(dto.email, owner.id);
    }

    const updated = await this.prisma.user.update({
      where: { id: owner.id },
      data: {
        ...(dto.fullName !== undefined ? { name: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
      select: { id: true, name: true, email: true },
    });

    const changedFields: string[] = [];
    if (dto.fullName !== undefined && dto.fullName !== owner.name) {
      changedFields.push('fullName');
    }
    if (dto.email !== undefined && dto.email !== owner.email) {
      changedFields.push('email');
    }

    if (changedFields.length > 0) {
      await this.auditService.logOwnerUpdated(
        actorAdminId,
        tenantId,
        metadata,
        changedFields,
      );
    }

    return updated;
  }

  async resetOwnerPassword(
    tenantId: string,
    dto: ResetTenantOwnerPasswordDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<{ revokedSessions: number }> {
    await this.assertTenantExists(tenantId);
    const owner = await this.resolveOwnerUser(tenantId);
    const passwordHash = await this.passwordService.hash(dto.newPassword);

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: owner.id },
        data: { passwordHash },
      });

      const count = await this.revokeUserSessions(owner.id, tx);

      await this.auditService.logOwnerPasswordReset(
        actorAdminId,
        tenantId,
        metadata,
        count,
        tx,
      );

      return count;
    });

    return { revokedSessions };
  }

  async revokeOwnerSessions(
    tenantId: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<{ revokedSessions: number }> {
    await this.assertTenantExists(tenantId);
    const owner = await this.resolveOwnerUser(tenantId);
    const revokedSessions = await this.revokeUserSessions(owner.id);

    if (revokedSessions > 0) {
      await this.auditService.logOwnerSessionsRevoked(
        actorAdminId,
        tenantId,
        metadata,
        revokedSessions,
      );
    }

    return { revokedSessions };
  }

  async resolveOwnerUser(tenantId: string): Promise<OwnerUser> {
    const owners = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: { name: TENANT_ROLE_NAMES.owner },
      },
      select: { id: true, name: true, email: true },
    });

    if (owners.length === 0) {
      throw new InternalServerErrorException('Tenant has no owner user');
    }

    if (owners.length > 1) {
      throw new InternalServerErrorException('Tenant has multiple owner users');
    }

    return owners[0];
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

  private async assertEmailAvailable(
    email: string,
    excludeUserId: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
        id: { not: excludeUserId },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email is already in use');
    }
  }

  private async revokeUserSessions(
    userId: string,
    tx?: PrismaTx,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }
}
