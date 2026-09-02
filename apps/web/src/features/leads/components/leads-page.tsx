"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLeads, useLeadsListParams } from "@/features/leads/hooks";
import { useLeadsUrlFilters } from "@/features/leads/hooks/use-leads-url-filters";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  getSelectedLeadIds,
  useLeadsTableStore,
} from "@/features/leads/stores/leads-table-store";
import { BulkActionsToolbar } from "./bulk-actions-toolbar";
import { LeadsEmptyState } from "./leads-empty-state";
import { LeadsHeader } from "./leads-header";
import { LeadsPagination } from "./leads-pagination";
import { LeadsSkeleton } from "./leads-skeleton";
import { LeadsTable } from "./leads-table";
import { LeadsToolbar } from "./leads-toolbar";
import { useLeadsTable } from "@/features/leads/table/use-leads-table";
import { countActiveLeadFilters } from "@/features/leads/utils/lead-filters";
import { LeadDetailDrawer } from "./lead-detail-drawer";
import { CreateLeadDialog } from "./create-lead-dialog";
import { AssignLeadDialog } from "./assign-lead-dialog";
import { EditLeadDialog } from "./edit-lead-dialog";
import { MoveStageDialog } from "./move-stage-dialog";

export function LeadsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  useLeadsUrlFilters({ debouncedSearch, setSearch });
  const listParams = useLeadsListParams(search);

  const sortBy = useLeadsTableStore((s) => s.sortBy);
  const sortOrder = useLeadsTableStore((s) => s.sortOrder);
  const filters = useLeadsTableStore((s) => s.filters);
  const rowSelection = useLeadsTableStore((s) => s.rowSelection);
  const setPage = useLeadsTableStore((s) => s.setPage);
  const limit = useLeadsTableStore((s) => s.limit);
  const setLimit = useLeadsTableStore((s) => s.setLimit);
  const setSort = useLeadsTableStore((s) => s.setSort);
  const setFilters = useLeadsTableStore((s) => s.setFilters);
  const clearFilters = useLeadsTableStore((s) => s.clearFilters);
  const setRowSelection = useLeadsTableStore((s) => s.setRowSelection);
  const clearRowSelection = useLeadsTableStore((s) => s.clearRowSelection);
  const resetPage = useLeadsTableStore((s) => s.resetPage);

  const { data, isLoading, isError, isFetching, refetch } = useLeads(listParams);

  useEffect(() => {
    resetPage();
  }, [listParams.search, resetPage]);

  const handleRowSelectionChange = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      setRowSelection(
        typeof updater === "function" ? updater(rowSelection) : updater,
      );
    },
    [rowSelection, setRowSelection],
  );

  const leads = data?.items ?? [];
  const pagination = data?.pagination;
  const selectedLeadIds = getSelectedLeadIds(rowSelection);
  const selectedCount = selectedLeadIds.length;
  const selectedLeads = leads.filter((lead) =>
    selectedLeadIds.includes(lead.id),
  );
  const assignableLeadIds = selectedLeads
    .filter((lead) => lead.status === "OPEN")
    .map((lead) => lead.id);
  const movableLeadIds = assignableLeadIds;
  const archivableLeadIds = selectedLeads
    .filter((lead) => lead.status === "OPEN")
    .map((lead) => lead.id);
  const restorableLeadIds = selectedLeads
    .filter((lead) => lead.status === "ARCHIVED")
    .map((lead) => lead.id);
  const bulkPipelineId = selectedLeads.find(
    (lead) => lead.id === selectedLeadIds[0],
  )?.pipeline.id;
  const hasFilters =
    countActiveLeadFilters(filters) > 0 || search.trim().length > 0;

  const table = useLeadsTable({
    data: leads,
    pageCount: pagination?.totalPages ?? 0,
    rowSelection,
    onRowSelectionChange: handleRowSelectionChange,
    sortBy,
    sortOrder,
    onSortChange: setSort,
  });

  if (isLoading && !data) {
    return <LeadsSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8">
        <LeadsHeader />
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AppIcons.alertCircle className="size-5" />
              Failed to load leads
            </CardTitle>
            <CardDescription>
              We couldn&apos;t fetch your leads. Check your connection and try
              again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying..." : "Retry"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showEmpty =
    leads.length === 0 && !hasFilters && pagination?.totalItems === 0;

  return (
    <div className="space-y-4 px-6 py-5 md:px-8">
      <LeadsHeader />

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <LeadsToolbar
          search={search}
          onSearchChange={setSearch}
          totalItems={pagination?.totalItems ?? 0}
          pageSize={limit}
          onPageSizeChange={setLimit}
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={() => {
            clearFilters();
            setSearch("");
          }}
          isFetching={isFetching}
        />

        <BulkActionsToolbar
          selectedCount={selectedCount}
          selectedLeadIds={selectedLeadIds}
          assignableLeadIds={assignableLeadIds}
          movableLeadIds={movableLeadIds}
          archivableLeadIds={archivableLeadIds}
          restorableLeadIds={restorableLeadIds}
          bulkPipelineId={bulkPipelineId}
          onClearSelection={clearRowSelection}
        />

        {showEmpty ? (
          <LeadsEmptyState />
        ) : (
          <>
            {leads.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No leads match your search or filters.
              </div>
            ) : (
              <LeadsTable
                table={table}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={setSort}
              />
            )}

            {pagination ? (
              <LeadsPagination
                pagination={pagination}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </div>

      <LeadDetailDrawer />
      <CreateLeadDialog />
      <EditLeadDialog />
      <AssignLeadDialog />
      <MoveStageDialog />
    </div>
  );
}
