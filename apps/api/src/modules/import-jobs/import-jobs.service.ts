import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FileAssetCategory,
  ImportJob,
  JobStatus,
  Prisma,
  AuditActorType,
} from '@crmpro/database';
import { parse } from 'csv-parse/sync';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TenantInactiveException,
  TenantStatusService,
} from '../../common/tenant/tenant-status.service';
import { StorageService } from '../../common/storage/storage.service';
import { LeadsService } from '../leads/leads.service';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import { ImportCompletedEvent } from '../../common/events/domain-event.types';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { QueueService } from '../jobs/queues/queue.service';
import {
  AUDIT_ENTITY_TYPES,
  IMPORT_AUDIT_ACTIONS,
} from '../audit/audit.constants';
import { AuditWriterService } from '../audit/audit-writer.service';
import { CreateLeadImportJobDto } from './dto/create-lead-import-job.dto';
import { GetImportJobsQueryDto } from './dto/get-import-jobs-query.dto';
import {
  MAX_ERROR_SUMMARY_ENTRIES,
  PROGRESS_UPDATE_BATCH_SIZE,
  REQUIRED_CSV_HEADERS,
} from './import-jobs.constants';
import {
  ImportJobErrorEntry,
  ImportJobResponse,
  LeadCsvRow,
  ParsedLeadCsvRow,
} from './types/import-job.types';

const importJobSelect = {
  id: true,
  status: true,
  totalRows: true,
  processedRows: true,
  successfulRows: true,
  failedRows: true,
  errorSummary: true,
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
} satisfies Prisma.ImportJobSelect;

type ImportJobRecord = Prisma.ImportJobGetPayload<{
  select: typeof importJobSelect;
}>;

type ValidatedImportFile = {
  id: string;
  objectKey: string;
  mimeType: string;
};

@Injectable()
export class ImportJobsService {
  private readonly logger = new Logger(ImportJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly leadsService: LeadsService,
    private readonly queueService: QueueService,
    private readonly domainEventBus: DomainEventBus,
    private readonly notificationTrigger: NotificationTriggerService,
    private readonly tenantStatusService: TenantStatusService,
    private readonly auditWriter: AuditWriterService,
  ) {}

  async createLeadImportJob(
    tenantId: string,
    userId: string,
    dto: CreateLeadImportJobDto,
  ): Promise<ImportJobResponse> {
    const file = await this.validateImportFile(dto.fileAssetId, tenantId);

    const job = await this.prisma.importJob.create({
      data: {
        tenantId,
        createdByUserId: userId,
        fileAssetId: file.id,
        status: JobStatus.PENDING,
      },
      select: importJobSelect,
    });

    await this.queueService.enqueueImportJob(job.id);

    await this.auditWriter.createAuditLog({
      tenantId,
      actorUserId: userId,
      action: IMPORT_AUDIT_ACTIONS.STARTED,
      entityType: AUDIT_ENTITY_TYPES.IMPORT_JOB,
      entityId: job.id,
    });

    return this.toImportJobResponse(job);
  }

