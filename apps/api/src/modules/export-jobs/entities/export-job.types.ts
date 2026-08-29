import { ExportFormat, ExportType, JobStatus } from '@crmpro/database';
import { LeadExportParams } from '../../leads/types/lead.types';

export interface ExportJobFileSummary {
  id: string;
  originalFilename: string;
}

export interface ExportJobCreatorSummary {
  id: string;
  name: string;
  email: string;
}

export interface ExportJobDownloadSummary {
  downloadUrl: string;
  expiresInSeconds: number;
}

export interface CreateExportJobResponse {
  id: string;
  status: JobStatus;
}

export interface ExportJobResponse {
  id: string;
  exportType: ExportType;
  format: ExportFormat;
  status: JobStatus;
  progress: number;
  rowCount: number | null;
  filters: LeadExportParams;
  errorMessage: string | null;
  fileAssetId: string | null;
  fileAsset: ExportJobFileSummary | null;
  download: ExportJobDownloadSummary | null;
  createdBy: ExportJobCreatorSummary;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface LeadExportRow {
  leadName: string;
  primaryPhone: string;
  secondaryPhone: string;
  email: string;
  leadSource: string;
  pipeline: string;
  stage: string;
  assignedUser: string;
  interestedProjects: string;
  status: string;
  createdAt: string;
}
