import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationStatus, NotificationType } from '@crmpro/database';
import { CacheService } from '../../common/cache/cache.service';
import { LoggingService } from '../../common/logging/logging.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let cacheService: {
    buildNotificationUnreadKey: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    invalidateNotificationUnreadCount: jest.Mock;
    getNotificationUnreadTtlSeconds: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    cacheService = {
      buildNotificationUnreadKey: jest
        .fn()
        .mockReturnValue('notifications:unread:tenant-1:user-1'),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      invalidateNotificationUnreadCount: jest.fn().mockResolvedValue(undefined),
      getNotificationUnreadTtlSeconds: jest.fn().mockReturnValue(60),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cacheService },
        { provide: LoggingService, useValue: { info: jest.fn() } },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('scopes list queries to tenant and recipient', async () => {
    await service.listNotifications('tenant-a', 'user-a', {});

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          recipientUserId: 'user-a',
          deletedAt: null,
        }) as Record<string, unknown>,
      }),
    );
  });

  it('returns cached unread count on cache hit', async () => {
    cacheService.get.mockResolvedValue({ count: 7 });

    await expect(service.getUnreadCount('tenant-a', 'user-a')).resolves.toBe(7);
    expect(prisma.notification.count).not.toHaveBeenCalled();
  });

  it('caches unread count on cache miss', async () => {
    prisma.notification.count.mockResolvedValue(4);

    await expect(service.getUnreadCount('tenant-a', 'user-a')).resolves.toBe(4);

    expect(cacheService.set).toHaveBeenCalledWith(
      'notifications:unread:tenant-1:user-1',
      { count: 4 },
      60,
    );
  });

  it('invalidates unread cache when marking as read', async () => {
    prisma.notification.findFirst.mockResolvedValue({
      id: 'notification-1',
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      type: NotificationType.LEAD_ASSIGNED,
      title: 'Title',
      message: 'Message',
      metadata: {},
      priority: 'NORMAL',
      status: NotificationStatus.UNREAD,
      readAt: null,
      createdAt: new Date(),
      expiresAt: null,
      createdByUserId: null,
    });
    prisma.notification.update.mockResolvedValue({
      id: 'notification-1',
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      type: NotificationType.LEAD_ASSIGNED,
      title: 'Title',
      message: 'Message',
      metadata: {},
      priority: 'NORMAL',
      status: NotificationStatus.READ,
      readAt: new Date(),
      createdAt: new Date(),
      expiresAt: null,
      createdByUserId: null,
    });

    await service.markAsRead('tenant-a', 'user-a', 'notification-1');

    expect(cacheService.invalidateNotificationUnreadCount).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
    );
  });

  it('rejects access to another user notification', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(
      service.getNotification('tenant-a', 'user-a', 'notification-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
