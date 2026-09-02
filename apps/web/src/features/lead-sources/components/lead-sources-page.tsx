"use client";

import { useState } from "react";
import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateLeadSourceDialog } from "@/features/lead-sources/components/create-lead-source-dialog";
import { DeleteLeadSourceDialog } from "@/features/lead-sources/components/delete-lead-source-dialog";
import { EditLeadSourceDialog } from "@/features/lead-sources/components/edit-lead-source-dialog";
import { LeadSourcesEmptyState } from "@/features/lead-sources/components/lead-sources-empty-state";
import { LeadSourcesHeader } from "@/features/lead-sources/components/lead-sources-header";
import { LeadSourcesPagination } from "@/features/lead-sources/components/lead-sources-pagination";
import { LeadSourcesSkeleton } from "@/features/lead-sources/components/lead-sources-skeleton";
import { LeadSourcesTable } from "@/features/lead-sources/components/lead-sources-table";
import { LeadSourcesToolbar } from "@/features/lead-sources/components/lead-sources-toolbar";
import { useLeadSources } from "@/features/lead-sources/hooks";
import { useLeadSourcesUrlState } from "@/features/lead-sources/hooks/use-lead-sources-url-state";
import { useLeadSourceUiStore } from "@/features/lead-sources/stores/lead-source-ui-store";
import type { LeadSourcesSortField } from "@/features/lead-sources/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const LEAD_SOURCES_PAGE_SIZE = 50;

export function LeadSourcesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<LeadSourcesSortField>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const debouncedSearch = useDebouncedValue(search, 400);
  const highlightedLeadSourceId = useLeadSourceUiStore(
    (s) => s.highlightedLeadSourceId,
  );
  const setHighlightedLeadSourceId = useLeadSourceUiStore(
    (s) => s.setHighlightedLeadSourceId,
  );

  useLeadSourcesUrlState({
    debouncedSearch,
    setSearch,
    highlightedLeadSourceId,
    setHighlightedLeadSourceId,
  });

  const { data, isLoading, isError, isFetching, refetch } = useLeadSources({
    page,
    limit: LEAD_SOURCES_PAGE_SIZE,
    search: debouncedSearch.trim() || undefined,
    sortBy,
    sortOrder,
  });

  const leadSources = data?.items ?? [];
  const pagination = data?.pagination;
  const hasSearch = debouncedSearch.trim().length > 0;
  const isEmpty = leadSources.length === 0;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSortChange = (
    nextSortBy: LeadSourcesSortField,
    nextSortOrder: "asc" | "desc",
  ) => {
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setPage(1);
  };

  if (isLoading && !data) {
    return <LeadSourcesSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-4 px-6 py-5 md:px-8">
        <LeadSourcesHeader />
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AppIcons.alertCircle className="size-5" />
              Failed to load lead sources
            </CardTitle>
            <CardDescription>
              We couldn&apos;t fetch your lead sources. Check your connection
              and try again.
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

  return (
    <div className="space-y-4 px-6 py-5 md:px-8">
      <LeadSourcesHeader />

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <LeadSourcesToolbar
          search={search}
          onSearchChange={handleSearchChange}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          hasSearch={hasSearch}
          onClearSearch={() => {
            setSearch("");
            setPage(1);
          }}
          totalItems={pagination?.totalItems ?? leadSources.length}
          isFetching={isFetching}
        />

        {isEmpty ? (
          <LeadSourcesEmptyState hasSearch={hasSearch} />
        ) : (
          <>
            <LeadSourcesTable
              leadSources={leadSources}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              highlightedLeadSourceId={highlightedLeadSourceId}
              onHighlightLeadSource={setHighlightedLeadSourceId}
            />
            {pagination ? (
              <LeadSourcesPagination
                pagination={pagination}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </div>

      <CreateLeadSourceDialog />
      <EditLeadSourceDialog />
      <DeleteLeadSourceDialog />
    </div>
  );
}
