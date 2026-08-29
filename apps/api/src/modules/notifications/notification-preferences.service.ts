import { Injectable } from '@nestjs/common';
import {
  NotificationPreferenceCategory,
  NotificationType,
} from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  NOTIFICATION_PREFERENCE_CATEGORIES,
  NOTIFICATION_TYPE_TO_PREFERENCE,
} from './notifications.constants';
import { NotificationPreferenceResponse } from './entities/notification.types';
import { toNotificationPreferenceResponse } from './mappers/notification.mapper';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(
    tenantId: string,
    userId: string,
  ): Promise<NotificationPreferenceResponse[]> {
    await this.ensureDefaults(tenantId, userId);

    const preferences = await this.prisma.notificationPreference.findMany({
      where: { tenantId, userId },
      orderBy: { category: 'asc' },
    });

    return preferences.map(toNotificationPreferenceResponse);
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    updates: Array<{
      category: NotificationPreferenceCategory;
      enabled: boolean;
    }>,
  ): Promise<NotificationPreferenceResponse[]> {
    await this.ensureDefaults(tenantId, userId);

    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.notificationPreference.update({
          where: {
            userId_category: {
              userId,
              category: update.category,
            },
          },
          data: { enabled: update.enabled },
        }),
      ),
    );

    return this.getPreferences(tenantId, userId);
  }

  async isEnabled(
    tenantId: string,
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const category = NOTIFICATION_TYPE_TO_PREFERENCE[type];
    const preference = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_category: {
          userId,
          category,
        },
      },
      select: { enabled: true, tenantId: true },
    });

    if (!preference) {
      await this.ensureDefaults(tenantId, userId);
      return true;
    }

    return preference.tenantId === tenantId && preference.enabled;
  }

  private async ensureDefaults(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const existingCount = await this.prisma.notificationPreference.count({
      where: { userId },
    });

    if (existingCount >= NOTIFICATION_PREFERENCE_CATEGORIES.length) {
      return;
    }

    await this.prisma.notificationPreference.createMany({
      data: NOTIFICATION_PREFERENCE_CATEGORIES.map((category) => ({
        tenantId,
        userId,
        category,
        enabled: true,
      })),
      skipDuplicates: true,
    });
  }
}
