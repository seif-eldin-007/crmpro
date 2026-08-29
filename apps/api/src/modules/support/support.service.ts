import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SupportConversationStatus,
  SupportMessageAuthorType,
} from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DomainEventBus } from '../../common/events/domain-event-bus.service';
import { SupportMessageCreatedEvent } from '../../common/events/domain-event.types';
import {
  buildPaginatedResponse,
  getPaginationParams,
} from '../../common/pagination/utils/pagination.util';
import type { PaginatedResponse } from '../../common/pagination/types/paginated-response.type';
import {
  CreateSupportConversationDto,
  CreateSupportMessageDto,
  GetSupportConversationsQueryDto,
} from './dto/support.dto';

function previewOf(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}…` : trimmed;
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: DomainEventBus,
    private readonly realtimeService: RealtimeService,
  ) {}

  async listConversations(
    tenantId: string,
    userId: string,
    query: GetSupportConversationsQueryDto,
  ): Promise<PaginatedResponse<ReturnType<typeof toConversationListItem>>> {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = {
      tenantId,
      createdByUserId: userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                subject: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastMessagePreview: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.supportConversation.count({ where }),
      this.prisma.supportConversation.findMany({
        where,
        skip,
        take,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          createdByUser: { select: { id: true, name: true, email: true } },
          assignedAdmin: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
    ]);

    return buildPaginatedResponse(
      rows.map(toConversationListItem),
      page,
      limit,
      totalItems,
    );
  }

  async getConversation(
    tenantId: string,
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.findOwnedConversation(
      tenantId,
      userId,
      conversationId,
    );

    const messages = await this.prisma.supportMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        authorUser: { select: { id: true, name: true, email: true } },
        authorAdmin: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (conversation.userUnreadCount > 0) {
      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: { userUnreadCount: 0 },
      });
      conversation.userUnreadCount = 0;
    }

    return {
      ...toConversationListItem(conversation),
      messages: messages.map(toMessageItem),
    };
  }

  async createConversation(
    tenantId: string,
    userId: string,
    dto: CreateSupportConversationDto,
  ) {
    const now = new Date();
    const conversation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportConversation.create({
        data: {
          tenantId,
          createdByUserId: userId,
          subject: dto.subject,
          status: SupportConversationStatus.WAITING_ON_ADMIN,
          lastMessageAt: now,
          lastMessagePreview: previewOf(dto.body),
          adminUnreadCount: 1,
          userUnreadCount: 0,
        },
      });

      await tx.supportMessage.create({
        data: {
          conversationId: created.id,
          tenantId,
          authorType: SupportMessageAuthorType.USER,
          authorUserId: userId,
          body: dto.body,
        },
      });

      return tx.supportConversation.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          createdByUser: { select: { id: true, name: true, email: true } },
          assignedAdmin: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });
    });

    void this.eventBus.publish(
      new SupportMessageCreatedEvent(tenantId, conversation.id, userId, userId),
    );
    return toConversationListItem(conversation);
  }

  async reply(
    tenantId: string,
    userId: string,
    conversationId: string,
    dto: CreateSupportMessageDto,
  ) {
    const conversation = await this.findOwnedConversation(
      tenantId,
      userId,
      conversationId,
    );

    if (
      conversation.status === SupportConversationStatus.CLOSED ||
      conversation.status === SupportConversationStatus.RESOLVED
    ) {
      throw new ForbiddenException(
        'This conversation is closed. Open a new one to continue.',
      );
    }

    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          conversationId,
          tenantId,
          authorType: SupportMessageAuthorType.USER,
          authorUserId: userId,
          body: dto.body,
        },
        include: {
          authorUser: { select: { id: true, name: true, email: true } },
          authorAdmin: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.supportConversation.update({
        where: { id: conversationId },
        data: {
          status: SupportConversationStatus.WAITING_ON_ADMIN,
          lastMessageAt: now,
          lastMessagePreview: previewOf(dto.body),
          adminUnreadCount: { increment: 1 },
          closedAt: null,
        },
      });

      return created;
    });

    void this.eventBus.publish(
      new SupportMessageCreatedEvent(tenantId, conversationId, userId, userId),
    );
    return toMessageItem(message);
  }

  async resolve(tenantId: string, userId: string, conversationId: string) {
    await this.findOwnedConversation(tenantId, userId, conversationId);

    const updated = await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        status: SupportConversationStatus.RESOLVED,
        closedAt: new Date(),
        userUnreadCount: 0,
      },
      include: {
        createdByUser: { select: { id: true, name: true, email: true } },
        assignedAdmin: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    this.realtimeService.notifyUser(userId, {
      event: 'invalidate',
      data: { entity: 'support-messages', conversationId, actorId: 'system' },
    });
    this.realtimeService.notifyAdmins({
      event: 'invalidate',
      data: { entity: 'support-messages', conversationId, actorId: 'system' },
    });
    return toConversationListItem(updated);
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const result = await this.prisma.supportConversation.aggregate({
      where: { tenantId, createdByUserId: userId },
      _sum: { userUnreadCount: true },
    });
    return result._sum.userUnreadCount ?? 0;
  }

  private async findOwnedConversation(
    tenantId: string,
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId, tenantId, createdByUserId: userId },
      include: {
        createdByUser: { select: { id: true, name: true, email: true } },
        assignedAdmin: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Support conversation not found');
    }

    return conversation;
  }
}

function toConversationListItem(row: {
  id: string;
  tenantId: string;
  subject: string;
  status: SupportConversationStatus;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  userUnreadCount: number;
  adminUnreadCount: number;
  createdAt: Date;
  closedAt: Date | null;
  createdByUser: { id: string; name: string; email: string };
  assignedAdmin: { id: string; fullName: string; email: string } | null;
}) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    subject: row.subject,
    status: row.status,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    userUnreadCount: row.userUnreadCount,
    adminUnreadCount: row.adminUnreadCount,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    createdByUser: row.createdByUser,
    assignedAdmin: row.assignedAdmin
      ? {
          id: row.assignedAdmin.id,
          fullName: row.assignedAdmin.fullName,
          email: row.assignedAdmin.email,
        }
      : null,
  };
}

function toMessageItem(row: {
  id: string;
  conversationId: string;
  authorType: SupportMessageAuthorType;
  body: string;
  createdAt: Date;
  authorUser: { id: string; name: string; email: string } | null;
  authorAdmin: { id: string; fullName: string; email: string } | null;
}) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorType: row.authorType,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    authorUser: row.authorUser,
    authorAdmin: row.authorAdmin
      ? {
          id: row.authorAdmin.id,
          fullName: row.authorAdmin.fullName,
          email: row.authorAdmin.email,
        }
      : null,
  };
}
