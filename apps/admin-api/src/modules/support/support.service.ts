import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationPriority,
  NotificationStatus,
  NotificationType,
  SupportConversationStatus,
  SupportMessageAuthorType,
} from '@crmpro/database';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  buildPaginatedResponse,
  getPaginationParams,
} from '../../common/pagination/utils/pagination.util';
import type { PaginatedResponse } from '../../common/pagination/types/paginated-response.type';
import {
  CreateAdminSupportMessageDto,
  GetAdminSupportConversationsQueryDto,
  UpdateAdminSupportStatusDto,
} from './dto/support.dto';

function previewOf(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}…` : trimmed;
}

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async listConversations(
    query: GetAdminSupportConversationsQueryDto,
  ): Promise<
    PaginatedResponse<ReturnType<typeof toAdminConversationListItem>>
  > {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
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
              {
                tenant: {
                  name: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
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
        include: conversationInclude,
      }),
    ]);

    return buildPaginatedResponse(
      rows.map(toAdminConversationListItem),
      page,
      limit,
      totalItems,
    );
  }

  async getConversation(conversationId: string) {
    const conversation = await this.findConversationOrThrow(conversationId);

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

    if (conversation.adminUnreadCount > 0) {
      await this.prisma.supportConversation.update({
        where: { id: conversationId },
        data: { adminUnreadCount: 0 },
      });
      conversation.adminUnreadCount = 0;
    }

    return {
      ...toAdminConversationListItem(conversation),
      messages: messages.map(toMessageItem),
    };
  }

  async reply(
    conversationId: string,
    adminId: string,
    dto: CreateAdminSupportMessageDto,
  ) {
    const conversation = await this.findConversationOrThrow(conversationId);

    if (conversation.status === SupportConversationStatus.CLOSED) {
      throw new BadRequestException('Conversation is closed');
    }

    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportMessage.create({
        data: {
          conversationId,
          tenantId: conversation.tenantId,
          authorType: SupportMessageAuthorType.ADMIN,
          authorAdminId: adminId,
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
          status: SupportConversationStatus.WAITING_ON_USER,
          lastMessageAt: now,
          lastMessagePreview: previewOf(dto.body),
          userUnreadCount: { increment: 1 },
          adminUnreadCount: 0,
          assignedAdminId: conversation.assignedAdminId ?? adminId,
          closedAt: null,
        },
      });

      await tx.notification.create({
        data: {
          tenantId: conversation.tenantId,
          recipientUserId: conversation.createdByUserId,
          type: NotificationType.SUPPORT_REPLY,
          title: 'Support replied',
          message: `New reply on “${conversation.subject}”`,
          metadata: {
            title: 'Support replied',
            message: `New reply on “${conversation.subject}”`,
            conversationId,
            href: `/support?id=${conversationId}`,
          },
          priority: NotificationPriority.NORMAL,
          status: NotificationStatus.UNREAD,
          dedupeKey: `support-reply:${conversationId}:${created.id}`,
        },
      });

      return created;
    });

    this.realtimeService.notifyUser(conversation.createdByUserId, {
      event: 'invalidate',
      data: { entity: 'support-messages', conversationId, actorId: adminId },
    });
    this.realtimeService.notifyUser(conversation.createdByUserId, {
      event: 'invalidate',
      data: { entity: 'notifications' },
    });
    this.realtimeService.notifyAdmins({
      event: 'invalidate',
      data: { entity: 'support-messages', conversationId, actorId: adminId },
    });
    return toMessageItem(message);
  }

  async updateStatus(conversationId: string, dto: UpdateAdminSupportStatusDto) {
    await this.findConversationOrThrow(conversationId);

    const closed =
      dto.status === SupportConversationStatus.RESOLVED ||
      dto.status === SupportConversationStatus.CLOSED;

    const updated = await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        status: dto.status,
        closedAt: closed ? new Date() : null,
        ...(closed ? { adminUnreadCount: 0 } : {}),
      },
      include: conversationInclude,
    });

    this.realtimeService.notifyUser(updated.createdByUserId, {
      event: 'invalidate',
      data: { entity: 'support-messages', conversationId, actorId: 'system' },
    });
    this.realtimeService.notifyAdmins({
      event: 'invalidate',
      data: { entity: 'support-messages', conversationId, actorId: 'system' },
    });

    return toAdminConversationListItem(updated);
  }

  async getInboxSummary() {
    const [open, waitingOnAdmin, unread] = await Promise.all([
      this.prisma.supportConversation.count({
        where: {
          status: {
            in: [
              SupportConversationStatus.OPEN,
              SupportConversationStatus.WAITING_ON_ADMIN,
              SupportConversationStatus.WAITING_ON_USER,
            ],
          },
        },
      }),
      this.prisma.supportConversation.count({
        where: { status: SupportConversationStatus.WAITING_ON_ADMIN },
      }),
      this.prisma.supportConversation.aggregate({
        _sum: { adminUnreadCount: true },
      }),
    ]);

    return {
      open,
      waitingOnAdmin,
      unread: unread._sum.adminUnreadCount ?? 0,
    };
  }

  private async findConversationOrThrow(conversationId: string) {
    const conversation = await this.prisma.supportConversation.findFirst({
      where: { id: conversationId },
      include: conversationInclude,
    });

    if (!conversation) {
      throw new NotFoundException('Support conversation not found');
    }

    return conversation;
  }
}

const conversationInclude = {
  tenant: { select: { id: true, name: true, slug: true } },
  createdByUser: { select: { id: true, name: true, email: true } },
  assignedAdmin: {
    select: { id: true, fullName: true, email: true },
  },
} as const;

function toAdminConversationListItem(row: {
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
  tenant: { id: string; name: string; slug: string };
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
    tenant: row.tenant,
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
