import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ADMIN_PERMISSIONS } from '@crmpro/shared';
import type { Request } from 'express';
import {
  AdminPermissionsGuard,
  RequireAnyAdminPermission,
} from '../../common/auth';
import { toListResponseData } from '../../common/http/list-response';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { extractRequestSecurityMetadata } from '../auth/utils/request-metadata.util';
import { CreateTenantNoteDto } from './dto/create-tenant-note.dto';
import { UpdateTenantNoteDto } from './dto/update-tenant-note.dto';
import { TenantNotesService } from './services/tenant-notes.service';

@Controller()
@UseGuards(JwtAuthGuard, AdminPermissionsGuard)
export class TenantNotesController {
  constructor(private readonly notesService: TenantNotesService) {}

  @Get('tenants/:id/notes')
  @RequireAnyAdminPermission(
    ADMIN_PERMISSIONS.TENANT_READ,
    ADMIN_PERMISSIONS.TENANT_UPDATE,
    ADMIN_PERMISSIONS.SUPPORT_ACCESS,
  )
  async listNotes(@Param('id', ParseUUIDPipe) tenantId: string) {
    const notes = await this.notesService.listNotes(tenantId);
    return { success: true, data: toListResponseData(notes).items };
  }

  @Post('tenants/:id/notes')
  @RequireAnyAdminPermission(
    ADMIN_PERMISSIONS.TENANT_UPDATE,
    ADMIN_PERMISSIONS.SUPPORT_ACCESS,
  )
  async createNote(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateTenantNoteDto,
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const note = await this.notesService.createNote(
      tenantId,
      dto,
      actor.id,
      extractRequestSecurityMetadata(req),
    );
    return { success: true, data: note };
  }

  @Patch('tenant-notes/:noteId')
  @RequireAnyAdminPermission(
    ADMIN_PERMISSIONS.TENANT_UPDATE,
    ADMIN_PERMISSIONS.SUPPORT_ACCESS,
  )
  async updateNote(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateTenantNoteDto,
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const note = await this.notesService.updateNote(
      noteId,
      dto,
      actor.id,
      extractRequestSecurityMetadata(req),
    );
    return { success: true, data: note };
  }

  @Delete('tenant-notes/:noteId')
  @RequireAnyAdminPermission(
    ADMIN_PERMISSIONS.TENANT_UPDATE,
    ADMIN_PERMISSIONS.SUPPORT_ACCESS,
  )
  async deleteNote(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentAdmin() actor: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const data = await this.notesService.deleteNote(
      noteId,
      actor.id,
      extractRequestSecurityMetadata(req),
    );
    return { success: true, data };
  }
}
