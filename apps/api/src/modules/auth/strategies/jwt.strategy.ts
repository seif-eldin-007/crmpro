import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantAccessService } from '../../../common/tenant-access/tenant-access.service';
import { UsersService } from '../../users/users.service';
import {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly tenantAccessService: TenantAccessService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.accessSecret'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    if (!this.isValidPayload(payload)) {
      throw new UnauthorizedException('Invalid authentication session');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.deletedAt !== null || !user.isActive) {
      this.logger.warn(`Auth rejected for user ${payload.sub}`);
      throw new UnauthorizedException('Invalid authentication session');
    }

    if (user.tenantId !== payload.tenantId || user.roleId !== payload.roleId) {
      this.logger.warn(`Auth payload mismatch for user ${payload.sub}`);
      throw new UnauthorizedException('Invalid authentication session');
    }

    const tenant = user.tenant;
    if (!tenant || tenant.deletedAt !== null) {
      throw new UnauthorizedException('Invalid authentication session');
    }

    await this.tenantAccessService.assertTenantAccessible(user.tenantId);

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
    });

    if (!session || session.userId !== payload.sub) {
      this.logger.warn(`Invalid session for user ${payload.sub}`);
      throw new UnauthorizedException('Invalid authentication session');
    }

    if (session.revokedAt !== null) {
      this.logger.warn(`Revoked session rejected for user ${payload.sub}`);
      throw new UnauthorizedException('Invalid authentication session');
    }

    if (session.expiresAt <= new Date()) {
      this.logger.warn(`Expired session rejected for user ${payload.sub}`);
      throw new UnauthorizedException('Invalid authentication session');
    }

    this.logger.log(`Auth validated for user ${payload.sub}`);

    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      roleId: payload.roleId,
      sessionId: payload.sessionId,
    };
  }

  private isValidPayload(
    payload: AccessTokenPayload,
  ): payload is AccessTokenPayload {
    return (
      typeof payload?.sub === 'string' &&
      typeof payload?.tenantId === 'string' &&
      typeof payload?.roleId === 'string' &&
      typeof payload?.sessionId === 'string'
    );
  }
}
