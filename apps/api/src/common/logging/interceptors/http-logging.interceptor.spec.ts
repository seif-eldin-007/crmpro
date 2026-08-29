import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { HttpMetricsStore } from '../http-metrics.store';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { LoggingService } from '../logging.service';
import { RequestContextService } from '../request-context.service';

describe('HttpLoggingInterceptor', () => {
  it('records completed requests and metrics', (done) => {
    const loggingService = { info: jest.fn(), error: jest.fn() };
    const requestContext = { set: jest.fn() };
    const httpMetricsStore = { recordRequest: jest.fn() };
    const configService = {
      get: jest.fn().mockReturnValue(true),
    };

    const interceptor = new HttpLoggingInterceptor(
      loggingService as unknown as LoggingService,
      requestContext as unknown as RequestContextService,
      httpMetricsStore as unknown as HttpMetricsStore,
      configService as unknown as ConfigService,
    );

    const request = {
      method: 'GET',
      originalUrl: '/api/v1/leads',
      requestId: 'req-1',
      requestStartedAt: Date.now() - 10,
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      user: { id: 'user-1', tenantId: 'tenant-1' },
    };
    const response = { statusCode: 200 };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    interceptor
      .intercept(context, {
        handle: () => of({ success: true }),
      } as CallHandler)
      .subscribe({
        complete: () => {
          expect(loggingService.info).toHaveBeenCalled();
          expect(httpMetricsStore.recordRequest).toHaveBeenCalledWith(
            expect.any(Number),
            200,
          );
          done();
        },
      });
  });

  it('records failed requests', (done) => {
    const loggingService = { info: jest.fn(), error: jest.fn() };
    const requestContext = { set: jest.fn() };
    const httpMetricsStore = { recordRequest: jest.fn() };
    const configService = { get: jest.fn().mockReturnValue(true) };

    const interceptor = new HttpLoggingInterceptor(
      loggingService as unknown as LoggingService,
      requestContext as unknown as RequestContextService,
      httpMetricsStore as unknown as HttpMetricsStore,
      configService as unknown as ConfigService,
    );

    const request = {
      method: 'POST',
      originalUrl: '/api/v1/auth/login',
      requestId: 'req-2',
      requestStartedAt: Date.now(),
      ip: '127.0.0.1',
      headers: {},
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 500 }),
      }),
    } as unknown as ExecutionContext;

    interceptor
      .intercept(context, {
        handle: () =>
          throwError(() => Object.assign(new Error('boom'), { status: 500 })),
      } as CallHandler)
      .subscribe({
        error: () => {
          expect(loggingService.error).toHaveBeenCalled();
          expect(httpMetricsStore.recordRequest).toHaveBeenCalledWith(
            expect.any(Number),
            500,
          );
          done();
        },
      });
  });
});
