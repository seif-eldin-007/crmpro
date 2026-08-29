import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GetAuditQueryDto } from './dto/get-audit-query.dto';
import type { AuditLogResponse } from './types/audit.types';
import {
  parseAuditDate,
  parseAuditDateEnd,
  toAuditLogResponse,
} from './utils/audit.mapper';

const auditLogSelect = {
  id: true,
  actorType: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  actor: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.AuditLogSelect;

type AuditLogRecord = Prisma.AuditLogGetPayload<{
  select: typeof auditLogSelect;
}>;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(
    tenantId: string,
    query: GetAuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogResponse>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = this.buildWhereClause(tenantId, query);

    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: auditLogSelect,
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const labels = await this.resolveEntityLabels(tenantId, rows);

    return buildPaginatedResponse(
      rows.map((row) =>
        toAuditLogResponse(
          row,
          row.entityId
            ? (labels.get(`${row.entityType}:${row.entityId}`) ?? null)
            : null,
        ),
      ),
      page,
      limit,
      totalItems,
    );
  }

  async getAuditLog(tenantId: string, id: string): Promise<AuditLogResponse> {
    const row = await this.prisma.auditLog.findFirst({
      where: { id, tenantId },
      select: auditLogSelect,
    });

    if (!row) {
      throw new NotFoundException('Audit log not found');
    }

    const labels = await this.resolveEntityLabels(tenantId, [row]);
    const entityLabel = row.entityId
      ? (labels.get(`${row.entityType}:${row.entityId}`) ?? null)
      : null;

    return toAuditLogResponse(row, entityLabel);
  }

  private buildWhereClause(
    tenantId: string,
    query: GetAuditQueryDto,
  ): Prisma.AuditLogWhereInput {
    const from = query.from ? parseAuditDate(query.from, 'from') : undefined;
    const to = query.to ? parseAuditDateEnd(query.to, 'to') : undefined;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'Invalid date range: from must be before or equal to to',
      );
    }

    return {
      tenantId,
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
  }

  private async resolveEntityLabels(
    tenantId: string,
    rows: AuditLogRecord[],
  ): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    const idsByType = new Map<string, Set<string>>();

    for (const row of rows) {
      if (!row.entityId) continue;
      const set = idsByType.get(row.entityType) ?? new Set<string>();
      set.add(row.entityId);
      idsByType.set(row.entityType, set);
    }

    const lookups: Array<Promise<void>> = [];

    const userIds = [...(idsByType.get('User') ?? [])];
    if (userIds.length > 0) {
      lookups.push(
        this.prisma.user
          .findMany({
            where: { tenantId, id: { in: userIds } },
            select: { id: true, name: true },
          })
          .then((items) => {
            for (const item of items) {
              labels.set(`User:${item.id}`, item.name);
            }
          }),
      );
    }

    const roleIds = [...(idsByType.get('Role') ?? [])];
    if (roleIds.length > 0) {
      lookups.push(
        this.prisma.role
          .findMany({
            where: { tenantId, id: { in: roleIds } },
            select: { id: true, name: true },
          })
          .then((items) => {
            for (const item of items) {
              labels.set(`Role:${item.id}`, item.name);
            }
          }),
      );
    }

    const leadIds = [...(idsByType.get('Lead') ?? [])];
    if (leadIds.length > 0) {
      lookups.push(
        this.prisma.lead
          .findMany({
            where: { tenantId, id: { in: leadIds } },
            select: { id: true, fullName: true },
          })
          .then((items) => {
            for (const item of items) {
              labels.set(`Lead:${item.id}`, item.fullName);
            }
          }),
      );
    }

    const projectIds = [...(idsByType.get('Project') ?? [])];
    if (projectIds.length > 0) {
      lookups.push(
        this.prisma.project
          .findMany({
            where: { tenantId, id: { in: projectIds } },
            select: { id: true, name: true },
          })
          .then((items) => {
            for (const item of items) {
              labels.set(`Project:${item.id}`, item.name);
            }
          }),
      );
    }

    const fileIds = [...(idsByType.get('FileAsset') ?? [])];
    if (fileIds.length > 0) {
      lookups.push(
        this.prisma.fileAsset
          .findMany({
            where: { tenantId, id: { in: fileIds } },
            select: { id: true, originalFilename: true },
          })
          .then((items) => {
            for (const item of items) {
              labels.set(`FileAsset:${item.id}`, item.originalFilename);
            }
          }),
      );
    }

    await Promise.all(lookups);

    // Prefer explicit metadata labels when present (e.g. filename after delete).
    for (const row of rows) {
      if (!row.entityId) continue;
      const key = `${row.entityType}:${row.entityId}`;
      if (labels.has(key)) continue;

      const metadata =
        row.metadata &&
        typeof row.metadata === 'object' &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;

      const fromMeta =
        (typeof metadata?.name === 'string' && metadata.name) ||
        (typeof metadata?.filename === 'string' && metadata.filename) ||
        (typeof metadata?.fullName === 'string' && metadata.fullName) ||
        null;

      if (fromMeta) {
        labels.set(key, fromMeta);
      }
    }

    return labels;
  }
}
