import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { toListResponseData } from '../../common/http/list-response';
import { PermissionsService } from '../../common/auth/services/permissions.service';
import { REFRESH_COOKIE_NAME } from './constants/auth-cookie.constants';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './types/jwt-payload.type';
import {
  clearRefreshCookie,
  setRefreshCookie,
  type RefreshCookieRuntimeConfig,
} from './utils/auth-cookie.util';
import { extractLoginSessionMetadata } from './utils/request-metadata.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionsService: PermissionsService,
    private readonly configService: ConfigService,
  ) {}

  private getRefreshCookieConfig(): RefreshCookieRuntimeConfig {
    return {
      nodeEnv: this.configService.get<string>('app.nodeEnv') ?? 'development',
      refreshTokenExpiration: this.configService.getOrThrow<string>(
        'auth.refreshTokenExpiration',
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
    const result = await this.authService.login(
      loginDto,
      extractLoginSessionMetadata(req, loginDto.deviceName),
    );

    setRefreshCookie(res, result.refreshToken, this.getRefreshCookieConfig());

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const result = await this.authService.refresh(refreshToken);

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
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user);
    clearRefreshCookie(res, this.getRefreshCookieConfig());

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const revokedSessions = await this.authService.logoutAll(user);
    clearRefreshCookie(res, this.getRefreshCookieConfig());

    return {
      success: true,
      message: 'Logged out from all devices',
      revokedSessions,
    };
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    const sessions = await this.authService.listSessions(user);

    return {
      success: true,
      data: toListResponseData(sessions),
    };
  }

  @Get('permissions')
  @UseGuards(JwtAuthGuard)
  async getPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const authorization = await this.permissionsService.getUserAuthorization(
      user.id,
      user.tenantId,
    );

    if (!req.permissionKeys) {
      req.permissionKeys = new Set(authorization.permissions);
    }

    return {
      success: true,
      data: authorization,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.authService.getMe(user);

    return {
      success: true,
      data: profile,
    };
  }
}
