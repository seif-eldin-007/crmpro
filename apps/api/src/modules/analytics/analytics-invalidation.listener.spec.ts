import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import {
  DOMAIN_EVENT_TYPES,
  LeadCreatedEvent,
} from '../../common/events/domain-event.types';
import { AnalyticsInvalidationListener } from './analytics-invalidation.listener';
import { AnalyticsInvalidationService } from './analytics-invalidation.service';

describe('AnalyticsInvalidationListener', () => {
  it('invalidates analytics cache when subscribed events are published', async () => {
    const invalidation = {
      invalidateTenant: jest.fn().mockResolvedValue(undefined),
    };
    const eventBus = new DomainEventBus();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsInvalidationListener,
        { provide: DomainEventBus, useValue: eventBus },
        { provide: AnalyticsInvalidationService, useValue: invalidation },
      ],
    }).compile();

    module.get(AnalyticsInvalidationListener).onModuleInit();

    await eventBus.publish(new LeadCreatedEvent('tenant-1', 'lead-1'));

    expect(invalidation.invalidateTenant).toHaveBeenCalledWith('tenant-1');
    expect(eventBus).toBeDefined();
    expect(DOMAIN_EVENT_TYPES.LEAD_CREATED).toBe('lead.created');
  });
});
