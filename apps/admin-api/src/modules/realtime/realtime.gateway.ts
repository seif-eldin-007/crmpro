import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessTokenPayload } from '../auth/auth.types';

interface SocketAuth {
  adminId: string;
}

interface SocketData {
  auth?: SocketAuth;
}

@WebSocketGateway()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const auth = await this.authenticate(client);

      (client.data as SocketData).auth = auth;
      await client.join(`admin:${auth.adminId}`);
      await client.join('admin-broadcast');
      this.logger.debug(`Admin ${auth.adminId} connected to websocket`);
    } catch (error) {
      this.logger.warn(
        `WebSocket connection rejected: ${(error as Error).message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect() {
    this.logger.debug('Client disconnected');
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { conversationId: string; isTyping: boolean },
  ) {
    const auth = (client.data as SocketData).auth;
    if (!auth) {
      return;
    }

    if (
      typeof payload?.conversationId !== 'string' ||
      typeof payload?.isTyping !== 'boolean'
    ) {
      return;
    }

    // Derive the target user room from the conversation itself — never trust
    // a client-supplied user id.
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: payload.conversationId },
      select: { id: true, createdByUserId: true },
    });

    if (!conversation) {
      return;
    }

    this.server.to(`user:${conversation.createdByUserId}`).emit('typing', {
      conversationId: conversation.id,
      actorType: 'ADMIN',
      isTyping: payload.isTyping,
    });
  }

  /**
   * Mirrors the HTTP JWT strategy: signature verification alone is not
   * enough — the admin and session rows are re-checked so revoked or
   * deactivated accounts cannot hold a socket open.
   */
  private async authenticate(client: Socket): Promise<SocketAuth> {
    const authHeader = client.handshake.headers.authorization;
    const handshakeAuth = client.handshake.auth as
      | { token?: unknown }
      | undefined;
    const handshakeToken =
      typeof handshakeAuth?.token === 'string' ? handshakeAuth.token : '';
    const token = authHeader?.split(' ')[1] || handshakeToken;

    if (!token) {
      throw new Error('No token provided');
    }

    const payload =
      await this.jwtService.verifyAsync<AccessTokenPayload>(token);

    if (
      typeof payload?.sub !== 'string' ||
      typeof payload?.sessionId !== 'string'
    ) {
      throw new Error('Invalid token payload');
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      throw new Error('Admin is not active');
    }

    const session = await this.prisma.adminSession.findUnique({
      where: { id: payload.sessionId },
      select: {
        adminId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (
      !session ||
      session.adminId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw new Error('Session is not active');
    }

    return { adminId: admin.id };
  }
}
