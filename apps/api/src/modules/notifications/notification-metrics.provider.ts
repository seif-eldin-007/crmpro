import { Injectable } from '@nestjs/common';
import {
  NotificationMetricsProvider as INotificationMetricsProvider,
  NotificationMetricsSnapshot,
} from '../../common/health';
import { NotificationMetricsStore } from './metrics/notification-metrics.store';

@Injectable()
export class NotificationMetricsProvider implements INotificationMetricsProvider {
  constructor(
    private readonly notificationMetricsStore: NotificationMetricsStore,
  ) {}

  getSnapshot(): NotificationMetricsSnapshot {
    return this.notificationMetricsStore.getSnapshot();
  }
}
