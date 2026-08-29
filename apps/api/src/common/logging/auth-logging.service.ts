import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOGGING_CONFIG_KEYS } from './logging.constants';
import { LoggingService } from './logging.service';

@Injectable()
export class AuthLoggingService {
  private readonly enabled: boolean;

  constructor(
    private readonly loggingService: LoggingService,
    configService: ConfigService,
  ) {
    this.enabled =
      configService.get<boolean>(LOGGING_CONFIG_KEYS.enableAuthLogging) ?? true;
  }

  loginSuccess(params: {
    userId: string;
    tenantId: string;
    ip?: string;
    device?: string;
  }): void {
    this.log('login_success', params);
  }

  loginFailure(params: {
    email: string;
    tenantSlug: string;
    ip?: string;
    device?: string;
  }): void {
    this.log('login_failure', params, 'warn');
  }

  refreshSuccess(params: {
    userId: string;
    tenantId: string;
    sessionId: string;
  }): void {
    this.log('refresh_success', params);
  }

  refreshFailure(params: { reason: string; sessionId?: string }): void {
    this.log('refresh_failure', params, 'warn');
  }

  logout(params: {
    userId: string;
    tenantId: string;
    sessionId: string;
  }): void {
    this.log('logout', params);
  }

  logoutAll(params: {
    userId: string;
    tenantId: string;
    revokedSessions: number;
  }): void {
    this.log('logout_all', params);
  }

  sessionRevoked(params: { sessionId: string; reason: string }): void {
    this.log('session_revoked', params, 'warn');
  }

  private log(
    operation: string,
    metadata: Record<string, unknown>,
    level: 'info' | 'warn' = 'info',
  ): void {
    if (!this.enabled) {
      return;
    }

    const entry = {
      module: 'Auth',
      operation,
      userId: typeof metadata.userId === 'string' ? metadata.userId : undefined,
      tenantId:
        typeof metadata.tenantId === 'string' ? metadata.tenantId : undefined,
      status: operation,
      metadata,
    };

    if (level === 'warn') {
      this.loggingService.warn(entry);
      return;
    }

    this.loggingService.info(entry);
  }
}
