import { ForbiddenException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { API_ERROR_CODES } from '@crmpro/shared/errors';
import { GlobalExceptionFilter } from './global-exception.filter';
import { LoggingService } from '../logging/logging.service';

describe('GlobalExceptionFilter (CRM API)', () => {
  let filter: GlobalExceptionFilter;
  let loggingService: { error: jest.Mock };
  let json: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    loggingService = { error: jest.fn() };
    filter = new GlobalExceptionFilter(
      loggingService as unknown as LoggingService,
    );
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
  });

  const createHost = (request: Record<string, unknown> = {}) =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/api/v1/auth/me',
          ...request,
        }),
      }),
    }) as ArgumentsHost;

  it('returns standardized forbidden responses', () => {
    filter.catch(new ForbiddenException('Access denied'), createHost());

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: API_ERROR_CODES.FORBIDDEN,
        message: 'Access denied',
      },
    });
    expect(loggingService.error).not.toHaveBeenCalled();
  });

  it('logs server errors with request context', () => {
    filter.catch(new Error('boom'), createHost({ requestId: 'req-123' }));

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: API_ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'Unexpected server error',
      },
    });
    expect(loggingService.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-123',
        metadata: expect.objectContaining({
          method: 'GET',
          path: '/api/v1/auth/me',
        }) as Record<string, unknown>,
      }),
    );
  });
});
