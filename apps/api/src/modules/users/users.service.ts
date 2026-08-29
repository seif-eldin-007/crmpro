import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Tenant } from '@crmpro/database';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../common/pagination';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { QuotaService } from '../../common/quota/quota.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildOrderBy, normalizeSearch, SortOrder } from '../../common/query';
import { PasswordService } from '../../common/security/password.service';
import { normalizeDisplayName } from '../../common/utils/name-normalization.util';
import { CreateUserDto } from './dto/create-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UserGuardService } from './services/user-guard.service';
import { UserSessionService } from './services/user-session.service';
import { UsersAuditService } from './services/users-audit.service';
import type { UserDetail, UserListItem } from './types/user.types';
import {
  toUserDetail,
  toUserListItem,
  userListSelectClause,
} from './utils/user.mapper';

const USER_SORT_FIELDS = ['name', 'email', 'createdAt', 'updatedAt'] as const;

const USER_SORT_CONFIG = {
  allowedFields: USER_SORT_FIELDS,
  defaultField: 'createdAt' as const,
  defaultOrder: SortOrder.DESC,
};

export type UserWithRoleAndTenant = Prisma.UserGetPayload<{
  include: { role: true; tenant: true };
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly quotaService: QuotaService,
    private readonly permissionsService: PermissionsService,
    private readonly userGuardService: UserGuardService,
    private readonly userSessionService: UserSessionService,
    private readonly auditService: UsersAuditService,
  ) {}

  async findById(id: string): Promise<UserWithRoleAndTenant | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true, tenant: true },
    });
  }

  async findTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async findByTenantAndEmail(
    tenantSlug: string,
    email: string,
  ): Promise<UserWithRoleAndTenant | null> {
    const tenant = await this.findTenantBySlug(tenantSlug);
    if (!tenant) {
      return null;
    }

    return this.prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
      },
      include: { role: true, tenant: true },
    });
  }

  async listUsers(
    tenantId: string,
    query: GetUsersQueryDto,
  ): Promise<PaginatedResponse<UserListItem>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildWhereClause(tenantId, query);
    const orderBy = buildOrderBy(
      query.sortBy,
      query.sortOrder,
      USER_SORT_CONFIG,
    );

    const [users, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        select: userListSelectClause,
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResponse(
      users.map((user) => toUserListItem(user)),
      page,
      limit,
      totalItems,
    );
  }

  async getUser(tenantId: string, id: string): Promise<UserDetail> {
    const user = await this.getUserOrThrow(tenantId, id);
    const authorization = await this.permissionsService.getUserAuthorization(
      id,
      tenantId,
    );
    const activeSessionCount =
      await this.userSessionService.countActiveSessions(id);

    return toUserDetail(user, authorization.permissions, activeSessionCount);
  }

  async createUser(
    tenantId: string,
    actorUserId: string,
    dto: CreateUserDto,
  ): Promise<UserListItem> {
    await this.assertEmailAvailable(tenantId, dto.email);
    await this.userGuardService.assertActorCanAssignRole(
      tenantId,
      actorUserId,
      dto.roleId,
    );

    const passwordHash = await this.passwordService.hash(dto.password);
    const fullName = normalizeDisplayName(dto.fullName);

    const user = await this.prisma.$transaction(async (tx) => {
      await this.quotaService.assertCanCreateUserInTransaction(tx, tenantId);

      const created = await tx.user.create({
        data: {
          tenantId,
          roleId: dto.roleId,
          name: fullName,
          email: dto.email,
          passwordHash,
          isActive: true,
        },
        select: userListSelectClause,
      });

      await this.auditService.logUserCreated(
        tenantId,
        actorUserId,
        created.id,
        { email: created.email, roleId: dto.roleId },
        tx,
      );

      return created;
    });

    return toUserListItem(user);
  }

  async updateUser(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserListItem> {
    const existing = await this.userGuardService.resolveUser(tenantId, id);
    const fullName = normalizeDisplayName(dto.fullName);

    if (fullName === existing.name) {
      return toUserListItem(await this.getUserOrThrow(tenantId, id));
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name: fullName },
        select: userListSelectClause,
      });

      await this.auditService.logUserUpdated(
        tenantId,
        actorUserId,
        id,
        { fullName },
        tx,
      );

      return updated;
    });

    return toUserListItem(user);
  }

  async updateUserRole(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateUserRoleDto,
  ): Promise<UserListItem> {
    this.userGuardService.assertNotSelf(actorUserId, id);

    const existing = await this.userGuardService.resolveUser(tenantId, id);
    const role = await this.userGuardService.assertActorCanAssignRole(
      tenantId,
      actorUserId,
      dto.roleId,
    );

    if (existing.role.id === dto.roleId) {
      return toUserListItem(await this.getUserOrThrow(tenantId, id));
    }

    await this.userGuardService.assertOwnerRoleChangeAllowed(
      tenantId,
      id,
      role.name,
    );

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { roleId: dto.roleId },
        select: userListSelectClause,
      });

      await this.auditService.logUserRoleChanged(
        tenantId,
        actorUserId,
        id,
        {
          oldRoleId: existing.role.id,
          newRoleId: role.id,
        },
        tx,
      );

      return updated;
    });

    return toUserListItem(user);
  }

  async deactivateUser(
    tenantId: string,
    actorUserId: string,
    id: string,
  ): Promise<UserListItem> {
    this.userGuardService.assertNotSelf(actorUserId, id);

    const existing = await this.userGuardService.resolveUser(tenantId, id);

    if (!existing.isActive) {
      throw new BadRequestException('User is already inactive');
    }

    await this.userGuardService.assertNotLastOwner(tenantId, id);

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: false },
        select: userListSelectClause,
      });

      const revokedSessions = await tx.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.auditService.logUserDeactivated(
        tenantId,
        actorUserId,
        id,
        { revokedSessions: revokedSessions.count },
        tx,
      );

      return updated;
    });

    return toUserListItem(user);
  }

  async reactivateUser(
    tenantId: string,
    actorUserId: string,
    id: string,
  ): Promise<UserListItem> {
    const existing = await this.userGuardService.resolveUser(tenantId, id);

    if (existing.isActive) {
      throw new BadRequestException('User is already active');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: true },
        select: userListSelectClause,
      });

      await this.auditService.logUserReactivated(
        tenantId,
        actorUserId,
        id,
        {},
        tx,
      );

      return updated;
    });

    return toUserListItem(user);
  }

  async resetUserPassword(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: ResetUserPasswordDto,
  ): Promise<{ revokedSessions: number }> {
    await this.userGuardService.resolveUser(tenantId, id);
    const passwordHash = await this.passwordService.hash(dto.newPassword);

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash },
      });

      const result = await tx.userSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.auditService.logUserPasswordReset(
        tenantId,
        actorUserId,
        id,
        { revokedSessions: result.count },
        tx,
      );

      return result.count;
    });

    return { revokedSessions };
  }

  async revokeUserSessions(
    tenantId: string,
    actorUserId: string,
    id: string,
  ): Promise<{ revokedCount: number }> {
    await this.userGuardService.resolveUser(tenantId, id);
    const revokedCount = await this.userSessionService.revokeAllSessions(id);

    if (revokedCount > 0) {
      await this.auditService.logUserSessionsRevoked(
        tenantId,
        actorUserId,
        id,
        { revokedCount },
      );
    }

    return { revokedCount };
  }

  private async getUserOrThrow(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: userListSelectClause,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private buildWhereClause(
    tenantId: string,
    query: GetUsersQueryDto,
  ): Prisma.UserWhereInput {
    const search = normalizeSearch(query.search);

    return {
      tenantId,
      deletedAt: null,
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async getUserQuota(
    tenantId: string,
  ): Promise<{ maxUsers: number | null; currentUsers: number }> {
    const plan = await this.quotaService.getTenantPlanLimits(tenantId);
    const currentUsers = await this.prisma.user.count({
      where: { tenantId, deletedAt: null, isActive: true },
    });
    return { maxUsers: plan.maxUsers, currentUsers };
  }

  async checkEmailAvailable(tenantId: string, email: string): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId,
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });
    return !existing;
  }

  private async assertEmailAvailable(
    tenantId: string,
    email: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId,
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Email is already in use');
    }
  }
}
