import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '@crmpro/database';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationTriggerService } from './notification-trigger.service';

describe('NotificationTriggerService', () => {
  let service: NotificationTriggerService;
  let preferencesService: { isEnabled: jest.Mock };
  let queueService: { enqueue: jest.Mock };

  beforeEach(async () => {
    preferencesService = {
      isEnabled: jest.fn().mockResolvedValue(true),
    };
    queueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationTriggerService,
        {
          provide: NotificationPreferencesService,
          useValue: preferencesService,
        },
        { provide: NotificationQueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get(NotificationTriggerService);
  });

  it('does not queue when preference is disabled', async () => {
    preferencesService.isEnabled.mockResolvedValue(false);

    await service.notifyLeadAssigned({
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      leadId: 'lead-1',
      leadName: 'Ahmed',
      actorUserId: 'actor-1',
    });

    expect(queueService.enqueue).not.toHaveBeenCalled();
  });

  it('queues lead assigned notification when enabled', async () => {
    await service.notifyLeadAssigned({
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      leadId: 'lead-1',
      leadName: 'Ahmed',
      actorUserId: 'actor-1',
    });

    expect(queueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        recipientUserId: 'user-a',
        type: NotificationType.LEAD_ASSIGNED,
        dedupeKey: 'lead:lead-1:LEAD_ASSIGNED:user-a',
      }),
    );
  });

  it('queues won notification after stage change to won', async () => {
    await service.notifyLeadStageChanged({
      tenantId: 'tenant-a',
      recipientUserId: 'user-a',
      leadId: 'lead-1',
      leadName: 'Ahmed',
      fromStageName: 'Qualified',
      toStageName: 'Won',
      closeType: 'WON',
      actorUserId: 'actor-1',
    });

    expect(queueService.enqueue).toHaveBeenCalledTimes(2);
    expect(queueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.LEAD_STAGE_CHANGED }),
    );
    expect(queueService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.LEAD_WON }),
    );
  });
});
