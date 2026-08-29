import { RealtimeGateway } from './realtime.gateway';

type FakeSocket = {
  handshake: {
    headers: Record<string, string | undefined>;
    auth: Record<string, unknown>;
  };
  data: Record<string, unknown>;
  join: jest.Mock;
  disconnect: jest.Mock;
};

function createSocket(overrides: Partial<FakeSocket> = {}): FakeSocket {
  return {
    handshake: {
      headers: { authorization: 'Bearer token' },
      auth: {},
    },
    data: {},
    join: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  };
}

describe('RealtimeGateway (tenant API)', () => {
  let gateway: RealtimeGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    userSession: { findUnique: jest.Mock };
    supportConversation: { findFirst: jest.Mock };
  };
  let tenantAccessService: { assertTenantAccessible: jest.Mock };
  let emit: jest.Mock;
  let to: jest.Mock;

  const validPayload = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    sessionId: 'session-1',
  };

  const activeUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    isActive: true,
    deletedAt: null,
    tenant: { id: 'tenant-1', deletedAt: null },
  };

  const activeSession = {
    userId: 'user-1',
    revokedAt: null,
    expiresAt: new Date('2099-01-01'),
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue(validPayload),
    };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeUser) },
      userSession: { findUnique: jest.fn().mockResolvedValue(activeSession) },
      supportConversation: { findFirst: jest.fn() },
    };
    tenantAccessService = {
      assertTenantAccessible: jest.fn().mockResolvedValue(undefined),
    };

    gateway = new RealtimeGateway(
      jwtService as never,
      prisma as never,
      tenantAccessService as never,
    );

    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
  });

  describe('handleConnection', () => {
    it('accepts a fully valid session and joins the user room', async () => {
      const client = createSocket();

      await gateway.handleConnection(client as never);

      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(client.data.auth).toEqual({
        userId: 'user-1',
        tenantId: 'tenant-1',
      });
      expect(tenantAccessService.assertTenantAccessible).toHaveBeenCalledWith(
        'tenant-1',
      );
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects connections without a token', async () => {
      const client = createSocket({
        handshake: { headers: {}, auth: {} },
      });

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects inactive users', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });

      await gateway.handleConnection(createSocket() as never);

      expect(prisma.userSession.findUnique).not.toHaveBeenCalled();
    });

    it('rejects users whose tenant was deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...activeUser,
        tenant: { id: 'tenant-1', deletedAt: new Date() },
      });

      const client = createSocket();
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('rejects suspended tenants', async () => {
      tenantAccessService.assertTenantAccessible.mockRejectedValue(
        new Error('Tenant suspended'),
      );

      const client = createSocket();
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('rejects revoked sessions', async () => {
      prisma.userSession.findUnique.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date(),
      });

      const client = createSocket();
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects sessions belonging to a different user', async () => {
      prisma.userSession.findUnique.mockResolvedValue({
        ...activeSession,
        userId: 'user-2',
      });

      const client = createSocket();
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleTyping', () => {
    it('ignores typing from unauthenticated sockets', async () => {
      const client = createSocket({ data: {} });

      await gateway.handleTyping(client as never, {
        conversationId: 'conversation-1',
        isTyping: true,
      });

      expect(prisma.supportConversation.findFirst).not.toHaveBeenCalled();
      expect(to).not.toHaveBeenCalled();
    });

    it('ignores malformed payloads', async () => {
      const client = createSocket({
        data: { auth: { userId: 'user-1', tenantId: 'tenant-1' } },
      });

      await gateway.handleTyping(
        client as never,
        {
          conversationId: 123,
          isTyping: 'yes',
        } as never,
      );

      expect(prisma.supportConversation.findFirst).not.toHaveBeenCalled();
    });

    it('only emits typing for conversations owned by the connected user', async () => {
      prisma.supportConversation.findFirst.mockResolvedValue({
        id: 'conversation-1',
      });
      const client = createSocket({
        data: { auth: { userId: 'user-1', tenantId: 'tenant-1' } },
      });

      await gateway.handleTyping(client as never, {
        conversationId: 'conversation-1',
        isTyping: true,
      });

      expect(prisma.supportConversation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'conversation-1',
          tenantId: 'tenant-1',
          createdByUserId: 'user-1',
        },
        select: { id: true },
      });
      expect(to).toHaveBeenCalledWith('admin-broadcast');
      expect(emit).toHaveBeenCalledWith('typing', {
        conversationId: 'conversation-1',
        actorType: 'USER',
        isTyping: true,
      });
    });

    it('does not emit when the conversation belongs to another user or tenant', async () => {
      prisma.supportConversation.findFirst.mockResolvedValue(null);
      const client = createSocket({
        data: { auth: { userId: 'user-1', tenantId: 'tenant-1' } },
      });

      await gateway.handleTyping(client as never, {
        conversationId: 'conversation-9',
        isTyping: true,
      });

      expect(to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });
});
