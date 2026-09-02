"use client";

import {
  createLeadSource,
  deleteLeadSource,
  updateLeadSource,
} from "@/features/lead-sources/api";
import type {
  CreateLeadSourceInput,
  UpdateLeadSourceInput,
} from "@/features/lead-sources/types";
import { queryKeys } from "@/lib/query/query-keys";
import { useApiMutation } from "@/lib/query/use-api-mutation";

// Lead sources also feed the leads filter options, so refresh leads too.
const leadSourceInvalidateKeys = [
  queryKeys.leadSources.all(),
  queryKeys.leads.all(),
] as const;

export function useCreateLeadSource() {
  return useApiMutation({
    mutationFn: (input: CreateLeadSourceInput) => createLeadSource(input),
    successMessage: "Lead source created",
    invalidateKeys: [...leadSourceInvalidateKeys],
  });
}

export function useUpdateLeadSource() {
  return useApiMutation({
    mutationFn: ({
      leadSourceId,
      input,
    }: {
      leadSourceId: string;
      input: UpdateLeadSourceInput;
    }) => updateLeadSource(leadSourceId, input),
    successMessage: "Lead source updated",
    invalidateKeys: [...leadSourceInvalidateKeys],
  });
}

export function useDeleteLeadSource() {
  return useApiMutation({
    mutationFn: (leadSourceId: string) => deleteLeadSource(leadSourceId),
    successMessage: "Lead source deleted",
    invalidateKeys: [...leadSourceInvalidateKeys],
  });
}
