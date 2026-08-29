import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsGuard } from '../../common/auth/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const mockGuard: CanActivate = { canActivate: jest.fn().mockReturnValue(true) };

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: {
    getUnreadCount: jest.Mock;
    markAllAsRead: jest.Mock;
  };

  const user = {
    id: 'user-1',
    tenantId: 'tenant-1',
  } as AuthenticatedUser;

  beforeEach(async () => {
    notificationsService = {
      getUnreadCount: jest.fn().mockResolvedValue(7),
      markAllAsRead: jest.fn().mockResolvedValue({ updated: 3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notificationsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(NotificationsController);
  });

  it('returns unread count in CRMPro response format', async () => {
    await expect(controller.getUnreadCount(user)).resolves.toEqual({
      success: true,
      data: { count: 7 },
    });
  });

  it('marks all notifications as read', async () => {
    await expect(controller.markAllAsRead(user)).resolves.toEqual({
      success: true,
      data: { updated: 3 },
    });
  });
});
