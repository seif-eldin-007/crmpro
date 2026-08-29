import type { Request } from 'express';
import { LoginSessionMetadata } from '../types/login-session-metadata.type';

function getHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim();
  }

  return req.ip || req.socket.remoteAddress;
}

export function extractLoginSessionMetadata(
  req: Request,
  deviceNameFromBody?: string,
): LoginSessionMetadata {
  return {
    deviceName: deviceNameFromBody ?? getHeader(req, 'x-device-name') ?? null,
    ipAddress: getClientIp(req) ?? null,
    userAgent: getHeader(req, 'user-agent') ?? null,
  };
}
