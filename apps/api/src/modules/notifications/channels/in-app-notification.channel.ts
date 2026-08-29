import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DomainEventBus } from '../../../common/events/domain-event-bus.service';
import {
  IN_APP_NOTIFICATION_CHANNEL,
  NotificationDeliveryChannel,
} from '../entities/notification-delivery.types';
import { NotificationDeliveryContext } from '../entities/notification.types';

@Injectable()
export class InAppNotificationChannel implements NotificationDeliveryChannel {
  readonly channelId = IN_APP_NOTIFICATION_CHANNEL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
  ) {}

  async deliver(context: NotificationDeliveryContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const notificationId = await this.createNotificationIfAbsent(tx, context);

      if (!notificationId) {
        return;
      }

      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorType: context.createdByUserId
            ? AuditActorType.USER
            : AuditActorType.SYSTEM,
          actorUserId: context.createdByUserId ?? null,
          entityType: 'Notification',
          entityId: notificationId,
          action: 'NOTIFICATION_CREATED',
          metadata: {
            type: context.type,
            recipientUserId: context.recipientUserId,
            channel: this.channelId,
            dedupeKey: context.dedupeKey ?? null,
          } satisfies Prisma.InputJsonValue,
        },
      });
    });
  }

  private async createNotificationIfAbsent(
    tx: Prisma.TransactionClient,
    context: NotificationDeliveryContext,
  ): Promise<string | null> {
    const data = {
      tenantId: context.tenantId,
      recipientUserId: context.recipientUserId,
      type: context.type,
      title: context.title,
      message: context.message,
      metadata: context.metadata,
      priority: context.priority,
      createdByUserId: context.createdByUserId ?? null,
      expiresAt: context.expiresAt ?? null,
      dedupeKey: context.dedupeKey ?? null,
    };

    if (!context.dedupeKey) {
      const notification = await tx.notification.create({
        data,
        select: { id: true },
      });

      return notification.id;
    }

    const created = await tx.notification.createMany({
      data: [data],
      skipDuplicates: true,
    });

    if (created.count === 0) {
      return null;
    }

    const notification = await tx.notification.findFirst({
      where: {
        tenantId: context.tenantId,
        dedupeKey: context.dedupeKey,
      },
      select: { id: true },
    });

    return notification?.id ?? null;
  }
}
