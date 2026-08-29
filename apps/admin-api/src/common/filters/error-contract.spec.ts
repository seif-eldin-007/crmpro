import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import {
  API_ERROR_CODES,
  mapExceptionToApiErrorResponse,
} from '@crmpro/shared/errors';

describe('Global error contract mapper (Admin API)', () => {
  it('maps validation errors to VALIDATION_ERROR with field details', () => {
    const exception = new BadRequestException({
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: {
        email: ['must be an email'],
      },
    });

    const result = mapExceptionToApiErrorResponse(exception);

    expect(result.body.error.code).toBe(API_ERROR_CODES.VALIDATION_ERROR);
    expect(result.body.success).toBe(false);
  });

  it('maps forbidden exceptions to FORBIDDEN', () => {
    const result = mapExceptionToApiErrorResponse(
      new ForbiddenException('Insufficient permissions'),
    );

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe(API_ERROR_CODES.FORBIDDEN);
  });

  it('maps Prisma unique constraint errors to CONFLICT', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: { target: ['email'] },
      },
    );

    const result = mapExceptionToApiErrorResponse(exception);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe(API_ERROR_CODES.CONFLICT);
  });

  it('maps unknown errors to INTERNAL_SERVER_ERROR', () => {
    const result = mapExceptionToApiErrorResponse(new Error('unexpected'));

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe(API_ERROR_CODES.INTERNAL_SERVER_ERROR);
  });
});
