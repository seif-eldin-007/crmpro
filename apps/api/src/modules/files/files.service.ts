import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileAssetCategory, Prisma } from '@crmpro/database';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../common/pagination';
import { buildOrderBy, normalizeSearch, SortOrder } from '../../common/query';
import { StorageLoggingService } from '../../common/logging/storage-logging.service';
import { QuotaService } from '../../common/quota/quota.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { LeadAttachmentService } from '../lead-attachments/lead-attachment.service';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import {
  AUDIT_ENTITY_TYPES,
  FILE_AUDIT_ACTIONS,
} from '../audit/audit.constants';
import { AuditWriterService } from '../audit/audit-writer.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { GetFilesQueryDto } from './dto/get-files-query.dto';
import { RequestUploadDto } from './dto/request-upload.dto';
import {
  DOWNLOAD_URL_EXPIRY_SECONDS,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  UPLOAD_INTENT_TTL_SECONDS,
} from './files.constants';
import {
  CompleteUploadResponse,
  DownloadUrlResponse,
  FileAssetListItem,
  RequestUploadResponse,
} from './types/file.types';
import {
  generateExportObjectKey,
  generateUploadObjectKey,
  isObjectKeyForTenant,
} from './utils/file-key.util';

const fileAssetSelect = {
  id: true,
  category: true,
  objectKey: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  leadId: true,
  createdAt: true,
} satisfies Prisma.FileAssetSelect;

const FILE_SORT_FIELDS = [
  'createdAt',
  'originalFilename',
  'sizeBytes',
] as const;

const FILE_SORT_CONFIG = {
  allowedFields: FILE_SORT_FIELDS,
  defaultField: 'createdAt' as const,
  defaultOrder: SortOrder.DESC,
};

