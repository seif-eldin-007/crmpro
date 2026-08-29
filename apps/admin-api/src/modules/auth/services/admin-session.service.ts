import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminSession } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { CreateSessionInput, SessionListItem } from '../auth.types';

@Injectable()
export class AdminSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(input: CreateSessionInput) {
    return this.prisma.adminSession.create({
      data: {
        adminId: input.adminId,
        hashedRefreshToken: input.hashedRefreshToken,
        expiresAt: input.expiresAt,
        ipAddress: input.metadata.ipAddress,
        userAgent: input.metadata.userAgent,
        deviceFingerprint: input.metadata.fingerprint,
        deviceName: input.metadata.deviceName,
        country: input.metadata.country,
        city: input.metadata.city,
      },
    });
  }

  async findById(sessionId: string): Promise<AdminSession | null> {
    return this.prisma.adminSession.findUnique({
      where: { id: sessionId },
    });
  }

  assertSessionActive(session: AdminSession): void {
    if (session.revokedAt !== null) {
      throw new NotFoundException('Invalid refresh token');
    }

    if (session.expiresAt <= new Date()) {
      throw new NotFoundException('Session expired');
    }
  }

  async rotateRefreshToken(
    sessionId: string,
    hashedRefreshToken: string,
  ): Promise<void> {
    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { hashedRefreshToken },
    });
  }

  async revokeSession(sessionId: string, adminId: string): Promise<void> {
    const result = await this.prisma.adminSession.updateMany({
      where: {
        id: sessionId,
        adminId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Session not found or already revoked');
    }
  }

  async revokeCurrentSession(
    sessionId: string,
    adminId: string,
  ): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: {
        id: sessionId,
        adminId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(adminId: string): Promise<number> {
    const result = await this.prisma.adminSession.updateMany({
      where: {
        adminId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }

  async listActiveSessions(
    adminId: string,
    currentSessionId: string,
  ): Promise<SessionListItem[]> {
    const now = new Date();

    const sessions = await this.prisma.adminSession.findMany({
      where: {
        adminId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        deviceFingerprint: true,
        deviceName: true,
        country: true,
        city: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    }));
  }
}
