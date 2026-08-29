import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

interface RealtimePayload {
  event: string;
  data: unknown;
}

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  notifyUser(userId: string, payload: RealtimePayload) {
    this.gateway.server.to(`user:${userId}`).emit(payload.event, payload.data);
  }

  notifyAdmins(payload: RealtimePayload) {
    this.gateway.server.to('admin-broadcast').emit(payload.event, payload.data);
  }
}
