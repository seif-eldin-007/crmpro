import { apiClient } from "@/lib/api/client";
import { serializeQueryParams } from "@/lib/query/query-params";
import type {
  CreateLeadSourceInput,
  LeadSource,
  LeadSourcesListParams,
  LeadSourcesListResponse,
  UpdateLeadSourceInput,
} from "./types";

export function getLeadSources(params?: LeadSourcesListParams) {
  return apiClient.get<LeadSourcesListResponse>("/lead-sources", {
    query: serializeQueryParams({
      sortBy: "name",
      sortOrder: "asc",
      limit: 50,
      ...params,
    }),
  });
}

export function getLeadSourceById(id: string) {
  return apiClient.get<LeadSource>(`/lead-sources/${id}`);
}

export function createLeadSource(input: CreateLeadSourceInput) {
  return apiClient.post<LeadSource>("/lead-sources", input);
}

export function updateLeadSource(id: string, input: UpdateLeadSourceInput) {
  return apiClient.patch<LeadSource>(`/lead-sources/${id}`, input);
}

export function deleteLeadSource(id: string) {
  return apiClient.delete<{ id: string }>(`/lead-sources/${id}`);
}
