import { BadRequestException } from '@nestjs/common';
import type { AuditActorType, Prisma } from '@crmpro/database';
import type { AuditLogResponse } from '../types/audit.types';

type AuditLogRecord = {
  id: string;
  actorType: AuditActorType;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export function toAuditLogResponse(
  record: AuditLogRecord,
  entityLabel: string | null = null,
): AuditLogResponse {
  return {
    id: record.id,
    actorType: record.actorType,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    entityLabel,
    metadata: normalizeMetadata(record.metadata),
    createdAt: record.createdAt.toISOString(),
    actor: record.actor
      ? {
          id: record.actor.id,
          fullName: record.actor.name,
          email: record.actor.email,
        }
      : null,
  };
}

function normalizeMetadata(
  metadata: Prisma.JsonValue,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) {
    return null;
  }

  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata;
  }

  return null;
}

export function parseAuditDate(value: string, field: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${field} date`);
  }

  return parsed;
}

export function parseAuditDateEnd(value: string, field: string): Date {
  const parsed = parseAuditDate(value, field);
  parsed.setUTCHours(23, 59, 59, 999);
  return parsed;
}
