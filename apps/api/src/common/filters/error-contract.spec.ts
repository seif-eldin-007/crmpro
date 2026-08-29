import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@crmpro/database';
import {
  API_ERROR_CODES,
  mapExceptionToApiErrorResponse,
} from '@crmpro/shared/errors';

describe('Global error contract mapper', () => {
  it('maps validation errors to VALIDATION_ERROR with field details', () => {
    const exception = new BadRequestException({
      code: API_ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      details: {
        email: ['must be an email'],
      },
    });

    const result = mapExceptionToApiErrorResponse(exception);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      success: false,
      error: {
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: {
          email: ['must be an email'],
        },
      },
    });
  });

  it('maps forbidden exceptions to FORBIDDEN', () => {
    const exception = new ForbiddenException('Tenant account is suspended.');

    const result = mapExceptionToApiErrorResponse(exception);

    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      success: false,
      error: {
        code: API_ERROR_CODES.FORBIDDEN,
        message: 'Tenant account is suspended.',
      },
    });
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
    expect(result.body).toEqual({
      success: false,
      error: {
        code: API_ERROR_CODES.CONFLICT,
        message: 'Email already exists',
      },
    });
  });

  it('maps unknown errors to INTERNAL_SERVER_ERROR without leaking details', () => {
    const result = mapExceptionToApiErrorResponse(
      new Error('database exploded'),
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      success: false,
      error: {
        code: API_ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'Unexpected server error',
      },
    });
  });

  it('maps generic HttpException status codes', () => {
    const exception = new NotFoundException('Lead not found');

    const result = mapExceptionToApiErrorResponse(exception);

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe(API_ERROR_CODES.NOT_FOUND);
  });
});
