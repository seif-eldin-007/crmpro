import type { RowSelectionState } from "@tanstack/react-table";
import { create } from "zustand";
import type { LeadStatus, LeadsListParams } from "@/features/leads/types";
import { countActiveLeadFilters } from "@/features/leads/utils/lead-filters";

export interface LeadsTableFilters {
  id?: string;
  pipelineId?: string;
  stageId?: string;
  sourceId?: string;
  assignedUserId?: string;
  status?: LeadStatus;
  projectId?: string;
  unassignedOnly?: boolean;
  staleOnly?: boolean;
}

export type LeadsSortField =
  | "createdAt"
  | "updatedAt"
  | "fullName"
  | "lastContactedAt";

interface LeadsTableState {
  page: number;
  limit: number;
  sortBy: LeadsSortField;
  sortOrder: "asc" | "desc";
  filters: LeadsTableFilters;
  rowSelection: RowSelectionState;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSort: (sortBy: LeadsSortField, sortOrder: "asc" | "desc") => void;
  setFilters: (filters: Partial<LeadsTableFilters>) => void;
  clearFilters: () => void;
  setRowSelection: (selection: RowSelectionState) => void;
  clearRowSelection: () => void;
  resetPage: () => void;
}

const DEFAULT_LIMIT = 25;

export const useLeadsTableStore = create<LeadsTableState>((set) => ({
  page: 1,
  limit: DEFAULT_LIMIT,
  sortBy: "createdAt",
  sortOrder: "desc",
  filters: {},
  rowSelection: {},
  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit, page: 1 }),
  setSort: (sortBy, sortOrder) => set({ sortBy, sortOrder, page: 1 }),
  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
      page: 1,
      rowSelection: {},
    })),
  clearFilters: () =>
    set({
      filters: {},
      page: 1,
      rowSelection: {},
    }),
  setRowSelection: (rowSelection) => set({ rowSelection }),
  clearRowSelection: () => set({ rowSelection: {} }),
  resetPage: () => set({ page: 1 }),
}));

export function buildLeadsListParams(
  search: string,
  state: Pick<
    LeadsTableState,
    "page" | "limit" | "sortBy" | "sortOrder" | "filters"
  >,
): LeadsListParams {
  const trimmedSearch = search.trim();

  return {
    page: state.page,
    limit: state.limit,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...(state.filters.id ? { id: state.filters.id } : {}),
    ...(state.filters.pipelineId ? { pipelineId: state.filters.pipelineId } : {}),
    ...(state.filters.stageId ? { stageId: state.filters.stageId } : {}),
    ...(state.filters.sourceId ? { sourceId: state.filters.sourceId } : {}),
    ...(state.filters.assignedUserId
      ? { assignedUserId: state.filters.assignedUserId }
      : {}),
    ...(state.filters.status ? { status: state.filters.status } : {}),
    ...(state.filters.projectId ? { projectId: state.filters.projectId } : {}),
    ...(state.filters.unassignedOnly ? { unassignedOnly: true } : {}),
    ...(state.filters.staleOnly ? { staleOnly: true } : {}),
  };
}

export function hasActiveLeadFilters(filters: LeadsTableFilters): boolean {
  return countActiveLeadFilters(filters) > 0;
}

export function getSelectedLeadIds(selection: RowSelectionState): string[] {
  return Object.entries(selection)
    .filter(([, selected]) => selected)
    .map(([id]) => id);
}
