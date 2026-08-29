"use client";

import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import type { Lead } from "@/features/leads/types";
import type { LeadsSortField } from "@/features/leads/stores/leads-table-store";
import { createLeadColumns } from "./columns";

interface UseLeadsTableOptions {
  data: Lead[];
  pageCount: number;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  sortBy: LeadsSortField;
  sortOrder: "asc" | "desc";
  onSortChange: (sortBy: LeadsSortField, sortOrder: "asc" | "desc") => void;
}

export function useLeadsTable({
  data,
  pageCount,
  rowSelection,
  onRowSelectionChange,
  sortBy,
  sortOrder,
  onSortChange,
}: UseLeadsTableOptions) {
  const columns = useMemo(() => createLeadColumns(), []);

  const sorting: SortingState = useMemo(
    () => [{ id: sortBy, desc: sortOrder === "desc" }],
    [sortBy, sortOrder],
  );

  // TanStack Table intentionally returns non-memoizable handlers; React Compiler skips it
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: {
      sorting,
      rowSelection,
      pagination: { pageIndex: 0, pageSize: data.length || 1 },
    },
    enableRowSelection: true,
    onRowSelectionChange,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      if (!first) return;
      const field = first.id as LeadsSortField;
      onSortChange(field, first.desc ? "desc" : "asc");
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    getRowId: (row) => row.id,
  });

  return table;
}

export { flexRender };
