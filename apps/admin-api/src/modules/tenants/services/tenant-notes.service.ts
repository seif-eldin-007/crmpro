import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_PERMISSIONS } from '@crmpro/shared';
import { AdminPermissionsService } from '../../../common/auth/services/admin-permissions.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { RequestSecurityMetadata } from '../../auth/auth.types';
import { CreateTenantNoteDto } from '../dto/create-tenant-note.dto';
import { UpdateTenantNoteDto } from '../dto/update-tenant-note.dto';
import { TenantsAuditService } from '../services/tenants-audit.service';
import type { TenantNoteItem } from '../types/tenant-note.types';

const noteInclude = {
  authorAdmin: {
    select: { id: true, fullName: true, email: true },
  },
} as const;

@Injectable()
export class TenantNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: TenantsAuditService,
    private readonly permissionsService: AdminPermissionsService,
  ) {}

  async listNotes(tenantId: string): Promise<TenantNoteItem[]> {
    await this.assertTenantExists(tenantId);

    const notes = await this.prisma.tenantNote.findMany({
      where: { tenantId, deletedAt: null },
      include: noteInclude,
      orderBy: { createdAt: 'desc' },
    });

    return notes.map(toTenantNoteItem);
  }

  async createNote(
    tenantId: string,
    dto: CreateTenantNoteDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<TenantNoteItem> {
    await this.assertTenantExists(tenantId);

    const note = await this.prisma.tenantNote.create({
      data: {
        tenantId,
        authorAdminId: actorAdminId,
        content: dto.content,
      },
      include: noteInclude,
    });

    await this.auditService.logTenantNoteCreated(
      actorAdminId,
      note.id,
      tenantId,
      metadata,
    );

    return toTenantNoteItem(note);
  }

  async updateNote(
    noteId: string,
    dto: UpdateTenantNoteDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<TenantNoteItem> {
    const note = await this.findNoteOrThrow(noteId);
    await this.assertCanModifyNote(note.authorAdminId, actorAdminId);

    const updated = await this.prisma.tenantNote.update({
      where: { id: noteId },
      data: { content: dto.content },
      include: noteInclude,
    });

    await this.auditService.logTenantNoteUpdated(
      actorAdminId,
      noteId,
      note.tenantId,
      metadata,
    );

    return toTenantNoteItem(updated);
  }

  async deleteNote(
    noteId: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<{ success: true }> {
    const note = await this.findNoteOrThrow(noteId);
    await this.assertCanModifyNote(note.authorAdminId, actorAdminId);

    await this.prisma.tenantNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.logTenantNoteDeleted(
      actorAdminId,
      noteId,
      note.tenantId,
      metadata,
    );

    return { success: true };
  }

  private async findNoteOrThrow(noteId: string) {
    const note = await this.prisma.tenantNote.findFirst({
      where: { id: noteId, deletedAt: null },
      select: { id: true, authorAdminId: true, tenantId: true },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
  }

  private async assertCanModifyNote(
    authorAdminId: string,
    actorAdminId: string,
  ): Promise<void> {
    if (authorAdminId === actorAdminId) {
      return;
    }

    const keys =
      await this.permissionsService.getPermissionKeysForAdmin(actorAdminId);

    if (keys.has(ADMIN_PERMISSIONS.TENANT_UPDATE)) {
      return;
    }

    throw new ForbiddenException(
      'Only the note author or a tenant operator can modify this note',
    );
  }
}

function toTenantNoteItem(note: {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorAdmin: { id: string; fullName: string; email: string };
}): TenantNoteItem {
  return {
    id: note.id,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    author: note.authorAdmin,
  };
}
