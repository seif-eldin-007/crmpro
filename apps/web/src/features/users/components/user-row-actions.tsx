"use client";

import Link from "next/link";
import type { UserListItem } from "@/features/users/types";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useUserUiStore } from "@/features/users/stores/user-ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { usePermissions } from "@/hooks/use-permissions";

interface UserRowActionsProps {
  user: UserListItem;
}

export function UserRowActions({ user }: UserRowActionsProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const openDrawer = useUserUiStore((s) => s.openDrawer);
  const openEditDialog = useUserUiStore((s) => s.openEditDialog);
  const openChangeRoleDialog = useUserUiStore((s) => s.openChangeRoleDialog);
  const openResetPasswordDialog = useUserUiStore((s) => s.openResetPasswordDialog);
  const openConfirmAction = useUserUiStore((s) => s.openConfirmAction);
  const { can } = usePermissions();

  const isSelf = currentUserId === user.id;
  const canUpdate = can("user.update");
  const canManage = can("user.manage");

  if (!canUpdate && !canManage) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8"
          aria-label={`Actions for ${user.fullName}`}
        >
          <AppIcons.moreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => openDrawer(user.id)}>
          View profile
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/leads?assignedUserId=${user.id}`}>View leads</Link>
        </DropdownMenuItem>
        {canUpdate ? (
          <DropdownMenuItem onClick={() => openEditDialog(user.id)}>
            Edit name
          </DropdownMenuItem>
        ) : null}
        {canUpdate && !isSelf ? (
          <DropdownMenuItem onClick={() => openChangeRoleDialog(user.id)}>
            Change role
          </DropdownMenuItem>
        ) : null}
        {canUpdate && !isSelf ? (
          user.isActive ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                openConfirmAction({
                  action: "deactivate",
                  userId: user.id,
                  userName: user.fullName,
                })
              }
            >
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() =>
                openConfirmAction({
                  action: "reactivate",
                  userId: user.id,
                  userName: user.fullName,
                })
              }
            >
              Reactivate
            </DropdownMenuItem>
          )
        ) : null}
        {canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openResetPasswordDialog(user.id)}>
              Reset password
            </DropdownMenuItem>
            {!isSelf ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() =>
                  openConfirmAction({
                    action: "revokeSessions",
                    userId: user.id,
                    userName: user.fullName,
                  })
                }
              >
                Revoke sessions
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserRowContextMenu({ user }: UserRowActionsProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const openDrawer = useUserUiStore((s) => s.openDrawer);
  const openEditDialog = useUserUiStore((s) => s.openEditDialog);
  const openChangeRoleDialog = useUserUiStore((s) => s.openChangeRoleDialog);
  const openResetPasswordDialog = useUserUiStore((s) => s.openResetPasswordDialog);
  const openConfirmAction = useUserUiStore((s) => s.openConfirmAction);
  const { can } = usePermissions();

  const isSelf = currentUserId === user.id;
  const canUpdate = can("user.update");
  const canManage = can("user.manage");

  if (!canUpdate && !canManage) return <ContextMenuContent className="w-48" />;

  return (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={() => openDrawer(user.id)}>
        View profile
      </ContextMenuItem>
      <ContextMenuItem asChild>
        <Link href={`/leads?assignedUserId=${user.id}`}>View leads</Link>
      </ContextMenuItem>
      {canUpdate ? (
        <ContextMenuItem onClick={() => openEditDialog(user.id)}>
          Edit name
        </ContextMenuItem>
      ) : null}
      {canUpdate && !isSelf ? (
        <ContextMenuItem onClick={() => openChangeRoleDialog(user.id)}>
          Change role
        </ContextMenuItem>
      ) : null}
      {canUpdate && !isSelf ? (
        user.isActive ? (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() =>
              openConfirmAction({
                action: "deactivate",
                userId: user.id,
                userName: user.fullName,
              })
            }
          >
            Deactivate
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={() =>
              openConfirmAction({
                action: "reactivate",
                userId: user.id,
                userName: user.fullName,
              })
            }
          >
            Reactivate
          </ContextMenuItem>
        )
      ) : null}
      {canManage ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => openResetPasswordDialog(user.id)}>
            Reset password
          </ContextMenuItem>
          {!isSelf ? (
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                openConfirmAction({
                  action: "revokeSessions",
                  userId: user.id,
                  userName: user.fullName,
                })
              }
            >
              Revoke sessions
            </ContextMenuItem>
          ) : null}
        </>
      ) : null}
    </ContextMenuContent>
  );
}
