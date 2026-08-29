import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_PERMISSIONS } from '@crmpro/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminPermissionsService } from '../../common/auth/services/admin-permissions.service';
import type { RequestSecurityMetadata } from '../auth/auth.types';
import { CreateAdminNoteDto } from './dto/create-admin-note.dto';
import { UpdateAdminNoteDto } from './dto/update-admin-note.dto';
import { AdminsAuditService } from './services/admins-audit.service';
import type { AdminNoteItem } from './types/admin.types';
import { toAdminNoteItem } from './utils/admin.mapper';

const noteInclude = {
  authorAdmin: {
    select: { id: true, fullName: true, email: true },
  },
} as const;

@Injectable()
export class AdminNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminsAuditService,
    private readonly permissionsService: AdminPermissionsService,
  ) {}

  async listNotes(targetAdminId: string): Promise<AdminNoteItem[]> {
    await this.assertTargetAdminExists(targetAdminId);

    const notes = await this.prisma.adminNote.findMany({
      where: {
        targetAdminId,
        deletedAt: null,
      },
      include: noteInclude,
      orderBy: { createdAt: 'desc' },
    });

    return notes.map(toAdminNoteItem);
  }

  async createNote(
    targetAdminId: string,
    dto: CreateAdminNoteDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<AdminNoteItem> {
    await this.assertTargetAdminExists(targetAdminId);

    const note = await this.prisma.adminNote.create({
      data: {
        targetAdminId,
        authorAdminId: actorAdminId,
        content: dto.content,
      },
      include: noteInclude,
    });

    await this.auditService.logNoteCreated(
      actorAdminId,
      note.id,
      targetAdminId,
      metadata,
    );

    return toAdminNoteItem(note);
  }

  async updateNote(
    noteId: string,
    dto: UpdateAdminNoteDto,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<AdminNoteItem> {
    const note = await this.findNoteOrThrow(noteId);
    await this.assertCanModifyNote(note.authorAdminId, actorAdminId);

    const updated = await this.prisma.adminNote.update({
      where: { id: noteId },
      data: { content: dto.content },
      include: noteInclude,
    });

    await this.auditService.logNoteUpdated(actorAdminId, noteId, metadata);

    return toAdminNoteItem(updated);
  }

  async deleteNote(
    noteId: string,
    actorAdminId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<{ success: true }> {
    const note = await this.findNoteOrThrow(noteId);
    await this.assertCanModifyNote(note.authorAdminId, actorAdminId);

    await this.prisma.adminNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.logNoteDeleted(actorAdminId, noteId, metadata);

    return { success: true };
  }

  private async findNoteOrThrow(noteId: string) {
    const note = await this.prisma.adminNote.findFirst({
      where: { id: noteId, deletedAt: null },
      select: { id: true, authorAdminId: true },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  private async assertTargetAdminExists(targetAdminId: string): Promise<void> {
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { id: targetAdminId },
      select: { id: true },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
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

    if (keys.has(ADMIN_PERMISSIONS.ADMIN_MANAGE)) {
      return;
    }

    throw new ForbiddenException(
      'Only the note author or a super admin can modify this note',
    );
  }
}
