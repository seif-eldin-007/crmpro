"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface UseLeadSourcesUrlStateOptions {
  debouncedSearch: string;
  setSearch: (value: string) => void;
  highlightedLeadSourceId: string | null;
  setHighlightedLeadSourceId: (leadSourceId: string | null) => void;
}

export function useLeadSourcesUrlState({
  debouncedSearch,
  setSearch,
  highlightedLeadSourceId,
  setHighlightedLeadSourceId,
}: UseLeadSourcesUrlStateOptions) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    const signature = searchParams.toString();
    if (!signature || appliedRef.current === signature) {
      return;
    }

    const urlSearch = searchParams.get("search");
    if (urlSearch !== null) {
      setSearch(urlSearch);
    }

    const sourceId = searchParams.get("sourceId");
    if (sourceId) {
      setHighlightedLeadSourceId(sourceId);
    }

    appliedRef.current = signature;
  }, [searchParams, setHighlightedLeadSourceId, setSearch]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextSearch = debouncedSearch.trim();

    if (nextSearch) {
      params.set("search", nextSearch);
    } else {
      params.delete("search");
    }

    if (highlightedLeadSourceId) {
      params.set("sourceId", highlightedLeadSourceId);
    } else {
      params.delete("sourceId");
    }

    const next = params.toString();
    const current = searchParams.toString();

    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    }
  }, [
    debouncedSearch,
    highlightedLeadSourceId,
    pathname,
    router,
    searchParams,
  ]);
}
