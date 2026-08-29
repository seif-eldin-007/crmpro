import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@crmpro/database';
import { CacheService } from '../../common/cache/cache.service';
import { LoggingService } from '../../common/logging/logging.service';
import { InAppNotificationChannel } from './channels/in-app-notification.channel';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationMetricsStore } from './metrics/notification-metrics.store';
import { NotificationTemplateService } from './notification-template.service';
import { TenantStatusService } from '../../common/tenant/tenant-status.service';

describe('NotificationDeliveryService', () => {
  let service: NotificationDeliveryService;
  let inAppChannel: { deliver: jest.Mock };
  let cacheService: { invalidateNotificationUnreadCount: jest.Mock };

  beforeEach(async () => {
    inAppChannel = {
      deliver: jest.fn().mockResolvedValue(undefined),
    };
    cacheService = {
      invalidateNotificationUnreadCount: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryService,
        NotificationTemplateService,
        { provide: InAppNotificationChannel, useValue: inAppChannel },
        {
          provide: LoggingService,
          useValue: { info: jest.fn(), error: jest.fn() },
        },
        NotificationMetricsStore,
        { provide: CacheService, useValue: cacheService },
        {
          provide: TenantStatusService,
          useValue: { isTenantActive: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get(NotificationDeliveryService);
  });

  it('delivers through in-app channel and invalidates unread cache', async () => {
    await service.deliver({
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      type: NotificationType.LEAD_ASSIGNED,
      metadata: { leadName: 'Ahmed' },
    });

    expect(inAppChannel.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Lead Assigned',
        recipientUserId: 'user-a',
      }),
    );
    expect(cacheService.invalidateNotificationUnreadCount).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
    );
  });
});
