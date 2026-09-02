"use client";

import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { useLeadSourceUiStore } from "@/features/lead-sources/stores/lead-source-ui-store";
import { usePermissions } from "@/hooks/use-permissions";

interface LeadSourcesEmptyStateProps {
  hasSearch: boolean;
}

export function LeadSourcesEmptyState({ hasSearch }: LeadSourcesEmptyStateProps) {
  const openCreateDialog = useLeadSourceUiStore((s) => s.openCreateDialog);
  const { can } = usePermissions();

  if (hasSearch) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <AppIcons.search className="size-5 text-muted-foreground/50" />
        <h2 className="mt-3 text-sm font-medium text-foreground">No matches</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <AppIcons.leadSources className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        No lead sources yet
      </h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Add the channels and campaigns your leads come from to track what is
        working.
      </p>
      {can("lead-source.create") ? (
        <Button size="sm" className="mt-4" onClick={openCreateDialog}>
          <AppIcons.create className="size-3.5" />
          New lead source
        </Button>
      ) : null}
    </div>
  );
}
