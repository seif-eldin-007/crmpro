"use client";

import { AppIcons } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { paginationRangeLabel } from "@/features/leads/utils/lead-formatters";
import type { PaginationMeta } from "@/types/pagination";

interface LeadSourcesPaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function LeadSourcesPagination({
  pagination,
  onPageChange,
}: LeadSourcesPaginationProps) {
  const { page, limit, totalPages, hasNextPage, hasPreviousPage, totalItems } =
    pagination;

  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border/50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        {paginationRangeLabel(page, limit, totalItems)}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!hasPreviousPage}
          onClick={() => onPageChange(page - 1)}
        >
          <AppIcons.arrowLeft className="size-3.5" />
          Prev
        </Button>
        <span className="min-w-[3.5rem] px-1 text-center text-xs tabular-nums text-muted-foreground">
          {page}/{totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!hasNextPage}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <AppIcons.arrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
