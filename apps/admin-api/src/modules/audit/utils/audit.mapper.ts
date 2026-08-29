import type { Prisma } from '@crmpro/database';
import type { AdminAuditLogResponse } from '../types/audit.types';
import type { AdminSecurityEventResponse } from '../types/security-event.types';

type AdminAuditLogRecord = {
  id: string;
  actorType: AdminAuditLogResponse['actorType'];
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  actorAdmin: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

type AdminSecurityEventRecord = {
  id: string;
  eventType: AdminSecurityEventResponse['eventType'];
  severity: AdminSecurityEventResponse['severity'];
  ipAddress: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  admin: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

export function toAdminAuditLogResponse(
  record: AdminAuditLogRecord,
): AdminAuditLogResponse {
  return {
    id: record.id,
    actorType: record.actorType,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    fingerprint: record.fingerprint,
    metadata: normalizeMetadata(record.metadata),
    createdAt: record.createdAt.toISOString(),
    actor: record.actorAdmin
      ? {
          id: record.actorAdmin.id,
          fullName: record.actorAdmin.fullName,
          email: record.actorAdmin.email,
        }
      : null,
  };
}

export function toAdminSecurityEventResponse(
  record: AdminSecurityEventRecord,
): AdminSecurityEventResponse {
  return {
    id: record.id,
    eventType: record.eventType,
    severity: record.severity,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    fingerprint: record.fingerprint,
    metadata: normalizeMetadata(record.metadata),
    createdAt: record.createdAt.toISOString(),
    admin: record.admin
      ? {
          id: record.admin.id,
          fullName: record.admin.fullName,
          email: record.admin.email,
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
