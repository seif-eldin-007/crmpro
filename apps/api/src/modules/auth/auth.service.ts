import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserSession } from '@crmpro/database';
import { AuthLoggingService } from '../../common/logging/auth-logging.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/security/password.service';
import { TenantAccessService } from '../../common/tenant-access/tenant-access.service';
import { UsersService, UserWithRoleAndTenant } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { TokenService } from './token.service';
import { LoginResult } from './types/login-result.type';
import { LoginSessionMetadata } from './types/login-session-metadata.type';
import { AuthenticatedUser } from './types/jwt-payload.type';
import { RefreshResult } from './types/refresh-result.type';
import { SanitizedUser } from './types/sanitized-user.type';
import { SessionListItem } from './types/session-list-item.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
    private readonly authLoggingService: AuthLoggingService,
    private readonly tenantAccessService: TenantAccessService,
  ) {}

  async login(
    loginDto: LoginDto,
    sessionMetadata: LoginSessionMetadata,
  ): Promise<LoginResult> {
    const user = await this.validateCredentials(loginDto, sessionMetadata);
    await this.tenantAccessService.assertTenantAccessible(user.tenantId);

    const rawRefreshSecret = this.tokenService.generateRawRefreshSecret();
    const hashedRefreshToken =
      await this.tokenService.hashRefreshToken(rawRefreshSecret);

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        hashedRefreshToken,
        expiresAt: this.tokenService.getRefreshTokenExpiresAt(),
        deviceName: sessionMetadata.deviceName,
        ipAddress: sessionMetadata.ipAddress,
        userAgent: sessionMetadata.userAgent,
      },
    });

    const accessToken = this.tokenService.generateAccessToken(
      {
        id: user.id,
        tenantId: user.tenantId,
        roleId: user.roleId,
      },
      session.id,
    );

    const refreshToken = this.tokenService.formatRefreshToken(
      session.id,
      rawRefreshSecret,
    );

    this.authLoggingService.loginSuccess({
      userId: user.id,
      tenantId: user.tenantId,
      ip: sessionMetadata.ipAddress ?? undefined,
      device: sessionMetadata.deviceName ?? undefined,
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    const parsed = this.tokenService.parseRefreshToken(refreshToken);
    if (!parsed) {
      this.authLoggingService.refreshFailure({ reason: 'malformed_token' });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: parsed.sessionId },
    });

    if (!session) {
      this.authLoggingService.refreshFailure({
        reason: 'session_not_found',
        sessionId: parsed.sessionId,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    this.assertSessionActive(session);

    const tokenValid = await this.tokenService.verifyRefreshToken(
      parsed.rawSecret,
      session.hashedRefreshToken,
    );
    if (!tokenValid) {
      // The session is still active but the presented token does not match
      // the current rotation — a previously rotated token is being replayed.
      // Treat this as token theft: revoke every session of the user.
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      this.authLoggingService.refreshFailure({
        reason: 'refresh_token_reuse',
        sessionId: session.id,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(session.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    this.assertUserActive(user);
    await this.tenantAccessService.assertTenantAccessible(user.tenantId);

    const newRawSecret = this.tokenService.generateRawRefreshSecret();
    const newHashedRefreshToken =
      await this.tokenService.hashRefreshToken(newRawSecret);

    const rotated = await this.prisma.userSession.updateMany({
      where: {
        id: session.id,
        hashedRefreshToken: session.hashedRefreshToken,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { hashedRefreshToken: newHashedRefreshToken },
    });

    if (rotated.count !== 1) {
      this.authLoggingService.refreshFailure({
        reason: 'refresh_token_replay',
        sessionId: session.id,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRefreshToken = this.tokenService.formatRefreshToken(
      session.id,
      newRawSecret,
    );
    const accessToken = this.tokenService.generateAccessToken(
      {
        id: user.id,
        tenantId: user.tenantId,
        roleId: user.roleId,
      },
      session.id,
    );

    this.authLoggingService.refreshSuccess({
      userId: user.id,
      tenantId: user.tenantId,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(authUser: AuthenticatedUser): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: {
        id: authUser.sessionId,
        userId: authUser.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    this.authLoggingService.logout({
      userId: authUser.id,
      tenantId: authUser.tenantId,
      sessionId: authUser.sessionId,
    });
  }

  async logoutAll(authUser: AuthenticatedUser): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: {
        userId: authUser.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    this.authLoggingService.logoutAll({
      userId: authUser.id,
      tenantId: authUser.tenantId,
      revokedSessions: result.count,
    });

    return result.count;
  }

  async listSessions(authUser: AuthenticatedUser): Promise<SessionListItem[]> {
    const now = new Date();

    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId: authUser.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === authUser.sessionId,
    }));
  }

  async getMe(authUser: AuthenticatedUser): Promise<SanitizedUser> {
    const user = await this.usersService.findById(authUser.id);
    if (!user) {
      throw new UnauthorizedException('Invalid authentication session');
    }

    return this.sanitizeUser(user);
  }

  private assertSessionActive(session: UserSession): void {
    if (session.revokedAt !== null) {
      this.authLoggingService.sessionRevoked({
        sessionId: session.id,
        reason: 'revoked',
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt <= new Date()) {
      this.authLoggingService.sessionRevoked({
        sessionId: session.id,
        reason: 'expired',
      });
      throw new UnauthorizedException('Session expired');
    }
  }

  private assertUserActive(user: UserWithRoleAndTenant): void {
    if (user.deletedAt !== null || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tenant = user.tenant;
    if (!tenant || tenant.deletedAt !== null) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async validateCredentials(
    loginDto: LoginDto,
    sessionMetadata: LoginSessionMetadata,
  ): Promise<UserWithRoleAndTenant> {
    const { tenantSlug, email, password } = loginDto;

    const tenant = await this.usersService.findTenantBySlug(tenantSlug);
    if (!tenant) {
      this.authLoggingService.loginFailure({
        email,
        tenantSlug,
        ip: sessionMetadata.ipAddress ?? undefined,
        device: sessionMetadata.deviceName ?? undefined,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.usersService.findByTenantAndEmail(
      tenantSlug,
      email,
    );
    if (!user || user.deletedAt !== null || !user.isActive) {
      this.authLoggingService.loginFailure({
        email,
        tenantSlug,
        ip: sessionMetadata.ipAddress ?? undefined,
        device: sessionMetadata.deviceName ?? undefined,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await this.passwordService.verify(
      user.passwordHash,
      password,
    );
    if (!passwordValid) {
      this.authLoggingService.loginFailure({
        email,
        tenantSlug,
        ip: sessionMetadata.ipAddress ?? undefined,
        device: sessionMetadata.deviceName ?? undefined,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  private sanitizeUser(user: UserWithRoleAndTenant): SanitizedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      role: {
        id: user.role.id,
        name: user.role.name,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        status: user.tenant.status,
      },
    };
  }
}
