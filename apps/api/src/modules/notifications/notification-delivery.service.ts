import { Injectable } from '@nestjs/common';
import { Notification } from '@crmpro/database';
import { LoggingService } from '../../common/logging/logging.service';
import { InAppNotificationChannel } from './channels/in-app-notification.channel';
import { NotificationDeliveryChannel } from './entities/notification-delivery.types';
import {
  NotificationDeliveryContext,
  NotificationJobPayload,
} from './entities/notification.types';
import { NotificationMetricsStore } from './metrics/notification-metrics.store';
import { NotificationTemplateService } from './notification-template.service';
import {
  normalizeMetadata,
  resolvePriority,
} from './mappers/notification.mapper';
import { CacheService } from '../../common/cache/cache.service';
import { TenantStatusService } from '../../common/tenant/tenant-status.service';

@Injectable()
export class NotificationDeliveryService {
  private readonly channels: NotificationDeliveryChannel[];

  constructor(
    private readonly templateService: NotificationTemplateService,
    private readonly inAppChannel: InAppNotificationChannel,
    private readonly loggingService: LoggingService,
    private readonly metricsStore: NotificationMetricsStore,
    private readonly cacheService: CacheService,
    private readonly tenantStatusService: TenantStatusService,
  ) {
    this.channels = [this.inAppChannel];
  }

  async deliver(payload: NotificationJobPayload): Promise<void> {
    const tenantActive = await this.tenantStatusService.isTenantActive(
      payload.tenantId,
    );

    if (!tenantActive) {
      this.loggingService.info({
        module: 'Notifications',
        operation: 'deliver',
        status: 'skipped',
        metadata: {
          reason: 'Tenant is inactive.',
          type: payload.type,
          recipientUserId: payload.recipientUserId,
          tenantId: payload.tenantId,
        },
      });
      return;
    }

    const startedAt = Date.now();
    const metadata = normalizeMetadata(
      payload.metadata as Notification['metadata'],
    );
    const template = this.templateService.buildTemplate({
      type: payload.type,
      metadata,
    });

    const context: NotificationDeliveryContext = {
      tenantId: payload.tenantId,
      recipientUserId: payload.recipientUserId,
      type: payload.type,
      title: template.title,
      message: template.message,
      metadata: payload.metadata,
      priority: resolvePriority(payload.priority ?? template.priority),
      createdByUserId: payload.createdByUserId ?? null,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      dedupeKey: payload.dedupeKey ?? null,
    };

    try {
      for (const channel of this.channels) {
        await channel.deliver(context);
      }

      await this.cacheService.invalidateNotificationUnreadCount(
        payload.tenantId,
        payload.recipientUserId,
      );

      this.metricsStore.recordDelivered(Date.now() - startedAt);

      this.loggingService.info({
        module: 'Notifications',
        operation: 'deliver',
        status: 'delivered',
        durationMs: Date.now() - startedAt,
        metadata: {
          type: payload.type,
          recipientUserId: payload.recipientUserId,
          tenantId: payload.tenantId,
        },
      });
    } catch (error: unknown) {
      this.metricsStore.recordFailure();

      this.loggingService.error({
        module: 'Notifications',
        operation: 'deliver',
        status: 'failed',
        metadata: {
          type: payload.type,
          recipientUserId: payload.recipientUserId,
          tenantId: payload.tenantId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }
}
