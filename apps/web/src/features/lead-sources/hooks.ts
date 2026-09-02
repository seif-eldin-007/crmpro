"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getLeadSourceById,
  getLeadSources,
} from "@/features/lead-sources/api";
import type { LeadSourcesListParams } from "@/features/lead-sources/types";
import { queryKeys } from "@/lib/query/query-keys";
import { useAuthStore } from "@/stores/auth-store";

export function useLeadSources(
  params?: LeadSourcesListParams,
  options?: { enabled?: boolean },
) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.leadSources.list(params),
    queryFn: () => getLeadSources(params),
    enabled: status === "authenticated" && (options?.enabled ?? true),
    placeholderData: (previous) => previous,
  });
}

export function useLeadSource(id: string | undefined) {
  const status = useAuthStore((state) => state.status);

  return useQuery({
    queryKey: queryKeys.leadSources.detail(id ?? ""),
    queryFn: () => getLeadSourceById(id!),
    enabled: status === "authenticated" && Boolean(id),
  });
}
