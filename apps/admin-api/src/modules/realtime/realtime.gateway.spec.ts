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

describe('RealtimeGateway (admin API)', () => {
  let gateway: RealtimeGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let prisma: {
    platformAdmin: { findUnique: jest.Mock };
    adminSession: { findUnique: jest.Mock };
    supportConversation: { findUnique: jest.Mock };
  };
  let emit: jest.Mock;
  let to: jest.Mock;

  const validPayload = { sub: 'admin-1', sessionId: 'session-1' };

  const activeAdmin = { id: 'admin-1', isActive: true };

  const activeSession = {
    adminId: 'admin-1',
    revokedAt: null,
    expiresAt: new Date('2099-01-01'),
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue(validPayload),
    };
    prisma = {
      platformAdmin: {
        findUnique: jest.fn().mockResolvedValue(activeAdmin),
      },
      adminSession: {
        findUnique: jest.fn().mockResolvedValue(activeSession),
      },
      supportConversation: { findUnique: jest.fn() },
    };

    gateway = new RealtimeGateway(jwtService as never, prisma as never);

    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
  });

  describe('handleConnection', () => {
    it('accepts a fully valid admin session and joins admin rooms', async () => {
      const client = createSocket();

      await gateway.handleConnection(client as never);

      expect(client.join).toHaveBeenCalledWith('admin:admin-1');
      expect(client.join).toHaveBeenCalledWith('admin-broadcast');
      expect(client.data.auth).toEqual({ adminId: 'admin-1' });
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

    it('rejects deactivated admins', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue({
        id: 'admin-1',
        isActive: false,
      });

      const client = createSocket();
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(prisma.adminSession.findUnique).not.toHaveBeenCalled();
    });

    it('rejects revoked admin sessions', async () => {
      prisma.adminSession.findUnique.mockResolvedValue({
        ...activeSession,
        revokedAt: new Date(),
      });

      const client = createSocket();
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects sessions belonging to a different admin', async () => {
      prisma.adminSession.findUnique.mockResolvedValue({
        ...activeSession,
        adminId: 'admin-2',
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

      expect(prisma.supportConversation.findUnique).not.toHaveBeenCalled();
      expect(to).not.toHaveBeenCalled();
    });

    it('ignores malformed payloads', async () => {
      const client = createSocket({ data: { auth: { adminId: 'admin-1' } } });

      await gateway.handleTyping(
        client as never,
        {
          conversationId: undefined,
          isTyping: 'yes',
        } as never,
      );

      expect(prisma.supportConversation.findUnique).not.toHaveBeenCalled();
    });

    it('targets the user room derived from the conversation row, never client input', async () => {
      prisma.supportConversation.findUnique.mockResolvedValue({
        id: 'conversation-1',
        createdByUserId: 'user-7',
      });
      const client = createSocket({ data: { auth: { adminId: 'admin-1' } } });

      await gateway.handleTyping(
        client as never,
        {
          conversationId: 'conversation-1',
          isTyping: true,
          userId: 'attacker-chosen-user',
        } as never,
      );

      expect(to).toHaveBeenCalledWith('user:user-7');
      expect(emit).toHaveBeenCalledWith('typing', {
        conversationId: 'conversation-1',
        actorType: 'ADMIN',
        isTyping: true,
      });
    });

    it('does not emit for unknown conversations', async () => {
      prisma.supportConversation.findUnique.mockResolvedValue(null);
      const client = createSocket({ data: { auth: { adminId: 'admin-1' } } });

      await gateway.handleTyping(client as never, {
        conversationId: 'conversation-missing',
        isTyping: true,
      });

      expect(to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });
});
