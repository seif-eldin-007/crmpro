import type { ListQueryParams, PaginatedResponse } from "@/types/pagination";

export interface LeadSource {
  id: string;
  name: string;
}

export interface CreateLeadSourceInput {
  name: string;
}

export interface UpdateLeadSourceInput {
  name: string;
}

export type LeadSourcesListParams = ListQueryParams & {
  sortBy?: "name" | "createdAt";
};

export type LeadSourcesListResponse = PaginatedResponse<LeadSource>;

export type LeadSourcesSortField = "name" | "createdAt";
