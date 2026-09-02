"use client";

import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeadSourceUiStore } from "@/features/lead-sources/stores/lead-source-ui-store";
import type { LeadSourcesSortField } from "@/features/lead-sources/types";
import { usePermissions } from "@/hooks/use-permissions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LeadSourcesToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: LeadSourcesSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (
    sortBy: LeadSourcesSortField,
    sortOrder: "asc" | "desc",
  ) => void;
  hasSearch: boolean;
  onClearSearch: () => void;
  totalItems: number;
  isFetching?: boolean;
}

export function LeadSourcesToolbar({
  search,
  onSearchChange,
  sortBy,
  sortOrder,
  onSortChange,
  hasSearch,
  onClearSearch,
  totalItems,
  isFetching,
}: LeadSourcesToolbarProps) {
  const openCreateDialog = useLeadSourceUiStore((s) => s.openCreateDialog);
  const { can } = usePermissions();
  const sortValue = `${sortBy}:${sortOrder}`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3">
      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <AppIcons.search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search lead sources..."
          className="h-8 border-transparent bg-muted/40 pl-8 text-xs shadow-none"
          aria-label="Search lead sources"
        />
      </div>

      <Select
        value={sortValue}
        onValueChange={(value) => {
          const [nextSortBy, nextSortOrder] = value.split(":") as [
            LeadSourcesSortField,
            "asc" | "desc",
          ];
          onSortChange(nextSortBy, nextSortOrder);
        }}
      >
        <SelectTrigger className="h-8 w-[10rem] text-xs">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name:asc">Name A–Z</SelectItem>
          <SelectItem value="name:desc">Name Z–A</SelectItem>
          <SelectItem value="createdAt:desc">Newest first</SelectItem>
        </SelectContent>
      </Select>

      {hasSearch ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={onClearSearch}
        >
          <AppIcons.close className="size-3.5" />
          Clear
        </Button>
      ) : null}

      <span
        className={cn(
          "text-xs tabular-nums text-muted-foreground",
          isFetching && "opacity-70",
        )}
      >
        {formatNumber(totalItems)} lead sources
      </span>

      {can("lead-source.create") ? (
        <Button size="sm" className="ml-auto h-8" onClick={openCreateDialog}>
          <AppIcons.create className="size-3.5" />
          New lead source
        </Button>
      ) : null}
    </div>
  );
}
