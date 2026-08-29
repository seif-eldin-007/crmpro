import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { mapExceptionToApiErrorResponse } from '@crmpro/shared/errors';
import type { Request, Response } from 'express';

type RequestWithContext = Request & {
  requestId?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();
    const { status, body } = mapExceptionToApiErrorResponse(exception);

    if (status >= 500) {
      this.logger.error(
        {
          method: request.method,
          path: request.originalUrl ?? request.url,
          requestId: request.requestId,
          error:
            exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        },
        'Unhandled exception',
      );
    }

    response.status(status).json(body);
  }
}
