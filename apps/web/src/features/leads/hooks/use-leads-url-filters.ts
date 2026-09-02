"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLeadUiStore } from "@/features/leads/stores/lead-ui-store";
import type { LeadsTableFilters } from "@/features/leads/stores/leads-table-store";
import { useLeadsTableStore } from "@/features/leads/stores/leads-table-store";
import type { LeadStatus } from "@/features/leads/types";

interface UseLeadsUrlFiltersOptions {
  /** Debounced search value written to the URL (avoids a replace per keystroke). */
  debouncedSearch: string;
  setSearch: (value: string) => void;
}

function parseBooleanParam(value: string | null): boolean {
  return value === "true";
}

/**
 * Two-way sync between the leads table state and the URL, matching the users
 * module. Incoming links (shared/bookmarked/refresh/back-forward) populate the
 * search, filters and detail drawer; local changes are written back with
 * `router.replace` so the current view is always shareable.
 */
export function useLeadsUrlFilters({
  debouncedSearch,
  setSearch,
}: UseLeadsUrlFiltersOptions) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useLeadsTableStore((state) => state.filters);
  const setFilters = useLeadsTableStore((state) => state.setFilters);
  const selectedLeadId = useLeadUiStore((state) => state.selectedLeadId);
  const drawerOpen = useLeadUiStore((state) => state.drawerOpen);
  const openDrawer = useLeadUiStore((state) => state.openDrawer);
  const appliedRef = useRef<string | null>(null);

  // URL -> state: apply an incoming link once per distinct query string.
  useEffect(() => {
    const signature = searchParams.toString();
    if (appliedRef.current === signature) {
      return;
    }

    const urlSearch = searchParams.get("search");
    if (urlSearch !== null) {
      setSearch(urlSearch);
    }

    const partial: Partial<LeadsTableFilters> = {};

    const pipelineId = searchParams.get("pipelineId");
    if (pipelineId) partial.pipelineId = pipelineId;

    const stageId = searchParams.get("stageId");
    if (stageId) partial.stageId = stageId;

    const sourceId = searchParams.get("sourceId");
    if (sourceId) partial.sourceId = sourceId;

    const assignedUserId = searchParams.get("assignedUserId");
    if (assignedUserId) partial.assignedUserId = assignedUserId;

    const projectId = searchParams.get("projectId");
    if (projectId) partial.projectId = projectId;

    if (parseBooleanParam(searchParams.get("unassigned"))) {
      partial.unassignedOnly = true;
    }
    if (parseBooleanParam(searchParams.get("stale"))) {
      partial.staleOnly = true;
    }

    const status = searchParams.get("status");
    if (status === "OPEN" || status === "ARCHIVED") {
      partial.status = status as LeadStatus;
    }

    if (Object.keys(partial).length > 0) {
      setFilters(partial);
    }

    const leadId = searchParams.get("id");
    if (leadId) {
      openDrawer(leadId);
    }

    appliedRef.current = signature;
  }, [searchParams, setFilters, openDrawer, setSearch]);

  // state -> URL: keep the address bar shareable/bookmarkable.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value?: string | null) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    };

    setOrDelete("search", debouncedSearch.trim());
    setOrDelete("pipelineId", filters.pipelineId);
    setOrDelete("stageId", filters.stageId);
    setOrDelete("sourceId", filters.sourceId);
    setOrDelete("assignedUserId", filters.assignedUserId);
    setOrDelete("projectId", filters.projectId);
    setOrDelete("status", filters.status);
    setOrDelete("unassigned", filters.unassignedOnly ? "true" : null);
    setOrDelete("stale", filters.staleOnly ? "true" : null);
    setOrDelete("id", drawerOpen && selectedLeadId ? selectedLeadId : null);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      // Mark applied so our own replace does not re-trigger the URL -> state pass.
      appliedRef.current = next;
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [
    debouncedSearch,
    drawerOpen,
    filters,
    pathname,
    router,
    searchParams,
    selectedLeadId,
  ]);
}
