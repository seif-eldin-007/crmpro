import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { mapExceptionToApiErrorResponse } from '@crmpro/shared/errors';
import type { Request, Response } from 'express';
import { LoggingService } from '../logging/logging.service';

type RequestWithContext = Request & {
  requestId?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly loggingService: LoggingService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();
    const { status, body } = mapExceptionToApiErrorResponse(exception);

    if (status >= 500) {
      this.loggingService.error({
        module: 'Http',
        operation: 'Unhandled Exception',
        requestId: request.requestId,
        status: status.toString(),
        metadata: {
          method: request.method,
          path: request.originalUrl ?? request.url,
          error:
            exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        },
      });
    }

    response.status(status).json(body);
  }
}
