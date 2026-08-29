import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadActivityEventType, Prisma } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreateLeadNoteDto } from '../dto/create-lead-note.dto';
import { UpdateLeadNoteDto } from '../dto/update-lead-note.dto';
import { LeadNoteResponse } from '../types/lead.types';
import { LeadAccessService } from './lead-access.service';
import { LeadActivityService } from './lead-activity.service';

const NOTE_PREVIEW_MAX_LENGTH = 120;

const noteSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      email: true,
    },
  },
} satisfies Prisma.LeadNoteSelect;

type NoteRecord = Prisma.LeadNoteGetPayload<{ select: typeof noteSelect }>;

@Injectable()
export class LeadNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadAccessService: LeadAccessService,
    private readonly leadActivityService: LeadActivityService,
  ) {}

  async listNotes(
    leadId: string,
    tenantId: string,
  ): Promise<{ items: LeadNoteResponse[] }> {
    await this.leadAccessService.getLeadOrThrow(leadId, tenantId);

    const notes = await this.prisma.leadNote.findMany({
      where: {
        leadId,
        tenantId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: noteSelect,
    });

    return {
      items: notes.map((note) => this.toNoteResponse(note)),
    };
  }

  async createNote(
    leadId: string,
    tenantId: string,
    authorId: string,
    dto: CreateLeadNoteDto,
  ): Promise<LeadNoteResponse> {
    await this.leadAccessService.getLeadOrThrow(leadId, tenantId, {
      requireOpen: true,
    });

    const content = dto.content.trim();

    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leadNote.create({
        data: {
          tenantId,
          leadId,
          authorId,
          content,
        },
        select: noteSelect,
      });

      await this.leadActivityService.createActivity(
        {
          tenantId,
          leadId,
          actorUserId: authorId,
          eventType: LeadActivityEventType.NOTE_ADDED,
          metadata: {
            noteId: created.id,
            preview: this.buildNotePreview(content),
          },
        },
        tx,
      );

      return created;
    });

    return this.toNoteResponse(note);
  }

  async updateNote(
    noteId: string,
    tenantId: string,
    actorUserId: string,
    dto: UpdateLeadNoteDto,
  ): Promise<LeadNoteResponse> {
    const existing = await this.getNoteOrThrow(noteId, tenantId);
    const content = dto.content.trim();
    const previousPreview = this.buildNotePreview(existing.content);
    const newPreview = this.buildNotePreview(content);

    const note = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.leadNote.update({
        where: { id: existing.id },
        data: { content },
        select: noteSelect,
      });

      await this.leadActivityService.createActivity(
        {
          tenantId,
          leadId: existing.leadId,
          actorUserId,
          eventType: LeadActivityEventType.NOTE_UPDATED,
          metadata: {
            noteId: existing.id,
            previousPreview,
            newPreview,
          },
        },
        tx,
      );

      return updated;
    });

    return this.toNoteResponse(note);
  }

  async deleteNote(
    noteId: string,
    tenantId: string,
    actorUserId: string,
  ): Promise<{ id: string }> {
    const existing = await this.getNoteOrThrow(noteId, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.leadNote.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.leadActivityService.createActivity(
        {
          tenantId,
          leadId: existing.leadId,
          actorUserId,
          eventType: LeadActivityEventType.NOTE_DELETED,
          metadata: { noteId: existing.id },
        },
        tx,
      );
    });

    return { id: existing.id };
  }

  private async getNoteOrThrow(
    noteId: string,
    tenantId: string,
  ): Promise<{ id: string; leadId: string; content: string }> {
    const note = await this.prisma.leadNote.findFirst({
      where: { id: noteId, tenantId, deletedAt: null },
      select: { id: true, leadId: true, content: true },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  buildNotePreview(content: string): string {
    const trimmed = content.trim();

    if (trimmed.length <= NOTE_PREVIEW_MAX_LENGTH) {
      return trimmed;
    }

    return `${trimmed.slice(0, NOTE_PREVIEW_MAX_LENGTH)}…`;
  }

  private toNoteResponse(note: NoteRecord): LeadNoteResponse {
    return {
      id: note.id,
      content: note.content,
      author: note.author,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }
}
