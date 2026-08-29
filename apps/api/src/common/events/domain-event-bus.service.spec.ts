import { DomainEventBus } from './domain-event-bus.service';
import { DOMAIN_EVENT_TYPES, LeadCreatedEvent } from './domain-event.types';

describe('DomainEventBus', () => {
  it('delivers published events to subscribed handlers', async () => {
    const bus = new DomainEventBus();
    const handler = jest.fn();

    bus.subscribe(DOMAIN_EVENT_TYPES.LEAD_CREATED, handler);
    await bus.publish(new LeadCreatedEvent('tenant-1', 'lead-1'));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.LEAD_CREATED,
        tenantId: 'tenant-1',
        leadId: 'lead-1',
      }),
    );
  });

  it('ignores publishes when no handlers are registered', async () => {
    const bus = new DomainEventBus();

    await expect(
      bus.publish(new LeadCreatedEvent('tenant-1', 'lead-1')),
    ).resolves.toBeUndefined();
  });
});
