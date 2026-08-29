import { BadRequestException, ValidationPipeOptions } from '@nestjs/common';
import { API_ERROR_CODES, formatValidationErrors } from '@crmpro/shared/errors';
import type { ValidationError } from 'class-validator';

export function createValidationPipeOptions(
  overrides: Partial<ValidationPipeOptions> = {},
): ValidationPipeOptions {
  return {
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: formatValidationErrors(errors),
      }),
    ...overrides,
  };
}
