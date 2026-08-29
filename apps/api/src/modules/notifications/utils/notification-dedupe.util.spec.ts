import { NotificationType } from '@crmpro/database';
import {
  buildNotificationDedupeKey,
  toNotificationJobId,
} from './notification-dedupe.util';

describe('notification dedupe helpers', () => {
  it('builds a stable dedupe key from entity, type, and recipient', () => {
    expect(
      buildNotificationDedupeKey({
        entityType: 'import',
        entityId: 'job-1',
        type: NotificationType.IMPORT_COMPLETED,
        recipientUserId: 'user-1',
      }),
    ).toBe('import:job-1:IMPORT_COMPLETED:user-1');
  });

  it('supports suffixes for repeated entity events', () => {
    expect(
      buildNotificationDedupeKey({
        entityType: 'lead',
        entityId: 'lead-1',
        type: NotificationType.LEAD_STAGE_CHANGED,
        recipientUserId: 'user-1',
        suffix: 'Qualified',
      }),
    ).toBe('lead:lead-1:LEAD_STAGE_CHANGED:user-1:Qualified');
  });

  it('builds a bull-safe job id from tenant and dedupe key', () => {
    expect(
      toNotificationJobId('tenant-1', 'import:job-1:IMPORT_COMPLETED:user-1'),
    ).toBe('notification-tenant-1-import-job-1-IMPORT_COMPLETED-user-1');
  });
});
