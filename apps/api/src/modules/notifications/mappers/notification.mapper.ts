import {
  Notification,
  NotificationPreference,
  NotificationPriority,
  NotificationStatus,
  Prisma,
} from '@crmpro/database';
import { NOTIFICATION_PREFERENCE_LABELS } from '../notifications.constants';
import {
  NotificationPreferenceResponse,
  NotificationResponse,
} from '../entities/notification.types';

export const notificationSelect = {
  id: true,
  tenantId: true,
  recipientUserId: true,
  type: true,
  title: true,
  message: true,
  metadata: true,
  priority: true,
  status: true,
  readAt: true,
  createdAt: true,
  expiresAt: true,
  createdByUserId: true,
} satisfies Prisma.NotificationSelect;

export type NotificationRecord = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

export function toNotificationResponse(
  notification: NotificationRecord,
): NotificationResponse {
  return {
    id: notification.id,
    tenantId: notification.tenantId,
    recipientUserId: notification.recipientUserId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    metadata: normalizeMetadata(notification.metadata),
    priority: notification.priority,
    status: notification.status,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    expiresAt: notification.expiresAt?.toISOString() ?? null,
    createdByUserId: notification.createdByUserId,
  };
}

export function toNotificationPreferenceResponse(
  preference: NotificationPreference,
): NotificationPreferenceResponse {
  return {
    category: preference.category,
    label: NOTIFICATION_PREFERENCE_LABELS[preference.category],
    enabled: preference.enabled,
  };
}

export function normalizeMetadata(
  metadata: Notification['metadata'],
): Record<string, unknown> {
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    !Array.isArray(metadata)
  ) {
    return metadata;
  }

  return {};
}

export function resolvePriority(
  priority?: NotificationPriority,
): NotificationPriority {
  return priority ?? NotificationPriority.NORMAL;
}

export function isUnread(status: NotificationStatus): boolean {
  return status === NotificationStatus.UNREAD;
}
