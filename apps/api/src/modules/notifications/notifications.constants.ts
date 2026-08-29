import {
  NotificationPreferenceCategory,
  NotificationPriority,
  NotificationType,
} from '@crmpro/database';

export const NOTIFICATION_JOB_NAME = 'deliver-notification';

export const NOTIFICATION_PREFERENCE_CATEGORIES = [
  NotificationPreferenceCategory.LEAD_ASSIGNED,
  NotificationPreferenceCategory.IMPORT_COMPLETED,
  NotificationPreferenceCategory.EXPORT_COMPLETED,
  NotificationPreferenceCategory.PIPELINE_UPDATES,
  NotificationPreferenceCategory.MARKETING,
  NotificationPreferenceCategory.SYSTEM,
  NotificationPreferenceCategory.SECURITY,
  NotificationPreferenceCategory.TASK_UPDATES,
] as const;

export const NOTIFICATION_TYPE_TO_PREFERENCE: Record<
  NotificationType,
  NotificationPreferenceCategory
> = {
  [NotificationType.LEAD_ASSIGNED]:
    NotificationPreferenceCategory.LEAD_ASSIGNED,
  [NotificationType.IMPORT_COMPLETED]:
    NotificationPreferenceCategory.IMPORT_COMPLETED,
  [NotificationType.EXPORT_COMPLETED]:
    NotificationPreferenceCategory.EXPORT_COMPLETED,
  [NotificationType.LEAD_STAGE_CHANGED]:
    NotificationPreferenceCategory.PIPELINE_UPDATES,
  [NotificationType.LEAD_WON]: NotificationPreferenceCategory.PIPELINE_UPDATES,
  [NotificationType.LEAD_LOST]: NotificationPreferenceCategory.PIPELINE_UPDATES,
  [NotificationType.FILE_DELETED]: NotificationPreferenceCategory.SYSTEM,
  [NotificationType.SYSTEM]: NotificationPreferenceCategory.SYSTEM,
  [NotificationType.SECURITY]: NotificationPreferenceCategory.SECURITY,
  [NotificationType.REMINDER]: NotificationPreferenceCategory.MARKETING,
  [NotificationType.TASK_ASSIGNED]: NotificationPreferenceCategory.TASK_UPDATES,
  [NotificationType.TASK_DUE]: NotificationPreferenceCategory.TASK_UPDATES,
  [NotificationType.TASK_OVERDUE]: NotificationPreferenceCategory.TASK_UPDATES,
  [NotificationType.TASK_COMPLETED]:
    NotificationPreferenceCategory.TASK_UPDATES,
  [NotificationType.SUPPORT_REPLY]: NotificationPreferenceCategory.SYSTEM,
};

export const DEFAULT_NOTIFICATION_PRIORITY = NotificationPriority.NORMAL;

export const NOTIFICATION_PREFERENCE_LABELS: Record<
  NotificationPreferenceCategory,
  string
> = {
  [NotificationPreferenceCategory.LEAD_ASSIGNED]: 'Lead Assigned',
  [NotificationPreferenceCategory.IMPORT_COMPLETED]: 'Import Completed',
  [NotificationPreferenceCategory.EXPORT_COMPLETED]: 'Export Completed',
  [NotificationPreferenceCategory.PIPELINE_UPDATES]: 'Pipeline Updates',
  [NotificationPreferenceCategory.MARKETING]: 'Marketing',
  [NotificationPreferenceCategory.SYSTEM]: 'System',
  [NotificationPreferenceCategory.SECURITY]: 'Security',
  [NotificationPreferenceCategory.TASK_UPDATES]: 'Task Updates',
};

export const NOTIFICATION_SORT_FIELDS = ['createdAt', 'priority'] as const;
