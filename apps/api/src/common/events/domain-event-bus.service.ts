import { Injectable } from '@nestjs/common';
import { DomainEvent, DomainEventType } from './domain-event.types';

type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

@Injectable()
export class DomainEventBus {
  private readonly handlers = new Map<
    DomainEventType,
    Set<DomainEventHandler>
  >();

  subscribe(type: DomainEventType, handler: DomainEventHandler): void {
    const existing = this.handlers.get(type);

    if (existing) {
      existing.add(handler);
      return;
    }

    this.handlers.set(type, new Set([handler]));
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);

    if (!handlers?.size) {
      return;
    }

    await Promise.all(
      [...handlers].map(async (handler) => {
        await handler(event);
      }),
    );
  }
}
