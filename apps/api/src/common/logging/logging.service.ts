import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_LOG_LEVEL, LOGGING_CONFIG_KEYS } from './logging.constants';
import { LogLevel, StructuredLogEntry } from './logging.types';
import { RequestContextService } from './request-context.service';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

@Injectable()
export class LoggingService {
  private readonly logger = new Logger('StructuredLog');
  private readonly minLevel: LogLevel;

  constructor(
    private readonly requestContext: RequestContextService,
    configService: ConfigService,
  ) {
    this.minLevel = (configService.get<string>(LOGGING_CONFIG_KEYS.logLevel) ??
      DEFAULT_LOG_LEVEL) as LogLevel;
  }

  debug(entry: StructuredLogEntry): void {
    this.write('debug', entry);
  }

  info(entry: StructuredLogEntry): void {
    this.write('info', entry);
  }

  warn(entry: StructuredLogEntry): void {
    this.write('warn', entry);
  }

  error(entry: StructuredLogEntry): void {
    this.write('error', entry);
  }

  private write(level: LogLevel, entry: StructuredLogEntry): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
      return;
    }

    const context = this.requestContext.get();
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      requestId: entry.requestId ?? context.requestId,
      tenantId: entry.tenantId ?? context.tenantId,
      userId: entry.userId ?? context.userId,
      module: entry.module,
      operation: entry.operation,
      ...(entry.durationMs !== undefined && { durationMs: entry.durationMs }),
      ...(entry.status !== undefined && { status: entry.status }),
      ...(entry.metadata !== undefined && { metadata: entry.metadata }),
    };

    const message = JSON.stringify(payload);

    switch (level) {
      case 'error':
        this.logger.error(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
      case 'debug':
        this.logger.debug(message);
        break;
      default:
        this.logger.log(message);
    }
  }
}
