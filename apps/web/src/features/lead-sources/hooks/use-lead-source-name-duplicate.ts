"use client";

import { useMemo } from "react";
import { useLeadSources } from "@/features/lead-sources/hooks";
import type { LeadSource } from "@/features/lead-sources/types";
import { normalizeLeadSourceNameForComparison } from "@/features/lead-sources/utils/lead-source-name";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function useLeadSourceNameDuplicate(
  name: string,
  excludeLeadSourceId?: string,
): LeadSource | null {
  const trimmed = name.trim();
  const debouncedName = useDebouncedValue(trimmed, 300);
  const enabled = debouncedName.length >= 2;

  const { data } = useLeadSources(
    enabled
      ? {
          search: debouncedName,
          limit: 20,
          sortBy: "name",
          sortOrder: "asc",
        }
      : undefined,
    { enabled },
  );

  return useMemo(() => {
    if (!enabled) {
      return null;
    }

    const normalized = normalizeLeadSourceNameForComparison(debouncedName);
    return (
      data?.items.find(
        (source) =>
          source.id !== excludeLeadSourceId &&
          normalizeLeadSourceNameForComparison(source.name) === normalized,
      ) ?? null
    );
  }, [data?.items, debouncedName, enabled, excludeLeadSourceId]);
}
