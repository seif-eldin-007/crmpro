"use client";

import Link from "next/link";
import { ADMIN_PERMISSIONS } from "@crmpro/shared";
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
import { useUnarchivePlan } from "@/features/plans/mutations";
import type { PlanListItem } from "@/features/plans/types";
import { usePermissions } from "@/hooks/use-permissions";

interface PlanRowActionsProps {
  plan: PlanListItem;
  onEdit: (plan: PlanListItem) => void;
  onArchive: (plan: PlanListItem) => void;
}

export function PlanRowActions({
  plan,
  onEdit,
  onArchive,
}: PlanRowActionsProps) {
  const { can } = usePermissions();
  const unarchivePlan = useUnarchivePlan();
  const canUpdate = can(ADMIN_PERMISSIONS.PLAN_UPDATE);

  if (!canUpdate && !can(ADMIN_PERMISSIONS.PLAN_READ)) {
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
          aria-label={`Actions for ${plan.name}`}
        >
          <AppIcons.moreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href={`/plans/${plan.id}`}>View details</Link>
        </DropdownMenuItem>
        {canUpdate ? (
          <DropdownMenuItem onClick={() => onEdit(plan)}>
            Edit plan
          </DropdownMenuItem>
        ) : null}
        {canUpdate ? (
          <>
            <DropdownMenuSeparator />
            {plan.isActive ? (
              <DropdownMenuItem onClick={() => onArchive(plan)}>
                Archive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => void unarchivePlan.mutateAsync(plan.id)}
              >
                Restore
              </DropdownMenuItem>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlanRowContextMenu({
  plan,
  onEdit,
  onArchive,
}: PlanRowActionsProps) {
  const { can } = usePermissions();
  const unarchivePlan = useUnarchivePlan();
  const canUpdate = can(ADMIN_PERMISSIONS.PLAN_UPDATE);

  if (!canUpdate && !can(ADMIN_PERMISSIONS.PLAN_READ)) {
    return <ContextMenuContent className="w-44" />;
  }

  return (
    <ContextMenuContent className="w-44">
      <ContextMenuItem asChild>
        <Link href={`/plans/${plan.id}`}>View details</Link>
      </ContextMenuItem>
      {canUpdate ? (
        <ContextMenuItem onClick={() => onEdit(plan)}>
          Edit plan
        </ContextMenuItem>
      ) : null}
      {canUpdate ? (
        <>
          <ContextMenuSeparator />
          {plan.isActive ? (
            <ContextMenuItem onClick={() => onArchive(plan)}>
              Archive
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              onClick={() => void unarchivePlan.mutateAsync(plan.id)}
            >
              Restore
            </ContextMenuItem>
          )}
        </>
      ) : null}
    </ContextMenuContent>
  );
}

