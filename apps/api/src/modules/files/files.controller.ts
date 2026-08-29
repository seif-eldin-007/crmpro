import {
  Body,
  Controller,
  Delete,
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
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { GetFilesQueryDto } from './dto/get-files-query.dto';
import { RequestUploadDto } from './dto/request-upload.dto';
import { FilesService } from './files.service';

@Controller('files')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.FILE_READ)
  async listFiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetFilesQueryDto,
  ) {
    const data = await this.filesService.listFiles(user.tenantId, query);
    return { success: true, data };
  }

  @Post('request-upload')
  @RequirePermission(PERMISSIONS.FILE_UPLOAD)
  async requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestUploadDto,
  ) {
    const data = await this.filesService.requestUpload(
      user.tenantId,
      user.id,
      dto,
    );

    return { success: true, data };
  }

  @Post('complete-upload')
  @RequirePermission(PERMISSIONS.FILE_UPLOAD)
  async completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteUploadDto,
  ) {
    const data = await this.filesService.completeUpload(
      user.tenantId,
      user.id,
      dto,
    );

    return { success: true, data };
  }

  @Get(':id/download-url')
  @RequirePermission(PERMISSIONS.FILE_READ)
  async getDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.filesService.getDownloadUrl(id, user.tenantId);

    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.FILE_DELETE)
  async deleteFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.filesService.deleteFile(id, user.tenantId, user.id);

    return { success: true, data };
  }
}
