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
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { AccessTokenPayload } from '../auth/types/jwt-payload.type';

interface SocketAuth {
  userId: string;
  tenantId: string;
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
    private readonly tenantAccessService: TenantAccessService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const auth = await this.authenticate(client);

      (client.data as SocketData).auth = auth;
      await client.join(`user:${auth.userId}`);
      this.logger.debug(`User ${auth.userId} connected to websocket`);
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
    @MessageBody() payload: { conversationId: string; isTyping: boolean },
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

    // Only the creator of a support conversation may emit typing events for
    // it — never trust client-supplied room targets.
    const conversation = await this.prisma.supportConversation.findFirst({
      where: {
        id: payload.conversationId,
        tenantId: auth.tenantId,
        createdByUserId: auth.userId,
      },
      select: { id: true },
    });

    if (!conversation) {
      return;
    }

    this.server.to('admin-broadcast').emit('typing', {
      conversationId: conversation.id,
      actorType: 'USER',
      isTyping: payload.isTyping,
    });
  }

  /**
   * Mirrors the HTTP JWT strategy: signature verification alone is not
   * enough — the session row, user state and tenant accessibility are all
   * re-checked so revoked sessions cannot hold a socket open.
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
      typeof payload?.tenantId !== 'string' ||
      typeof payload?.sessionId !== 'string'
    ) {
      throw new Error('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantId: true,
        isActive: true,
        deletedAt: true,
        tenant: { select: { id: true, deletedAt: true } },
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.deletedAt !== null ||
      user.tenantId !== payload.tenantId ||
      !user.tenant ||
      user.tenant.deletedAt !== null
    ) {
      throw new Error('User is not active');
    }

    await this.tenantAccessService.assertTenantAccessible(user.tenantId);

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw new Error('Session is not active');
    }

    return { userId: user.id, tenantId: user.tenantId };
  }
}
