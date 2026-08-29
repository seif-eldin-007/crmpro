import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PublicAdminRoute } from '../../common/auth';
import { AdminPermissionsService } from '../../common/auth/services/admin-permissions.service';
import { toListResponseData } from '../../common/http/list-response';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE_NAME } from './constants/auth-cookie.constants';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginAttemptLimiterService } from './services/login-attempt-limiter.service';
import type { AuthenticatedAdmin, LoginResult } from './auth.types';
import {
  clearRefreshCookie,
  setRefreshCookie,
  type RefreshCookieRuntimeConfig,
} from './utils/auth-cookie.util';
import { extractRequestSecurityMetadata } from './utils/request-metadata.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminPermissionsService: AdminPermissionsService,
    private readonly configService: ConfigService,
    private readonly loginAttemptLimiter: LoginAttemptLimiterService,
  ) {}

  private getRefreshCookieConfig(): RefreshCookieRuntimeConfig {
    return {
      nodeEnv: this.configService.get<string>('app.nodeEnv') ?? 'development',
      refreshTokenExpiration: this.configService.getOrThrow<string>(
        'auth.refreshExpiration',
      ),
    };
  }

  @Post('login')
  @Throttle({
    default: { limit: 10, ttl: 60_000 },
    hourly: { limit: 20, ttl: 3_600_000 },
  })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? 'unknown';

    this.loginAttemptLimiter.assertBelowLimit(ip, loginDto.email);

    let result: LoginResult;
    try {
      result = await this.authService.login(
        loginDto,
        extractRequestSecurityMetadata(req, loginDto.deviceName),
      );
    } catch (error) {
      this.loginAttemptLimiter.recordFailure(ip, loginDto.email);
      throw error;
    }

    this.loginAttemptLimiter.reset(ip, loginDto.email);
    setRefreshCookie(res, result.refreshToken, this.getRefreshCookieConfig());

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken: result.accessToken,
        admin: result.admin,
      },
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @PublicAdminRoute()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as
      | Record<string, string | undefined>
      | undefined;
    const refreshToken = cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const result = await this.authService.refresh(
      refreshToken,
      extractRequestSecurityMetadata(req),
    );

    setRefreshCookie(res, result.refreshToken, this.getRefreshCookieConfig());

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: result.accessToken,
      },
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @PublicAdminRoute()
  async logout(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(admin, extractRequestSecurityMetadata(req));
    clearRefreshCookie(res, this.getRefreshCookieConfig());

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @PublicAdminRoute()
  async logoutAll(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const revokedSessions = await this.authService.logoutAll(
      admin,
      extractRequestSecurityMetadata(req),
    );
    clearRefreshCookie(res, this.getRefreshCookieConfig());

    return {
      success: true,
      message: 'Logged out from all devices',
      data: { revokedSessions },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @PublicAdminRoute()
  async getMe(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const profile = await this.authService.getMe(admin);

    return {
      success: true,
      data: profile,
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @PublicAdminRoute()
  async listSessions(@CurrentAdmin() admin: AuthenticatedAdmin) {
    const sessions = await this.authService.listSessions(admin);

    return {
      success: true,
      data: toListResponseData(sessions),
    };
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @PublicAdminRoute()
  async revokeSession(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Req() req: Request,
  ) {
    await this.authService.revokeSession(
      admin,
      sessionId,
      extractRequestSecurityMetadata(req),
    );

    return {
      success: true,
      message: 'Session revoked successfully',
    };
  }

  @Get('permissions')
  @UseGuards(JwtAuthGuard)
  @PublicAdminRoute()
  async getPermissions(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const authorization =
      await this.adminPermissionsService.getAdminAuthorization(admin.id);

    if (!req.permissionKeys) {
      req.permissionKeys = new Set(authorization.permissions);
    }

    return {
      success: true,
      data: authorization,
    };
  }
}
