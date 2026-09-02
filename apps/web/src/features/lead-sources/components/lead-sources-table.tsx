"use client";

import { useEffect, useRef } from "react";
import { AppIcons } from "@/components/icons/app-icons";
import {
  LeadSourceRowActions,
  LeadSourceRowContextMenu,
} from "@/features/lead-sources/components/lead-source-row-actions";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import type {
  LeadSource,
  LeadSourcesSortField,
} from "@/features/lead-sources/types";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LeadSourcesTableProps {
  leadSources: LeadSource[];
  sortBy: LeadSourcesSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (
    sortBy: LeadSourcesSortField,
    sortOrder: "asc" | "desc",
  ) => void;
  highlightedLeadSourceId?: string | null;
  onHighlightLeadSource?: (leadSourceId: string) => void;
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSortChange,
}: {
  label: string;
  column: LeadSourcesSortField;
  sortBy: LeadSourcesSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (
    sortBy: LeadSourcesSortField,
    sortOrder: "asc" | "desc",
  ) => void;
}) {
  const isSorted = sortBy === column;

  return (
    <th className="h-8 px-3 font-medium text-[11px] tracking-wide text-muted-foreground uppercase">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-0.5 transition-colors hover:text-foreground",
          isSorted && "text-foreground",
        )}
        onClick={() =>
          onSortChange(column, isSorted && sortOrder === "desc" ? "asc" : "desc")
        }
      >
        {label}
        {isSorted ? (
          <AppIcons.chevronDown
            className={cn("size-3", sortOrder === "asc" && "rotate-180")}
          />
        ) : null}
      </button>
    </th>
  );
}

export function LeadSourcesTable({
  leadSources,
  sortBy,
  sortOrder,
  onSortChange,
  highlightedLeadSourceId,
  onHighlightLeadSource,
}: LeadSourcesTableProps) {
  return (
    <div className="overflow-x-auto bg-background">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead className="border-b border-border/50 bg-muted/25">
          <tr className="text-left">
            <SortableHeader
              label="Lead source"
              column="name"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
            <th className="h-8 w-10 px-2" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {leadSources.map((leadSource) => (
            <LeadSourceTableRow
              key={leadSource.id}
              leadSource={leadSource}
              highlightedLeadSourceId={highlightedLeadSourceId}
              onHighlightLeadSource={onHighlightLeadSource}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadSourceTableRow({
  leadSource,
  highlightedLeadSourceId,
  onHighlightLeadSource,
}: {
  leadSource: LeadSource;
  highlightedLeadSourceId?: string | null;
  onHighlightLeadSource?: (leadSourceId: string) => void;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const isHighlighted = highlightedLeadSourceId === leadSource.id;

  useEffect(() => {
    if (isHighlighted) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isHighlighted]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr
          ref={rowRef}
          className={cn(
            "border-b border-border/40 transition-colors last:border-0 hover:bg-muted/20",
            isHighlighted && "bg-primary/5",
          )}
          onClick={() => onHighlightLeadSource?.(leadSource.id)}
        >
          <td className="px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold tracking-wide text-muted-foreground">
                {getInitials(leadSource.name)}
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {leadSource.name}
              </span>
            </div>
          </td>
          <td
            className="px-2 py-2.5 text-right"
            onClick={(event) => event.stopPropagation()}
          >
            <LeadSourceRowActions leadSource={leadSource} />
          </td>
        </tr>
      </ContextMenuTrigger>
      <LeadSourceRowContextMenu leadSource={leadSource} />
    </ContextMenu>
  );
}
