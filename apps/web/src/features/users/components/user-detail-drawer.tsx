"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AppIcons } from "@/components/icons/app-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/features/users/hooks";
import { useUserUiStore } from "@/features/users/stores/user-ui-store";
import type { UserDetail } from "@/features/users/types";
import {
  formatPermissionActionLabel,
  PERMISSION_GROUP_LABELS,
  PERMISSION_GROUP_ORDER,
  PERMISSION_GROUPS,
  type PermissionGroupKey,
} from "@/features/roles/utils/permission-catalog";
import { formatRelativeTime, getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { usePermissions } from "@/hooks/use-permissions";

export function UserDetailDrawer() {
  const drawerUserId = useUserUiStore((s) => s.drawerUserId);
  const closeDrawer = useUserUiStore((s) => s.closeDrawer);
  const openEditDialog = useUserUiStore((s) => s.openEditDialog);
  const openChangeRoleDialog = useUserUiStore((s) => s.openChangeRoleDialog);
  const openResetPasswordDialog = useUserUiStore(
    (s) => s.openResetPasswordDialog,
  );
  const openConfirmAction = useUserUiStore((s) => s.openConfirmAction);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { can } = usePermissions();

  const { data: user, isLoading, isError } = useUser(drawerUserId ?? undefined);

  const isSelf = currentUserId === drawerUserId;
  const open = Boolean(drawerUserId);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeDrawer()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/50 px-5 py-3.5">
          <SheetTitle className="text-base">User profile</SheetTitle>
          <SheetDescription className="text-xs">
            Member details, role, and access
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-4 px-5 py-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : null}

          {isError ? (
            <p className="px-5 py-6 text-sm text-destructive">
              Failed to load user.
            </p>
          ) : null}

          {user ? (
            <UserDetailBody
              user={user}
              isSelf={isSelf}
              canUpdate={can("user.update")}
              canManage={can("user.manage")}
              onEditName={() => openEditDialog(user.id)}
              onChangeRole={() => openChangeRoleDialog(user.id)}
              onResetPassword={() => openResetPasswordDialog(user.id)}
              onDeactivate={() =>
                openConfirmAction({
                  action: "deactivate",
                  userId: user.id,
                  userName: user.fullName,
                })
              }
              onReactivate={() =>
                openConfirmAction({
                  action: "reactivate",
                  userId: user.id,
                  userName: user.fullName,
                })
              }
              onRevokeSessions={() =>
                openConfirmAction({
                  action: "revokeSessions",
                  userId: user.id,
                  userName: user.fullName,
                })
              }
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UserDetailBody({
  user,
  isSelf,
  canUpdate,
  canManage,
  onEditName,
  onChangeRole,
  onResetPassword,
  onDeactivate,
  onReactivate,
  onRevokeSessions,
}: {
  user: UserDetail;
  isSelf: boolean;
  canUpdate: boolean;
  canManage: boolean;
  onEditName: () => void;
  onChangeRole: () => void;
  onResetPassword: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onRevokeSessions: () => void;
}) {
  const permissionGroups = useMemo(
    () => groupGrantedPermissions(user.permissions),
    [user.permissions],
  );

  return (
    <div className="flex flex-col">
      <div className="space-y-4 px-5 py-5">
        <div className="flex items-start gap-3">
          <Avatar className="size-11">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {getInitials(user.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
              {user.fullName}
            </h2>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-[11px] font-medium text-foreground">
                {user.role.name}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    user.isActive ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                />
                {user.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60">
          <StatCell
            label="Last login"
            value={
              user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : "Never"
            }
          />
          <StatCell
            label="Sessions"
            value={String(user.activeSessionCount)}
          />
          <StatCell label="Joined" value={formatRelativeTime(user.createdAt)} />
        </div>

        <AccessSummary
          permissionCount={user.permissions.length}
          groups={permissionGroups}
        />
      </div>

      <div className="border-t border-border/50 px-3 py-2">
        <ActionRow
          icon={AppIcons.leads}
          label="View leads"
          href={`/leads?assignedUserId=${user.id}`}
        />
        {canUpdate ? (
          <ActionRow
            icon={AppIcons.edit}
            label="Edit name"
            onClick={onEditName}
          />
        ) : null}
        {canUpdate && !isSelf ? (
          <ActionRow
            icon={AppIcons.roles}
            label="Change role"
            onClick={onChangeRole}
          />
        ) : null}
        {canManage ? (
          <ActionRow
            icon={AppIcons.lock}
            label="Reset password"
            onClick={onResetPassword}
          />
        ) : null}
      </div>

      {(canUpdate || canManage) && !isSelf ? (
        <div className="mt-auto border-t border-border/50 px-3 py-2">
          {canUpdate ? (
            user.isActive ? (
              <ActionRow
                icon={AppIcons.userOff}
                label="Deactivate"
                onClick={onDeactivate}
                tone="danger"
              />
            ) : (
              <ActionRow
                icon={AppIcons.check}
                label="Reactivate"
                onClick={onReactivate}
              />
            )
          ) : null}
          {canManage ? (
            <ActionRow
              icon={AppIcons.logout}
              label="Revoke sessions"
              onClick={onRevokeSessions}
              tone="danger"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-2.5 py-2.5 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}

function AccessSummary({
  permissionCount,
  groups,
}: {
  permissionCount: number;
  groups: Array<{ key: string; label: string; keys: string[] }>;
}) {
  const detailed = groups.filter((group) => !isViewOnlyGroup(group.keys));
  const viewOnlyLabels = groups
    .filter((group) => isViewOnlyGroup(group.keys))
    .map((group) => group.label);

  if (groups.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">Access</h3>
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-muted-foreground">
          No permissions on this role
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Access</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {permissionCount}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        {detailed.map((group) => (
          <div
            key={group.key}
            className="flex items-start gap-3 border-b border-border/50 px-3 py-2 last:border-b-0"
          >
            <p className="w-[5.5rem] shrink-0 pt-0.5 text-[11px] font-medium text-foreground">
              {group.label}
            </p>
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
              {group.keys.map(formatPermissionActionLabel).join(" · ")}
            </p>
          </div>
        ))}

        {viewOnlyLabels.length > 0 ? (
          <div className="flex items-start gap-3 px-3 py-2">
            <p className="w-[5.5rem] shrink-0 pt-0.5 text-[11px] font-medium text-foreground">
              Can view
            </p>
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
              {viewOnlyLabels.join(" · ")}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function isViewOnlyGroup(keys: string[]): boolean {
  return (
    keys.length > 0 &&
    keys.every((key) => (key.split(".").pop() ?? "") === "read")
  );
}

function ActionRow({
  icon: Icon,
  label,
  href,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: typeof AppIcons.leads;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
    tone === "danger"
      ? "text-destructive hover:bg-destructive/8"
      : "text-foreground hover:bg-muted/60",
    disabled && "pointer-events-none opacity-50",
  );

  const content = (
    <>
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          tone === "danger" ? "text-destructive/80" : "text-muted-foreground",
        )}
      />
      <span className="flex-1 font-medium">{label}</span>
      {href ? (
        <AppIcons.chevronRight className="size-3.5 text-muted-foreground/50" />
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
}

function groupGrantedPermissions(permissions: string[]) {
  const granted = new Set(permissions);
  const groups: Array<{
    key: string;
    label: string;
    keys: string[];
  }> = [];

  for (const groupKey of PERMISSION_GROUP_ORDER) {
    const keys = [...PERMISSION_GROUPS[groupKey]].filter((key) =>
      granted.has(key),
    );
    if (keys.length === 0) continue;
    groups.push({
      key: groupKey,
      label: PERMISSION_GROUP_LABELS[groupKey as PermissionGroupKey],
      keys,
    });
  }

  const known = new Set(groups.flatMap((group) => group.keys));
  const extras = permissions.filter((key) => !known.has(key));
  if (extras.length > 0) {
    groups.push({
      key: "__other",
      label: "Other",
      keys: extras,
    });
  }

  return groups;
}
