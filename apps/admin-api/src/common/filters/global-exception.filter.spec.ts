import { ForbiddenException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { API_ERROR_CODES } from '@crmpro/shared/errors';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter (Admin API)', () => {
  let filter: GlobalExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
  });

  const createHost = () =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/api/v1/admins',
        }),
      }),
    }) as ArgumentsHost;

  it('returns standardized forbidden responses', () => {
    filter.catch(
      new ForbiddenException('Insufficient permissions'),
      createHost(),
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: API_ERROR_CODES.FORBIDDEN,
        message: 'Insufficient permissions',
      },
    });
  });

  it('returns standardized internal server error responses', () => {
    filter.catch(new Error('unexpected failure'), createHost());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: API_ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'Unexpected server error',
      },
    });
  });
});
