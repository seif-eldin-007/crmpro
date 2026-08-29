import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@crmpro/shared/auth';
import { PermissionsGuard, RequirePermission } from '../../common/auth';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@Controller('notification-preferences')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationPreferencesController {
  constructor(
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.NOTIFICATION_READ)
  @ApiOperation({
    summary: 'Get notification preferences for the current user',
  })
  async getPreferences(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.preferencesService.getPreferences(
      user.tenantId,
      user.id,
    );

    return { success: true, data };
  }

  @Patch()
  @RequirePermission(PERMISSIONS.NOTIFICATION_UPDATE)
  @ApiOperation({
    summary: 'Update notification preferences for the current user',
  })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    const data = await this.preferencesService.updatePreferences(
      user.tenantId,
      user.id,
      dto.preferences,
    );

    return { success: true, data };
  }
}
