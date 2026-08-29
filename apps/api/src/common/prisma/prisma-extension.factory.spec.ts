import { ConfigService } from '@nestjs/config';
import { LoggingService } from '../logging/logging.service';
import {
  createSlowQueryExtension,
  logSlowQueryIfNeeded,
} from './prisma-extension.factory';

describe('logSlowQueryIfNeeded', () => {
  it('logs queries slower than the configured threshold', () => {
    const loggingService = { warn: jest.fn() };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'logging.enableQueryLogging') return true;
        if (key === 'logging.slowQueryThresholdMs') return 10;
        return undefined;
      }),
    };

    logSlowQueryIfNeeded(
      loggingService as unknown as LoggingService,
      configService as unknown as ConfigService,
      'Lead.findMany',
      25,
    );

    expect(loggingService.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'Prisma',
        operation: 'Lead.findMany',
        status: 'slow_query',
        durationMs: 25,
      }),
    );
  });

  it('skips logging when query logging is disabled', () => {
    const loggingService = { warn: jest.fn() };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'logging.enableQueryLogging') return false;
        return undefined;
      }),
    };

    logSlowQueryIfNeeded(
      loggingService as unknown as LoggingService,
      configService as unknown as ConfigService,
      'Lead.findMany',
      100,
    );

    expect(loggingService.warn).not.toHaveBeenCalled();
  });
});

describe('createSlowQueryExtension', () => {
  it('returns a prisma extension definition', () => {
    const loggingService = { warn: jest.fn() };
    const configService = { get: jest.fn().mockReturnValue(true) };

    expect(
      createSlowQueryExtension(
        loggingService as unknown as LoggingService,
        configService as unknown as ConfigService,
      ),
    ).toBeDefined();
  });
});
