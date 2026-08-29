import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/security/password.service';
import { LoginDto } from './dto/login.dto';
import { TokenService } from './token.service';
import type {
  AuthenticatedAdmin,
  LoginResult,
  RefreshResult,
  RequestSecurityMetadata,
  SanitizedAdmin,
  SessionListItem,
} from './auth.types';
import { AdminSecurityService } from './services/admin-security.service';
import { AdminSessionService } from './services/admin-session.service';
import { AuthAuditService } from './services/auth-audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly adminSessionService: AdminSessionService,
    private readonly adminSecurityService: AdminSecurityService,
    private readonly authAuditService: AuthAuditService,
  ) {}

  async login(
    loginDto: LoginDto,
    metadata: RequestSecurityMetadata,
  ): Promise<LoginResult> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: loginDto.email.toLowerCase() },
    });

    if (!admin) {
      await this.adminSecurityService.logLoginFailed(
        null,
        metadata,
        'not_found',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      await this.adminSecurityService.logLoginFailed(
        admin.id,
        metadata,
        'inactive',
      );
      throw new ForbiddenException('Admin account is inactive');
    }

    const passwordValid = await this.passwordService.verify(
      admin.passwordHash,
      loginDto.password,
    );

    if (!passwordValid) {
      await this.adminSecurityService.logLoginFailed(
        admin.id,
        metadata,
        'invalid_password',
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const rawRefreshSecret = this.tokenService.generateRawRefreshSecret();
    const hashedRefreshToken =
      await this.tokenService.hashRefreshToken(rawRefreshSecret);

    const session = await this.prisma.$transaction(async (tx) => {
      const createdSession = await tx.adminSession.create({
        data: {
          adminId: admin.id,
          hashedRefreshToken,
          expiresAt: this.tokenService.getRefreshTokenExpiresAt(),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          deviceFingerprint: metadata.fingerprint,
          deviceName: metadata.deviceName,
          country: metadata.country,
          city: metadata.city,
        },
      });

      await tx.platformAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      });

      await this.adminSecurityService.logLoginSuccess(admin.id, metadata, tx);
      await this.authAuditService.logLogin(admin.id, metadata, tx);

      return createdSession;
    });

    const accessToken = this.tokenService.generateAccessToken(
      { id: admin.id, roleId: admin.roleId },
      session.id,
    );
    const refreshToken = this.tokenService.formatRefreshToken(
      session.id,
      rawRefreshSecret,
    );

    return {
      accessToken,
      refreshToken,
      admin: this.sanitizeAdmin(admin),
    };
  }

  async refresh(
    refreshToken: string,
    metadata: RequestSecurityMetadata,
  ): Promise<RefreshResult> {
    const parsed = this.tokenService.parseRefreshToken(refreshToken);
    if (!parsed) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.adminSessionService.findById(parsed.sessionId);
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const tokenValid = await this.tokenService.verifyRefreshToken(
      parsed.rawSecret,
      session.hashedRefreshToken,
    );

    if (!tokenValid) {
      await this.prisma.$transaction(async (tx) => {
        await this.adminSecurityService.logTokenReuse(
          session.adminId,
          metadata,
          tx,
        );
        await tx.adminSession.updateMany({
          where: { adminId: session.adminId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });

      throw new UnauthorizedException('Invalid refresh token');
    }

    const admin = await this.prisma.platformAdmin.findFirst({
      where: { id: session.adminId, isActive: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRawSecret = this.tokenService.generateRawRefreshSecret();
    const newHashedRefreshToken =
      await this.tokenService.hashRefreshToken(newRawSecret);

    await this.prisma.$transaction(async (tx) => {
      await tx.adminSession.update({
        where: { id: session.id },
        data: { hashedRefreshToken: newHashedRefreshToken },
      });
      await this.adminSecurityService.logTokenRefresh(admin.id, metadata, tx);
    });

    return {
      accessToken: this.tokenService.generateAccessToken(
        { id: admin.id, roleId: admin.roleId },
        session.id,
      ),
      refreshToken: this.tokenService.formatRefreshToken(
        session.id,
        newRawSecret,
      ),
    };
  }

  async logout(
    authAdmin: AuthenticatedAdmin,
    metadata: RequestSecurityMetadata,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.adminSession.updateMany({
        where: {
          id: authAdmin.sessionId,
          adminId: authAdmin.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await this.adminSecurityService.logSessionRevoked(
        authAdmin.id,
        metadata,
        authAdmin.sessionId,
        tx,
      );
      await this.authAuditService.logLogout(
        authAdmin.id,
        authAdmin.sessionId,
        metadata,
        tx,
      );
    });
  }

  async logoutAll(
    authAdmin: AuthenticatedAdmin,
    metadata: RequestSecurityMetadata,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.adminSession.updateMany({
        where: {
          adminId: authAdmin.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await this.adminSecurityService.logSessionRevoked(
        authAdmin.id,
        metadata,
        undefined,
        tx,
      );
      await this.authAuditService.logLogoutAll(
        authAdmin.id,
        metadata,
        result.count,
        tx,
      );

      return result.count;
    });
  }

  async listSessions(
    authAdmin: AuthenticatedAdmin,
  ): Promise<SessionListItem[]> {
    return this.adminSessionService.listActiveSessions(
      authAdmin.id,
      authAdmin.sessionId,
    );
  }

  async revokeSession(
    authAdmin: AuthenticatedAdmin,
    sessionId: string,
    metadata: RequestSecurityMetadata,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.adminSession.updateMany({
        where: {
          id: sessionId,
          adminId: authAdmin.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      if (result.count === 0) {
        throw new UnauthorizedException('Session not found or already revoked');
      }

      await this.adminSecurityService.logSessionRevoked(
        authAdmin.id,
        metadata,
        sessionId,
        tx,
      );
      await this.authAuditService.logSessionRevoked(
        authAdmin.id,
        sessionId,
        metadata,
        tx,
      );
    });
  }

  async getMe(authAdmin: AuthenticatedAdmin): Promise<SanitizedAdmin> {
    const admin = await this.prisma.platformAdmin.findFirst({
      where: { id: authAdmin.id, isActive: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid authentication session');
    }

    return this.sanitizeAdmin(admin);
  }

  private sanitizeAdmin(admin: {
    id: string;
    email: string;
    fullName: string;
    roleId: string;
    isActive: boolean;
    lastLoginAt: Date | null;
  }): SanitizedAdmin {
    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      roleId: admin.roleId,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
    };
  }
}
