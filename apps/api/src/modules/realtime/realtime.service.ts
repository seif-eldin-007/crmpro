import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import {
  DOMAIN_EVENT_TYPES,
  NotificationCreatedEvent,
  SupportMessageCreatedEvent,
} from '../../common/events/domain-event.types';
import { RealtimeGateway } from './realtime.gateway';

interface RealtimePayload {
  event: string;
  data: unknown;
}

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe(
      DOMAIN_EVENT_TYPES.NOTIFICATION_CREATED,
      (event: NotificationCreatedEvent) => {
        this.notifyUser(event.userId, {
          event: 'invalidate',
          data: { entity: 'notifications' },
        });
      },
    );

    this.eventBus.subscribe(
      DOMAIN_EVENT_TYPES.SUPPORT_MESSAGE_CREATED,
      (event: SupportMessageCreatedEvent) => {
        this.notifyUser(event.userId, {
          event: 'invalidate',
          data: {
            entity: 'support-messages',
            conversationId: event.conversationId,
            actorId: event.actorId,
          },
        });

        // Notify admins
        this.notifyAdmins({
          event: 'invalidate',
          data: {
            entity: 'support-messages',
            conversationId: event.conversationId,
            actorId: event.actorId,
          },
        });
      },
    );
  }

  onModuleDestroy() {
    // cleanup if needed
  }

  notifyUser(userId: string, payload: RealtimePayload) {
    this.gateway.server.to(`user:${userId}`).emit(payload.event, payload.data);
  }

  notifyAdmins(payload: RealtimePayload) {
    this.gateway.server.to('admin-broadcast').emit(payload.event, payload.data);
  }
}
