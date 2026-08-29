import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { PermissionsGuard, RequirePermission } from '../../common/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import {
  CreateSupportConversationDto,
  CreateSupportMessageDto,
  GetSupportConversationsQueryDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@Controller('support/conversations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @RequirePermission(PERMISSIONS.SUPPORT_READ)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetSupportConversationsQueryDto,
  ) {
    const data = await this.supportService.listConversations(
      user.tenantId,
      user.id,
      query,
    );
    return { success: true, data };
  }

  @Get('unread-count')
  @RequirePermission(PERMISSIONS.SUPPORT_READ)
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.supportService.getUnreadCount(
      user.tenantId,
      user.id,
    );
    return { success: true, data: { count } };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.SUPPORT_READ)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.supportService.getConversation(
      user.tenantId,
      user.id,
      id,
    );
    return { success: true, data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.SUPPORT_CREATE)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupportConversationDto,
  ) {
    const data = await this.supportService.createConversation(
      user.tenantId,
      user.id,
      dto,
    );
    return { success: true, data };
  }

  @Post(':id/messages')
  @RequirePermission(PERMISSIONS.SUPPORT_UPDATE)
  async reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSupportMessageDto,
  ) {
    const data = await this.supportService.reply(
      user.tenantId,
      user.id,
      id,
      dto,
    );
    return { success: true, data };
  }

  @Post(':id/resolve')
  @RequirePermission(PERMISSIONS.SUPPORT_UPDATE)
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.supportService.resolve(user.tenantId, user.id, id);
    return { success: true, data };
  }
}
