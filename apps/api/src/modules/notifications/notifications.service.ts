import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationStatus, Prisma } from '@crmpro/database';
import {
  buildPaginatedResponse,
  getPaginationParams,
  PaginatedResponse,
} from '../../common/pagination';
import { buildOrderBy, normalizeSearch, SortOrder } from '../../common/query';
import { CacheService } from '../../common/cache/cache.service';
import { LoggingService } from '../../common/logging/logging.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';
import { NOTIFICATION_SORT_FIELDS } from './notifications.constants';
import { NotificationResponse } from './entities/notification.types';
import {
  notificationSelect,
  toNotificationResponse,
} from './mappers/notification.mapper';

const NOTIFICATION_SORT_CONFIG = {
  allowedFields: NOTIFICATION_SORT_FIELDS,
  defaultField: 'createdAt' as const,
  defaultOrder: SortOrder.DESC,
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly loggingService: LoggingService,
  ) {}

  async listNotifications(
    tenantId: string,
    userId: string,
    query: GetNotificationsQueryDto,
  ): Promise<PaginatedResponse<NotificationResponse>> {
    const { page, limit, skip } = getPaginationParams(query);
    const where = this.buildWhereClause(tenantId, userId, query);

    const [items, totalItems] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: notificationSelect,
        orderBy: buildOrderBy(
          query.sortBy,
          query.sortOrder,
          NOTIFICATION_SORT_CONFIG,
        ),
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return buildPaginatedResponse(
      items.map(toNotificationResponse),
      page,
      limit,
      totalItems,
    );
  }

  async getNotification(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<NotificationResponse> {
    const notification = await this.findOwnedNotificationOrThrow(
      tenantId,
      userId,
      id,
    );

    return toNotificationResponse(notification);
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const cacheKey = this.cacheService.buildNotificationUnreadKey(
      tenantId,
      userId,
    );
    const cached = await this.cacheService.get<{ count: number }>(cacheKey);

    if (cached !== null) {
      return cached.count;
    }

    const count = await this.prisma.notification.count({
      where: {
        tenantId,
        recipientUserId: userId,
        status: NotificationStatus.UNREAD,
        deletedAt: null,
      },
    });

    await this.cacheService.set(
      cacheKey,
      { count },
      this.cacheService.getNotificationUnreadTtlSeconds(),
    );

    return count;
  }

  async markAsRead(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<NotificationResponse> {
    await this.findOwnedNotificationOrThrow(tenantId, userId, id);

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
      select: notificationSelect,
    });

    await this.cacheService.invalidateNotificationUnreadCount(tenantId, userId);

    this.loggingService.info({
      module: 'Notifications',
      operation: 'read',
      status: 'read',
      metadata: { notificationId: id, userId, tenantId },
    });

    return toNotificationResponse(updated);
  }

  async markAllAsRead(
    tenantId: string,
    userId: string,
  ): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        tenantId,
        recipientUserId: userId,
        status: NotificationStatus.UNREAD,
        deletedAt: null,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });

    await this.cacheService.invalidateNotificationUnreadCount(tenantId, userId);

    this.loggingService.info({
      module: 'Notifications',
      operation: 'read_all',
      status: 'read',
      metadata: { updated: result.count, userId, tenantId },
    });

    return { updated: result.count };
  }

  async softDelete(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<{ id: string }> {
    await this.findOwnedNotificationOrThrow(tenantId, userId, id);

    await this.prisma.notification.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: NotificationStatus.ARCHIVED,
      },
    });

    await this.cacheService.invalidateNotificationUnreadCount(tenantId, userId);

    this.loggingService.info({
      module: 'Notifications',
      operation: 'delete',
      status: 'deleted',
      metadata: { notificationId: id, userId, tenantId },
    });

    return { id };
  }

  private buildWhereClause(
    tenantId: string,
    userId: string,
    query: GetNotificationsQueryDto,
  ): Prisma.NotificationWhereInput {
    const search = normalizeSearch(query.search);
    const from = query.from ? this.parseDate(query.from, 'from') : undefined;
    const to = query.to ? this.parseEndDate(query.to, 'to') : undefined;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'Invalid date range: from must be before or equal to to',
      );
    }

    return {
      tenantId,
      recipientUserId: userId,
      deletedAt: null,
      ...(query.unreadOnly ? { status: NotificationStatus.UNREAD } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async findOwnedNotificationOrThrow(
    tenantId: string,
    userId: string,
    id: string,
  ) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        tenantId,
        recipientUserId: userId,
        deletedAt: null,
      },
      select: notificationSelect,
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  private parseDate(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field} date`);
    }
    return parsed;
  }

  private parseEndDate(value: string, field: string): Date {
    const parsed = this.parseDate(value, field);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      parsed.setUTCHours(23, 59, 59, 999);
    }
    return parsed;
  }
}