const fileListSelect = {
  id: true,
  category: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  leadId: true,
  projectId: true,
  createdAt: true,
  uploadedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  lead: {
    select: {
      id: true,
      fullName: true,
    },
  },
  project: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.FileAssetSelect;

type FileAssetRecord = Prisma.FileAssetGetPayload<{
  select: typeof fileAssetSelect;
}>;

type FileListRecord = Prisma.FileAssetGetPayload<{
  select: typeof fileListSelect;
}>;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotaService: QuotaService,
    private readonly storageService: StorageService,
    private readonly leadAttachmentService: LeadAttachmentService,
    private readonly storageLoggingService: StorageLoggingService,
    private readonly notificationTrigger: NotificationTriggerService,
    private readonly auditWriter: AuditWriterService,
  ) {}

  async listFiles(
    tenantId: string,
    query: GetFilesQueryDto,
  ): Promise<PaginatedResponse<FileAssetListItem>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildListWhereClause(tenantId, query);
    const orderBy = buildOrderBy(
      query.sortBy,
      query.sortOrder,
      FILE_SORT_CONFIG,
    );

    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.fileAsset.findMany({
        where,
        orderBy,
        select: fileListSelect,
        skip,
        take,
      }),
      this.prisma.fileAsset.count({ where }),
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.toFileListItem(row)),
      page,
      limit,
      totalItems,
    );
  }

  async requestUpload(
    tenantId: string,
    userId: string,
    dto: RequestUploadDto,
  ): Promise<RequestUploadResponse> {
    const startedAt = Date.now();

    try {
      if (dto.sizeBytes > MAX_UPLOAD_FILE_SIZE_BYTES) {
        throw new BadRequestException('File exceeds maximum size of 25 MB');
      }

      const objectKey = generateUploadObjectKey(tenantId, dto.fileName);
      const expiresAt = new Date(Date.now() + UPLOAD_INTENT_TTL_SECONDS * 1000);

      await this.prisma.$transaction(async (tx) => {
        await this.quotaService.assertCanUseStorageInTransaction(
          tx,
          tenantId,
          dto.sizeBytes,
        );

        await tx.fileUploadIntent.create({
          data: {
            tenantId,
            userId,
            objectKey,
            originalFilename: dto.fileName.trim(),
            mimeType: dto.contentType,
            sizeBytes: BigInt(dto.sizeBytes),
            expiresAt,
          },
        });
      });

      const signed = await this.storageService.getSignedUploadUrl({
        key: objectKey,
        contentType: dto.contentType,
        expiresInSeconds: UPLOAD_INTENT_TTL_SECONDS,
      });

      this.storageLoggingService.uploadRequested({
        tenantId,
        userId,
        sizeBytes: dto.sizeBytes,
        durationMs: Date.now() - startedAt,
      });

      return {
        uploadUrl: signed.url,
        objectKey: signed.key,
        expiresInSeconds: signed.expiresInSeconds,
      };
    } catch (error) {
      this.storageLoggingService.uploadFailed({
        tenantId,
        userId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async completeUpload(
    tenantId: string,
    userId: string,
    dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponse> {
    const startedAt = Date.now();

    try {
      if (!isObjectKeyForTenant(dto.objectKey, tenantId)) {
        throw new BadRequestException('Invalid object key for tenant');
      }

      const intent = await this.prisma.fileUploadIntent.findFirst({
        where: {
          objectKey: dto.objectKey,
          tenantId,
          userId,
        },
      });

      if (!intent) {
        throw new BadRequestException('Upload intent not found or expired');
      }

      if (intent.expiresAt < new Date()) {
        await this.prisma.fileUploadIntent.delete({ where: { id: intent.id } });
        throw new BadRequestException('Upload intent expired');
      }

      const verified = await this.verifyUploadedObject(
        intent.objectKey,
        intent,
      );

      if (dto.category === FileAssetCategory.LEAD_ATTACHMENT && dto.leadId) {
        await this.leadAttachmentService.validateAttachmentTarget(
          dto.leadId,
          tenantId,
        );
      }

      if (dto.category === FileAssetCategory.LEAD_ATTACHMENT && !dto.leadId) {
        throw new BadRequestException(
          'leadId is required when category is LEAD_ATTACHMENT',
        );
      }

      const leadId =
        dto.category === FileAssetCategory.LEAD_ATTACHMENT
          ? (dto.leadId ?? null)
          : null;

      const file = await this.prisma.$transaction(async (tx) => {
        await this.quotaService.assertCanUseStorageInTransaction(
          tx,
          tenantId,
          verified.sizeBytes,
          { excludeUploadIntentId: intent.id },
        );

        const created = await tx.fileAsset.create({
          data: {
            tenantId,
            uploadedByUserId: userId,
            category: dto.category,
            objectKey: intent.objectKey,
            originalFilename: intent.originalFilename,
            mimeType: intent.mimeType,
            sizeBytes: BigInt(verified.sizeBytes),
            leadId,
          },
          select: fileAssetSelect,
        });

        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            storageUsedBytes: { increment: BigInt(verified.sizeBytes) },
          },
        });

        await tx.fileUploadIntent.delete({ where: { id: intent.id } });

        if (leadId) {
          await this.leadAttachmentService.recordFileAttached(
            {
              tenantId,
              leadId,
              actorUserId: userId,
              fileId: created.id,
              category: dto.category,
            },
            tx,
          );
        }

        return created;
      });

      this.storageLoggingService.uploadCompleted({
        tenantId,
        userId,
        fileId: file.id,
        sizeBytes: Number(file.sizeBytes),
        durationMs: Date.now() - startedAt,
      });

      return this.toCompleteUploadResponse(file);
    } catch (error) {
      this.storageLoggingService.uploadFailed({
        tenantId,
        userId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getDownloadUrl(
    fileId: string,
    tenantId: string,
    options?: { expiresInSeconds?: number },
  ): Promise<DownloadUrlResponse> {
    const startedAt = Date.now();
    const file = await this.getFileOrThrow(fileId, tenantId);

    const signed = await this.storageService.getSignedDownloadUrl({
      objectKey: file.objectKey,
      expiresInSeconds:
        options?.expiresInSeconds ?? DOWNLOAD_URL_EXPIRY_SECONDS,
    });

    this.storageLoggingService.downloadUrlGenerated({
      tenantId,
      fileId,
      durationMs: Date.now() - startedAt,
    });

    return {
      downloadUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
    };
  }

  async createServerGeneratedFile(params: {
    tenantId: string;
    userId: string;
    category: FileAssetCategory;
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }): Promise<{ id: string; objectKey: string; originalFilename: string }> {
    const sizeBytes = params.buffer.byteLength;

    if (sizeBytes <= 0) {
      throw new BadRequestException('File content is empty');
    }

    const objectKey = generateExportObjectKey(params.tenantId, params.fileName);
    const originalFilename = params.fileName.trim();

    await this.storageService.uploadFile({
      key: objectKey,
      buffer: params.buffer,
      contentType: params.mimeType,
    });

    const file = await this.prisma.$transaction(async (tx) => {
      await this.quotaService.assertCanUseStorageInTransaction(
        tx,
        params.tenantId,
        sizeBytes,
      );

      const created = await tx.fileAsset.create({
        data: {
          tenantId: params.tenantId,
          uploadedByUserId: params.userId,
          category: params.category,
          objectKey,
          originalFilename,
          mimeType: params.mimeType,
          sizeBytes: BigInt(sizeBytes),
          leadId: null,
        },
        select: {
          id: true,
          objectKey: true,
          originalFilename: true,
        },
      });

      await tx.tenant.update({
        where: { id: params.tenantId },
        data: {
          storageUsedBytes: { increment: BigInt(sizeBytes) },
        },
      });

      return created;
    });

    return file;
  }

  async deleteFile(
    fileId: string,
    tenantId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const startedAt = Date.now();
    const file = await this.getFileOrThrow(fileId, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.fileAsset.update({
        where: { id: file.id },
        data: { deletedAt: new Date() },
      });

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          storageUsedBytes: { decrement: file.sizeBytes },
        },
      });

      if (file.leadId) {
        await this.leadAttachmentService.recordFileDeleted(
          {
            tenantId,
            leadId: file.leadId,
            actorUserId: userId,
            fileId: file.id,
          },
          tx,
        );
      }
    });

    try {
      await this.storageService.deleteFile(file.objectKey);
    } catch {
      // DB is source of truth; orphaned S3 objects can be garbage-collected later.
    }

    this.storageLoggingService.fileDeleted({
      tenantId,
      userId,
      fileId: file.id,
      durationMs: Date.now() - startedAt,
    });

    await this.auditWriter.createAuditLog({
      tenantId,
      actorUserId: userId,
      action: FILE_AUDIT_ACTIONS.DELETED,
      entityType: AUDIT_ENTITY_TYPES.FILE_ASSET,
      entityId: file.id,
      metadata: {
        category: file.category,
        filename: file.originalFilename,
      },
    });

    if (file.leadId) {
      const assigneeUserId = await this.leadAttachmentService.getLeadAssigneeId(
        file.leadId,
        tenantId,
      );

      if (assigneeUserId && assigneeUserId !== userId) {
        void this.notificationTrigger.notifyFileDeleted({
          tenantId,
          recipientUserId: assigneeUserId,
          fileId: file.id,
          fileName: file.originalFilename,
          actorUserId: userId,
        });
      }
    }

    return { id: file.id };
  }

  private async verifyUploadedObject(
    objectKey: string,
    intent: { sizeBytes: bigint; mimeType: string },
  ): Promise<{ sizeBytes: number }> {
    const object = await this.storageService.headObject(objectKey);

    if (!object) {
      throw new BadRequestException('Upload not completed');
    }

    const declaredSize = Number(intent.sizeBytes);
    const actualSize = object.contentLength;

    if (actualSize <= 0) {
      throw new BadRequestException('Upload not completed');
    }

    if (actualSize > declaredSize) {
      throw new BadRequestException(
        `Uploaded file exceeds declared size (declared ${declaredSize}, uploaded ${actualSize})`,
      );
    }

    if (
      object.contentType &&
      object.contentType.toLowerCase() !== intent.mimeType.toLowerCase()
    ) {
      throw new BadRequestException(
        `Uploaded file content type mismatch (expected ${intent.mimeType}, got ${object.contentType})`,
      );
    }

    return { sizeBytes: actualSize };
  }

  private async getFileOrThrow(
    fileId: string,
    tenantId: string,
  ): Promise<FileAssetRecord & { sizeBytes: bigint }> {
    const file = await this.prisma.fileAsset.findFirst({
      where: { id: fileId, tenantId, deletedAt: null },
      select: fileAssetSelect,
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  private toCompleteUploadResponse(
    file: FileAssetRecord,
  ): CompleteUploadResponse {
    return {
      id: file.id,
      category: file.category,
      objectKey: file.objectKey,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
      leadId: file.leadId,
      createdAt: file.createdAt,
    };
  }

  private buildListWhereClause(
    tenantId: string,
    query: GetFilesQueryDto,
  ): Prisma.FileAssetWhereInput {
    const search = normalizeSearch(query.search);

    return {
      tenantId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(search && {
        originalFilename: {
          contains: search,
          mode: 'insensitive',
        },
      }),
    };
  }

  private toFileListItem(file: FileListRecord): FileAssetListItem {
    return {
      id: file.id,
      category: file.category,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
      leadId: file.leadId,
      projectId: file.projectId,
      createdAt: file.createdAt.toISOString(),
      uploadedBy: {
        id: file.uploadedBy.id,
        fullName: file.uploadedBy.name,
        email: file.uploadedBy.email,
      },
      lead: file.lead,
      project: file.project,
    };
  }
}
