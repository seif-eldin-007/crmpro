import { randomUUID } from 'node:crypto';
import { RequestContextService } from '../request-context.service';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('assigns a request id and returns it in the response header', () => {
    const requestContext = new RequestContextService();
    const middleware = new RequestIdMiddleware(requestContext);

    const req = {
      header: jest.fn().mockReturnValue(undefined),
    } as unknown as Parameters<RequestIdMiddleware['use']>[0];
    const res = {
      setHeader: jest.fn(),
    } as unknown as Parameters<RequestIdMiddleware['use']>[1];
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toEqual(expect.any(String));
    const setHeader = Reflect.get(res, 'setHeader') as jest.Mock;
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('reuses incoming x-request-id header', () => {
    const requestContext = new RequestContextService();
    const middleware = new RequestIdMiddleware(requestContext);
    const incomingId = randomUUID();

    const req = {
      header: jest.fn().mockReturnValue(incomingId),
    } as unknown as Parameters<RequestIdMiddleware['use']>[0];
    const res = {
      setHeader: jest.fn(),
    } as unknown as Parameters<RequestIdMiddleware['use']>[1];
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe(incomingId);
    const setHeader = Reflect.get(res, 'setHeader') as jest.Mock;
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', incomingId);
  });
});
