import type { ListQueryParams, PaginatedResponse } from "@/types/pagination";

export type LeadStatus = "OPEN" | "ARCHIVED";

export type PipelineCloseType = "WON" | "LOST" | null;

export type InterestLevel = "LOW" | "MEDIUM" | "HIGH" | "HOT" | null;

export interface LeadSourceSummary {
  id: string;
  name: string;
}

export interface LeadPipelineSummary {
  id: string;
  name: string;
}

export interface LeadStageSummary {
  id: string;
  name: string;
  isClosed: boolean;
  closeType: PipelineCloseType;
  color: string | null;
}

export interface LeadAssigneeSummary {
  id: string;
  name: string;
}

export interface LeadProjectSummary {
  id: string;
  name: string;
}

export interface LeadProjectInterest {
  projectId: string;
  interestLevel: InterestLevel;
  project: LeadProjectSummary;
}

export interface Lead {
  id: string;
  status: LeadStatus;
  fullName: string;
  primaryPhone: string;
  secondaryPhone: string | null;
  email: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  source: LeadSourceSummary | null;
  pipeline: LeadPipelineSummary;
  stage: LeadStageSummary;
  assignee: LeadAssigneeSummary | null;
  projectInterests: LeadProjectInterest[];
}

export interface CreateLeadInput {
  fullName: string;
  primaryPhone: string;
  email?: string | null;
  sourceId?: string;
  pipelineId: string;
  pipelineStageId: string;
  assignedUserId?: string;
  projectInterests?: Array<{
    projectId: string;
    interestLevel?: InterestLevel;
  }>;
}

export interface DuplicateMatch {
  id: string;
  fullName: string;
}

export interface DuplicateWarning {
  detected: true;
  matches: DuplicateMatch[];
}

export interface LeadMutationResult {
  lead: Lead;
  duplicateWarning: DuplicateWarning | null;
}

export type CreateLeadResult = LeadMutationResult;

export interface UpdateLeadInput {
  fullName?: string;
  primaryPhone?: string;
  secondaryPhone?: string | null;
  email?: string | null;
  sourceId?: string | null;
  status?: LeadStatus;
  projectInterests?: Array<{
    projectId: string;
    interestLevel?: InterestLevel;
  }>;
}

export interface LeadNote {
  id: string;
  content: string;
  author: { id: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface LeadTimelineActivity {
  id: string;
  eventType: string;
  metadata: unknown;
  actor: { id: string; email: string } | null;
  createdAt: string;
}

export interface BulkLeadActionResult {
  successCount: number;
  failureCount: number;
  failures: Array<{ leadId: string; reason: string }>;
}

export interface LeadsListParams extends ListQueryParams {
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

export type LeadsListResponse = PaginatedResponse<Lead>;
