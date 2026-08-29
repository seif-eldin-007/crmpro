import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ExportFormat,
  ExportType,
  FileAssetCategory,
  JobStatus,
  Prisma,
  AuditActorType,
} from '@crmpro/database';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../../common/pagination';
import { buildOrderBy, SortOrder } from '../../../common/query';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  TenantInactiveException,
  TenantStatusService,
} from '../../../common/tenant/tenant-status.service';
import { FilesService } from '../../files/files.service';
import { DomainEventBus } from '../../../common/events/domain-event-bus.service';
import { ExportCompletedEvent } from '../../../common/events/domain-event.types';
import { NotificationTriggerService } from '../../notifications/notification-trigger.service';
import { LeadExportParams } from '../../leads/types/lead.types';
import { QueueService } from '../../jobs/queues/queue.service';
import {
  AUDIT_ENTITY_TYPES,
  EXPORT_AUDIT_ACTIONS,
} from '../../audit/audit.constants';
import { AuditWriterService } from '../../audit/audit-writer.service';
import { CreateLeadExportDto } from '../dto/create-lead-export.dto';
import { GetExportJobsQueryDto } from '../dto/get-export-jobs-query.dto';
import {
  CreateExportJobResponse,
  ExportJobResponse,
} from '../entities/export-job.types';
import {
  EXPORT_CSV_MIME_TYPE,
  EXPORT_DOWNLOAD_URL_EXPIRY_SECONDS,
} from '../export-jobs.constants';
import { CsvExportService } from './csv-export.service';
import { LeadExportService } from './lead-export.service';

const EXPORT_JOB_SORT_FIELDS = ['createdAt', 'updatedAt', 'status'] as const;

const EXPORT_JOB_SORT_CONFIG = {
  allowedFields: EXPORT_JOB_SORT_FIELDS,
  defaultField: 'createdAt' as const,
  defaultOrder: SortOrder.DESC,
};