  async processImportJob(jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        tenantId: true,
        createdByUserId: true,
        fileAssetId: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }

    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.FAILED ||
      job.status === JobStatus.PARTIAL_SUCCESS
    ) {
      return;
    }

    try {
      await this.tenantStatusService.assertTenantActive(job.tenantId);
    } catch (error) {
      if (error instanceof TenantInactiveException) {
        await this.failImportJobIfActive(job.id, error.message);
        return;
      }

      throw error;
    }

    const claimed = await this.claimImportJob(job.id);
    if (!claimed) {
      this.logger.log(
        `Import job ${jobId} was not claimed (already processing or completed)`,
      );
      return;
    }

    const file = await this.validateImportFile(job.fileAssetId, job.tenantId);
    await this.processLeadImportJob(
      job.id,
      job.tenantId,
      job.createdByUserId,
      file,
    );
  }

  async failImportJobIfActive(
    jobId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.importJob.updateMany({
      where: {
        id: jobId,
        status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
      },
      data: {
        status: JobStatus.FAILED,
        completedAt: new Date(),
        errorSummary: [{ row: 0, reason: errorMessage }],
      },
    });
  }

  async getImportJob(id: string, tenantId: string): Promise<ImportJobResponse> {
    const job = await this.getImportJobOrThrow(id, tenantId);
    return this.toImportJobResponse(job);
  }

  async listImportJobs(
    tenantId: string,
    query: GetImportJobsQueryDto,
  ): Promise<PaginatedResponse<ImportJobResponse>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = { tenantId };

    const [jobs, totalItems] = await this.prisma.$transaction([
      this.prisma.importJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: importJobSelect,
        skip,
        take,
      }),
      this.prisma.importJob.count({ where }),
    ]);

    return buildPaginatedResponse(
      jobs.map((job) => this.toImportJobResponse(job)),
      page,
      limit,
      totalItems,
    );
  }

  private async claimImportJob(jobId: string): Promise<boolean> {
    const result = await this.prisma.importJob.updateMany({
      where: {
        id: jobId,
        status: JobStatus.PENDING,
      },
      data: { status: JobStatus.PROCESSING },
    });

    return result.count === 1;
  }

  private async processLeadImportJob(
    jobId: string,
    tenantId: string,
    userId: string,
    file: ValidatedImportFile,
  ): Promise<void> {
    const errors: ImportJobErrorEntry[] = [];
    let successfulRows = 0;
    let failedRows = 0;
    let totalRows = 0;

    try {
      const csvBuffer = await this.downloadCsv(file.objectKey);
      const rows = this.parseCsv(csvBuffer);
      totalRows = rows.length;

      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { totalRows },
      });

      const pipeline =
        await this.leadsService.getDefaultPipelinePlacement(tenantId);

      let processedRows = 0;

      for (const row of rows) {
        const result = await this.processRow(
          tenantId,
          userId,
          jobId,
          row,
          pipeline,
          errors,
        );

        if (result === 'success') {
          successfulRows += 1;
        } else {
          failedRows += 1;
        }

        processedRows += 1;

        const isLastRow = processedRows === totalRows;

        if (processedRows % PROGRESS_UPDATE_BATCH_SIZE === 0 || isLastRow) {
          await this.persistProgress(jobId, {
            processedRows,
            successfulRows,
            failedRows,
            errors,
          });
        }
      }

      await this.finalizeJob(jobId, tenantId, userId, {
        totalRows,
        successfulRows,
        failedRows,
        errors,
      });
    } catch (error: unknown) {
      const reason =
        error instanceof BadRequestException
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Import failed';

      if (errors.length < MAX_ERROR_SUMMARY_ENTRIES) {
        errors.push({ row: 0, reason });
      }

      await this.finalizeJob(jobId, tenantId, userId, {
        totalRows,
        successfulRows,
        failedRows,
        errors,
        catastrophic: true,
      });
    }
  }

  private async validateImportFile(
    fileAssetId: string,
    tenantId: string,
  ): Promise<ValidatedImportFile> {
    const file = await this.prisma.fileAsset.findFirst({
      where: {
        id: fileAssetId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        category: true,
        objectKey: true,
        mimeType: true,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.category !== FileAssetCategory.IMPORT_FILE) {
      throw new BadRequestException(
        'File must have category IMPORT_FILE for lead import',
      );
    }

    return file;
  }

  private async downloadCsv(objectKey: string): Promise<Buffer> {
    return this.storageService.getObject(objectKey);
  }

  private parseCsv(buffer: Buffer): ParsedLeadCsvRow[] {
    const content = buffer.toString('utf-8');

    if (content.trim().length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    let headersValidated = false;

    const rows = parse(content, {
      columns: (headers: string[]) => {
        this.validateHeaders(headers.map((header) => header.trim()));
        headersValidated = true;
        return headers.map((header) => header.trim());
      },
      trim: true,
      bom: true,
      on_record: (record, context) => {
        const row = record as LeadCsvRow;

        if (this.isBlankRow(row)) {
          return null;
        }

        return { ...row, __line: context.lines };
      },
    }) as ParsedLeadCsvRow[];

    if (!headersValidated) {
      throw new BadRequestException('CSV file is missing a header row');
    }

    return rows;
  }

  private validateHeaders(headers: string[]): void {
    if (headers.length === 0) {
      throw new BadRequestException('CSV file is missing a header row');
    }

    const normalized = headers.map((header) => header.trim());
    const unique = new Set(normalized);

    if (unique.size !== normalized.length) {
      throw new BadRequestException('CSV headers must be unique');
    }

    for (const required of REQUIRED_CSV_HEADERS) {
      if (!unique.has(required)) {
        throw new BadRequestException(
          `CSV is missing required header: ${required}`,
        );
      }
    }
  }

  private async persistProgress(
    jobId: string,
    params: {
      processedRows: number;
      successfulRows: number;
      failedRows: number;
      errors: ImportJobErrorEntry[];
    },
  ): Promise<void> {
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        processedRows: params.processedRows,
        successfulRows: params.successfulRows,
        failedRows: params.failedRows,
        ...(params.errors.length > 0
          ? {
              errorSummary: params.errors as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
  }

  private isBlankRow(row: LeadCsvRow): boolean {
    return Object.values(row).every(
      (value) => typeof value !== 'string' || value.trim().length === 0,
    );
  }

  private async processRow(
    tenantId: string,
    userId: string,
    importJobId: string,
    row: ParsedLeadCsvRow,
    pipeline: { pipelineId: string; pipelineStageId: string },
    errors: ImportJobErrorEntry[],
  ): Promise<'success' | 'failure'> {
    const fullName = row.fullName?.trim() ?? '';
    const primaryPhone = row.primaryPhone?.trim() ?? '';

    if (fullName.length === 0) {
      this.pushError(errors, row.__line, 'Missing fullName');
      return 'failure';
    }

    if (primaryPhone.length === 0) {
      this.pushError(errors, row.__line, 'Missing primaryPhone');
      return 'failure';
    }

    const sourceId = await this.resolveSourceId(
      tenantId,
      row.sourceName?.trim(),
    );
    const assignedUserId = await this.resolveAssigneeId(
      tenantId,
      row.assignedUserEmail?.trim(),
    );

    const result = await this.leadsService.createLeadFromImport(
      tenantId,
      userId,
      importJobId,
      {
        fullName,
        primaryPhone,
        secondaryPhone: row.secondaryPhone?.trim() || null,
        email: row.email?.trim() || null,
        sourceId,
        assignedUserId,
      },
      pipeline,
    );

    if (!result.success) {
      this.pushError(errors, row.__line, result.reason);
      return 'failure';
    }

    return 'success';
  }

  private async resolveSourceId(
    tenantId: string,
    sourceName?: string,
  ): Promise<string | null> {
    if (!sourceName) {
      return null;
    }

    const source = await this.prisma.leadSource.findFirst({
      where: {
        tenantId,
        name: { equals: sourceName, mode: 'insensitive' },
      },
      select: { id: true },
    });

    return source?.id ?? null;
  }

  private async resolveAssigneeId(
    tenantId: string,
    assignedUserEmail?: string,
  ): Promise<string | null> {
    if (!assignedUserEmail) {
      return null;
    }

    const email = assignedUserEmail.trim().toLowerCase();

    if (email.length === 0) {
      return null;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        email,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    return user?.id ?? null;
  }

  private pushError(
    errors: ImportJobErrorEntry[],
    row: number,
    reason: string,
  ): void {
    if (errors.length >= MAX_ERROR_SUMMARY_ENTRIES) {
      return;
    }

    errors.push({ row, reason });
  }

  private async finalizeJob(
    jobId: string,
    tenantId: string,
    createdByUserId: string,
    params: {
      totalRows: number;
      successfulRows: number;
      failedRows: number;
      errors: ImportJobErrorEntry[];
      catastrophic?: boolean;
    },
  ): Promise<void> {
    const status = this.resolveFinalStatus(params);

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status,
        totalRows: params.totalRows,
        processedRows: params.successfulRows + params.failedRows,
        successfulRows: params.successfulRows,
        failedRows: params.failedRows,
        errorSummary:
          params.errors.length > 0
            ? (params.errors as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        completedAt: new Date(),
      },
    });

    await this.auditWriter.createAuditLog({
      tenantId,
      actorType: AuditActorType.SYSTEM,
      actorUserId: null,
      action: IMPORT_AUDIT_ACTIONS.COMPLETED,
      entityType: AUDIT_ENTITY_TYPES.IMPORT_JOB,
      entityId: jobId,
      metadata: {
        totalRows: params.totalRows,
        successfulRows: params.successfulRows,
        failedRows: params.failedRows,
        status,
      },
    });

    void this.domainEventBus.publish(new ImportCompletedEvent(tenantId, jobId));

    if (
      status === JobStatus.COMPLETED ||
      status === JobStatus.PARTIAL_SUCCESS
    ) {
      void this.notificationTrigger.notifyImportCompleted({
        tenantId,
        recipientUserId: createdByUserId,
        importJobId: jobId,
        successfulRows: params.successfulRows,
        failedRows: params.failedRows,
      });
    }
  }

  private resolveFinalStatus(params: {
    totalRows: number;
    successfulRows: number;
    failedRows: number;
    catastrophic?: boolean;
  }): JobStatus {
    if (params.catastrophic) {
      return JobStatus.FAILED;
    }

    if (params.failedRows === 0) {
      return JobStatus.COMPLETED;
    }

    if (params.successfulRows === 0) {
      return JobStatus.FAILED;
    }

    return JobStatus.PARTIAL_SUCCESS;
  }

  private async getImportJobOrThrow(
    id: string,
    tenantId: string,
  ): Promise<ImportJobRecord> {
    const job = await this.prisma.importJob.findFirst({
      where: { id, tenantId },
      select: importJobSelect,
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    return job;
  }

  private toImportJobResponse(job: ImportJobRecord): ImportJobResponse {
    return {
      id: job.id,
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successfulRows: job.successfulRows,
      failedRows: job.failedRows,
      errorSummary: this.parseErrorSummary(job.errorSummary),
      fileAsset: job.fileAsset,
      createdBy: job.createdBy,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }

  private parseErrorSummary(
    value: ImportJob['errorSummary'],
  ): ImportJobErrorEntry[] | null {
    if (!value || !Array.isArray(value)) {
      return null;
    }

    return value as unknown as ImportJobErrorEntry[];
  }
}
