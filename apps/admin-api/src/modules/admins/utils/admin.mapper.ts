import type {
  AdminDetail,
  AdminListItem,
  AdminNoteAuthor,
  AdminNoteItem,
  AdminPermissionSummary,
  AdminRoleDetail,
} from '../types/admin.types';

type AdminWithRole = {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: { id: string; name: string; isSystem: boolean };
};

export function toAdminListItem(admin: AdminWithRole): AdminListItem {
  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    roleId: admin.roleId,
    roleName: admin.role.name,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
  };
}

export function toAdminDetail(
  admin: AdminWithRole,
  activeSessionsCount: number,
): AdminDetail {
  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: {
      id: admin.role.id,
      name: admin.role.name,
      isSystem: admin.role.isSystem,
    },
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    activeSessionsCount,
  };
}

export function toAdminRoleDetail(role: {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: Array<{
    permission: { id: string; key: string; description: string | null };
  }>;
}): AdminRoleDetail {
  return {
    id: role.id,
    name: role.name,
    isSystem: role.isSystem,
    permissions: role.permissions.map(({ permission }) => ({
      id: permission.id,
      key: permission.key,
      description: permission.description,
    })),
  };
}

export function toAdminRoleSummary(role: {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: Array<{
    permission: { id: string; key: string; description: string | null };
  }>;
}): AdminRoleDetail {
  return toAdminRoleDetail(role);
}

export function toAdminNoteItem(note: {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorAdmin: { id: string; fullName: string; email: string };
}): AdminNoteItem {
  return {
    id: note.id,
    content: note.content,
    author: toNoteAuthor(note.authorAdmin),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export function toNoteAuthor(admin: {
  id: string;
  fullName: string;
  email: string;
}): AdminNoteAuthor {
  return {
    id: admin.id,
    fullName: admin.fullName,
    email: admin.email,
  };
}

export type { AdminPermissionSummary };
