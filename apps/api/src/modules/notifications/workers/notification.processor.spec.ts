import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@crmpro/database';
import { WorkerLoggingService } from '../../../common/logging/worker-logging.service';
import { BullService } from '../../jobs/bull/bull.service';
import { NotificationDeliveryService } from '../notification-delivery.service';
import { NotificationProcessor } from './notification.processor';

describe('NotificationProcessor', () => {
  it('delegates delivery to NotificationDeliveryService', async () => {
    const deliveryService = {
      deliver: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        {
          provide: BullService,
          useValue: {
            getConnectionOptions: jest.fn().mockReturnValue({}),
            getPrefix: jest.fn().mockReturnValue('crmpro'),
            getNotificationConcurrency: jest.fn().mockReturnValue(5),
          },
        },
        { provide: NotificationDeliveryService, useValue: deliveryService },
        {
          provide: WorkerLoggingService,
          useValue: {
            queued: jest.fn(),
            started: jest.fn(),
            completed: jest.fn(),
            failed: jest.fn(),
            retry: jest.fn(),
          },
        },
      ],
    }).compile();

    const processor = module.get(NotificationProcessor);
    const payload = {
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      type: NotificationType.SYSTEM,
      metadata: {},
    };

    await (
      processor as unknown as {
        handleJob: (job: { data: typeof payload }) => Promise<void>;
      }
    ).handleJob({
      data: payload,
    });

    expect(deliveryService.deliver).toHaveBeenCalledWith(payload);
  });
});
