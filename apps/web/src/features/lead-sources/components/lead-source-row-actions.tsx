"use client";

import Link from "next/link";
import type { LeadSource } from "@/features/lead-sources/types";
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
import { useLeadSourceUiStore } from "@/features/lead-sources/stores/lead-source-ui-store";
import { usePermissions } from "@/hooks/use-permissions";

interface LeadSourceRowActionsProps {
  leadSource: LeadSource;
}

export function LeadSourceRowActions({ leadSource }: LeadSourceRowActionsProps) {
  const openEditDialog = useLeadSourceUiStore((s) => s.openEditDialog);
  const openDeleteDialog = useLeadSourceUiStore((s) => s.openDeleteDialog);
  const { can } = usePermissions();

  const canUpdate = can("lead-source.update");
  const canDelete = can("lead-source.delete");
  const canReadLeads = can("lead.read");

  if (!canUpdate && !canDelete && !canReadLeads) {
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
          aria-label={`Actions for ${leadSource.name}`}
        >
          <AppIcons.moreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {canReadLeads ? (
          <DropdownMenuItem asChild>
            <Link href={`/leads?sourceId=${leadSource.id}`}>View leads</Link>
          </DropdownMenuItem>
        ) : null}
        {canUpdate ? (
          <DropdownMenuItem onClick={() => openEditDialog(leadSource.id)}>
            Edit
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <>
            {canUpdate || canReadLeads ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => openDeleteDialog(leadSource.id)}
            >
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LeadSourceRowContextMenu({
  leadSource,
}: LeadSourceRowActionsProps) {
  const openEditDialog = useLeadSourceUiStore((s) => s.openEditDialog);
  const openDeleteDialog = useLeadSourceUiStore((s) => s.openDeleteDialog);
  const { can } = usePermissions();

  const canUpdate = can("lead-source.update");
  const canDelete = can("lead-source.delete");
  const canReadLeads = can("lead.read");

  if (!canUpdate && !canDelete && !canReadLeads) {
    return <ContextMenuContent className="w-44" />;
  }

  return (
    <ContextMenuContent className="w-44">
      {canReadLeads ? (
        <ContextMenuItem asChild>
          <Link href={`/leads?sourceId=${leadSource.id}`}>View leads</Link>
        </ContextMenuItem>
      ) : null}
      {canUpdate ? (
        <ContextMenuItem onClick={() => openEditDialog(leadSource.id)}>
          Edit
        </ContextMenuItem>
      ) : null}
      {canDelete ? (
        <>
          {canUpdate || canReadLeads ? <ContextMenuSeparator /> : null}
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => openDeleteDialog(leadSource.id)}
          >
            Delete
          </ContextMenuItem>
        </>
      ) : null}
    </ContextMenuContent>
  );
}
