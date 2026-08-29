import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import type { PermissionKey } from '@crmpro/shared/auth';
import { TENANT_ROLE_NAMES } from '@crmpro/shared/bootstrap';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  normalizeDisplayName,
  normalizeNameForComparison,
} from '../../common/utils/name-normalization.util';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolesAuditService } from './services/roles-audit.service';
import type { RoleDetail, RoleListItem } from './types/role.types';
import { assertCanGrantPermissions } from '../../common/auth/utils/permission-escalation.util';
import { toRoleDetail, toRoleListItem } from './utils/role.mapper';

const SYSTEM_ROLE_NAMES = new Set<string>(Object.values(TENANT_ROLE_NAMES));

const roleSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RoleSelect;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: RolesAuditService,
  ) {}

  async listRoles(tenantId: string): Promise<RoleListItem[]> {
    const roles = await this.prisma.role.findMany({
      where: { tenantId, deletedAt: null },
      select: roleSelect,
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      roles.map(async (role) =>
        toRoleListItem(role, await this.getRoleCounts(role.id)),
      ),
    );
  }

  async getRole(tenantId: string, id: string): Promise<RoleDetail> {
    const role = await this.getRoleOrThrow(tenantId, id);
    const counts = await this.getRoleCounts(role.id);
    const permissionKeys = await this.getRolePermissionKeys(role.id);

    return toRoleDetail(role, counts, permissionKeys);
  }

  async createRole(
    tenantId: string,
    actorUserId: string,
    dto: CreateRoleDto,
  ): Promise<RoleDetail> {
    const name = normalizeDisplayName(dto.name);
    this.assertNotReservedRoleName(name);
    await this.assertRoleNameUnique(tenantId, name);

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          tenantId,
          name,
          description: dto.description ?? null,
          isSystem: false,
        },
        select: roleSelect,
      });

      await this.auditService.logRoleCreated(
        tenantId,
        actorUserId,
        created.id,
        { name: created.name },
        tx,
      );

      return created;
    });

    return toRoleDetail(role, { permissionCount: 0, userCount: 0 }, []);
  }

  async updateRole(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<RoleDetail> {
    const existing = await this.getRoleOrThrow(tenantId, id);
    this.assertCustomRole(existing);

    const name = normalizeDisplayName(dto.name);
    this.assertNotReservedRoleName(name);

    if (
      normalizeNameForComparison(name) !==
      normalizeNameForComparison(existing.name)
    ) {
      await this.assertRoleNameUnique(tenantId, name, id);
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id },
        data: { name },
        select: roleSelect,
      });

      await this.auditService.logRoleUpdated(
        tenantId,
        actorUserId,
        id,
        { name },
        tx,
      );

      return updated;
    });

    const counts = await this.getRoleCounts(role.id);
    const permissionKeys = await this.getRolePermissionKeys(role.id);

    return toRoleDetail(role, counts, permissionKeys);
  }

  async updateRolePermissions(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateRolePermissionsDto,
  ): Promise<RoleDetail> {
    const existing = await this.getRoleOrThrow(tenantId, id);
    this.assertCustomRole(existing);

    const permissions = await this.resolvePermissionKeys(dto.permissionKeys);
    const permissionKeys = permissions.map(
      (permission) => permission.key,
    ) as PermissionKey[];
    const actorPermissionKeys =
      await this.permissionsService.getPermissionKeysForUser(
        actorUserId,
        tenantId,
      );

    assertCanGrantPermissions(actorPermissionKeys, permissionKeys);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });

      await this.auditService.logRolePermissionsUpdated(
        tenantId,
        actorUserId,
        id,
        { permissionCount: permissionKeys.length },
        tx,
      );
    });

    return this.getRole(tenantId, id);
  }

  async archiveRole(
    tenantId: string,
    actorUserId: string,
    id: string,
  ): Promise<{ success: true }> {
    const existing = await this.getRoleOrThrow(tenantId, id);
    this.assertCustomRole(existing);

    const assignedUsers = await this.prisma.user.count({
      where: { tenantId, roleId: id, deletedAt: null },
    });

    if (assignedUsers > 0) {
      throw new BadRequestException(
        'Cannot archive a role that is assigned to users',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditService.logRoleArchived(
        tenantId,
        actorUserId,
        id,
        { name: existing.name },
        tx,
      );
    });

    return { success: true };
  }

  private async getRoleOrThrow(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: roleSelect,
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  private assertCustomRole(role: { isSystem: boolean; name: string }): void {
    if (role.isSystem || SYSTEM_ROLE_NAMES.has(role.name)) {
      throw new BadRequestException('System roles cannot be modified');
    }
  }

  private assertNotReservedRoleName(name: string): void {
    const normalized = normalizeNameForComparison(name);

    for (const reserved of SYSTEM_ROLE_NAMES) {
      if (normalizeNameForComparison(reserved) === normalized) {
        throw new BadRequestException(
          'Role name is reserved for a system role',
        );
      }
    }
  }

  private async assertRoleNameUnique(
    tenantId: string,
    name: string,
    excludeRoleId?: string,
  ): Promise<void> {
    const roles = await this.prisma.role.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}),
      },
      select: { id: true, name: true },
    });

    const normalized = normalizeNameForComparison(name);
    const conflict = roles.find(
      (role) => normalizeNameForComparison(role.name) === normalized,
    );

    if (conflict) {
      throw new ConflictException('Role name is already in use');
    }
  }

  private async getRoleCounts(roleId: string) {
    const [permissionCount, userCount] = await this.prisma.$transaction([
      this.prisma.rolePermission.count({ where: { roleId } }),
      this.prisma.user.count({
        where: { roleId, deletedAt: null },
      }),
    ]);

    return { permissionCount, userCount };
  }

  private async getRolePermissionKeys(
    roleId: string,
  ): Promise<PermissionKey[]> {
    const permissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: { key: true } } },
      orderBy: { permission: { key: 'asc' } },
    });

    return permissions.map((entry) => entry.permission.key) as PermissionKey[];
  }

  private async resolvePermissionKeys(
    keys: string[],
  ): Promise<{ id: string; key: string }[]> {
    const uniqueKeys = [...new Set(keys)];
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: uniqueKeys } },
      select: { id: true, key: true },
    });

    if (permissions.length !== uniqueKeys.length) {
      throw new BadRequestException('One or more permission keys are invalid');
    }

    return permissions;
  }
}