const exportJobSelect = {
  id: true,
  exportType: true,
  format: true,
  status: true,
  progress: true,
  rowCount: true,
  filters: true,
  errorMessage: true,
  fileAssetId: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  fileAsset: {
    select: {
      id: true,
      originalFilename: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.ExportJobSelect;

type ExportJobRecord = Prisma.ExportJobGetPayload<{
  select: typeof exportJobSelect;
}>;

@Injectable()
export class ExportJobsService {
  private readonly logger = new Logger(ExportJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly leadExportService: LeadExportService,
    private readonly csvExportService: CsvExportService,
    private readonly queueService: QueueService,
    private readonly domainEventBus: DomainEventBus,
    private readonly notificationTrigger: NotificationTriggerService,
    private readonly tenantStatusService: TenantStatusService,
    private readonly auditWriter: AuditWriterService,
  ) {}

  async createLeadExportJob(
    tenantId: string,
    userId: string,
    dto: CreateLeadExportDto,
  ): Promise<CreateExportJobResponse> {
    this.leadExportService.assertSupportedFormat(dto.format);

    const activeJob = await this.prisma.exportJob.findFirst({
      where: {
        tenantId,
        createdByUserId: userId,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
      select: { id: true, status: true },
    });

    if (activeJob) {
      throw new ConflictException(
        'An export is already in progress. Wait for it to finish or cancel it before starting a new one.',
      );
    }

    const exportParams = this.normalizeExportParams(dto);

    const job = await this.prisma.exportJob.create({
      data: {
        tenantId,
        createdByUserId: userId,
        exportType: ExportType.LEADS,
        format: dto.format,
        filters: exportParams as unknown as Prisma.InputJsonValue,
        status: JobStatus.PENDING,
        progress: 0,
      },
      select: { id: true, status: true },
    });

    await this.queueService.enqueueExportJob(job.id);

    await this.auditWriter.createAuditLog({
      tenantId,
      actorUserId: userId,
      action: EXPORT_AUDIT_ACTIONS.STARTED,
      entityType: AUDIT_ENTITY_TYPES.EXPORT_JOB,
      entityId: job.id,
    });

    return job;
  }

  async processExportJob(jobId: string): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        tenantId: true,
        createdByUserId: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Export job ${jobId} not found`);
    }

    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
      return;
    }

    try {
      await this.tenantStatusService.assertTenantActive(job.tenantId);
    } catch (error) {
      if (error instanceof TenantInactiveException) {
        await this.failExportJobIfActive(job.id, error.message);
        return;
      }

      throw error;
    }

    const claimed = await this.claimExportJob(job.id);
    if (!claimed) {
      this.logger.log(
        `Export job ${jobId} was not claimed (already processing or completed)`,
      );
      return;
    }

    await this.runExportJob(job.id, job.tenantId, job.createdByUserId);
  }

  private async claimExportJob(jobId: string): Promise<boolean> {
    const result = await this.prisma.exportJob.updateMany({
      where: {
        id: jobId,
        status: JobStatus.PENDING,
      },
      data: {
        status: JobStatus.PROCESSING,
        progress: 5,
        errorMessage: null,
      },
    });

    return result.count === 1;
  }

  async failExportJobIfActive(
    jobId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.exportJob.updateMany({
      where: {
        id: jobId,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
      data: {
        status: JobStatus.FAILED,
        errorMessage,
        completedAt: new Date(),
      },
    });
  }

  async getExportJob(id: string, tenantId: string): Promise<ExportJobResponse> {
    const job = await this.getExportJobOrThrow(id, tenantId);
    return this.toExportJobResponse(job, tenantId);
  }

  async listExportJobs(
    tenantId: string,
    query: GetExportJobsQueryDto,
  ): Promise<PaginatedResponse<ExportJobResponse>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const orderBy = buildOrderBy(
      query.sortBy,
      query.sortOrder,
      EXPORT_JOB_SORT_CONFIG,
    );
    const where: Prisma.ExportJobWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.exportType ? { exportType: query.exportType } : {}),
    };

    const [jobs, totalItems] = await this.prisma.$transaction([
      this.prisma.exportJob.findMany({
        where,
        orderBy,
        select: exportJobSelect,
        skip,
        take,
      }),
      this.prisma.exportJob.count({ where }),
    ]);

    const items = await Promise.all(
      jobs.map((job) => this.toExportJobResponse(job, tenantId)),
    );

    return buildPaginatedResponse(items, page, limit, totalItems);
  }

  private async runExportJob(
    jobId: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: jobId, tenantId },
      select: {
        id: true,
        format: true,
        filters: true,
        exportType: true,
      },
    });

    if (!job) {
      return;
    }

    this.logger.log(`Export job ${jobId} started`);

    try {
      const exportParams = this.parseExportParams(job.filters);

      const rows = await this.leadExportService.fetchAllForExport(
        tenantId,
        exportParams,
        async (processedRows, totalRows) => {
          const progress =
            totalRows === 0
              ? 50
              : Math.min(70, 10 + Math.floor((processedRows / totalRows) * 60));

          await this.prisma.exportJob.update({
            where: { id: jobId },
            data: { progress },
          });
        },
      );

      this.logger.log(
        `Export job ${jobId}: loaded ${rows.length} lead(s) for CSV generation`,
      );

      const csvBuffer = this.generateExportBuffer(job.format, rows);

      this.logger.log(`Export job ${jobId}: CSV generated`);

      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { progress: 80 },
      });

      const fileName = this.buildExportFileName(jobId, job.format);
      const file = await this.filesService.createServerGeneratedFile({
        tenantId,
        userId,
        category: FileAssetCategory.EXPORT_FILE,
        buffer: csvBuffer,
        fileName,
        mimeType: EXPORT_CSV_MIME_TYPE,
      });

      this.logger.log(
        `Export job ${jobId}: uploaded to S3 and FileAsset ${file.id} created`,
      );

      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          rowCount: rows.length,
          fileAssetId: file.id,
          completedAt: new Date(),
          errorMessage: null,
        },
      });

      await this.auditWriter.createAuditLog({
        tenantId,
        actorType: AuditActorType.SYSTEM,
        actorUserId: null,
        action: EXPORT_AUDIT_ACTIONS.COMPLETED,
        entityType: AUDIT_ENTITY_TYPES.EXPORT_JOB,
        entityId: jobId,
        metadata: {
          rowCount: rows.length,
        },
      });

      this.logger.log(`Export job ${jobId} completed`);
      void this.domainEventBus.publish(
        new ExportCompletedEvent(tenantId, jobId),
      );
      void this.notificationTrigger.notifyExportCompleted({
        tenantId,
        recipientUserId: userId,
        exportJobId: jobId,
        rowCount: rows.length,
        exportType: job.exportType,
      });
    } catch (error: unknown) {
      const message =
        error instanceof BadRequestException
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Export failed';

      this.logger.error(`Export job ${jobId} failed: ${message}`);

      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          errorMessage: message,
          completedAt: new Date(),
        },
      });
    }
  }

  private generateExportBuffer(
    format: ExportFormat,
    rows: Parameters<CsvExportService['generateCsv']>[0],
  ): Buffer {
    if (format === ExportFormat.CSV) {
      return this.csvExportService.generateCsv(rows);
    }

    throw new BadRequestException(
      `Export format ${format} is not supported in Phase 1`,
    );
  }

  private buildExportFileName(jobId: string, format: ExportFormat): string {
    const extension = format.toLowerCase();
    return `leads-export-${jobId}.${extension}`;
  }

  private normalizeExportParams(dto: CreateLeadExportDto): LeadExportParams {
    const filters = this.normalizeFilters(dto.filters);

    return {
      ...filters,
      sortBy: dto.sortBy,
      sortOrder: dto.sortOrder ?? SortOrder.DESC,
    };
  }

  private normalizeFilters(filters?: LeadExportParams): LeadExportParams {
    if (!filters) {
      return {};
    }

    return {
      ...(filters.pipelineId ? { pipelineId: filters.pipelineId } : {}),
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      ...(filters.assignedUserId
        ? { assignedUserId: filters.assignedUserId }
        : {}),
      ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { search: filters.search } : {}),
    };
  }

  private parseExportParams(value: Prisma.JsonValue): LeadExportParams {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { sortOrder: SortOrder.DESC };
    }

    const record = value as Record<string, unknown>;

    return {
      ...this.normalizeFilters({
        pipelineId:
          typeof record.pipelineId === 'string' ? record.pipelineId : undefined,
        stageId:
          typeof record.stageId === 'string' ? record.stageId : undefined,
        assignedUserId:
          typeof record.assignedUserId === 'string'
            ? record.assignedUserId
            : undefined,
        sourceId:
          typeof record.sourceId === 'string' ? record.sourceId : undefined,
        status:
          typeof record.status === 'string'
            ? (record.status as LeadExportParams['status'])
            : undefined,
        search: typeof record.search === 'string' ? record.search : undefined,
      }),
      sortBy: typeof record.sortBy === 'string' ? record.sortBy : undefined,
      sortOrder:
        record.sortOrder === SortOrder.ASC ||
        record.sortOrder === SortOrder.DESC
          ? record.sortOrder
          : SortOrder.DESC,
    };
  }

  private async getExportJobOrThrow(
    id: string,
    tenantId: string,
  ): Promise<ExportJobRecord> {
    const job = await this.prisma.exportJob.findFirst({
      where: { id, tenantId },
      select: exportJobSelect,
    });

    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    return job;
  }

  private async toExportJobResponse(
    job: ExportJobRecord,
    tenantId: string,
  ): Promise<ExportJobResponse> {
    const download =
      job.status === JobStatus.COMPLETED && job.fileAssetId
        ? await this.filesService.getDownloadUrl(job.fileAssetId, tenantId, {
            expiresInSeconds: EXPORT_DOWNLOAD_URL_EXPIRY_SECONDS,
          })
        : null;

    return {
      id: job.id,
      exportType: job.exportType,
      format: job.format,
      status: job.status,
      progress: job.progress,
      rowCount: job.rowCount,
      filters: this.parseExportParams(job.filters),
      errorMessage: job.errorMessage,
      fileAssetId: job.fileAssetId,
      fileAsset: job.fileAsset,
      download: download
        ? {
            downloadUrl: download.downloadUrl,
            expiresInSeconds: download.expiresInSeconds,
          }
        : null,
      createdBy: job.createdBy,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }
}
