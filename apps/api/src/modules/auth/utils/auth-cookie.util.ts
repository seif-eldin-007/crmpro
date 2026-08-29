import type { Response } from 'express';
import {
  buildRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from '../constants/auth-cookie.constants';

export interface RefreshCookieRuntimeConfig {
  nodeEnv: string;
  refreshTokenExpiration: string;
}

function resolveCookieOptions(
  config: RefreshCookieRuntimeConfig,
): ReturnType<typeof buildRefreshCookieOptions> {
  return buildRefreshCookieOptions(
    config.nodeEnv,
    config.refreshTokenExpiration,
  );
}

export function setRefreshCookie(
  response: Response,
  token: string,
  config: RefreshCookieRuntimeConfig,
): void {
  response.cookie(REFRESH_COOKIE_NAME, token, resolveCookieOptions(config));
}

export function clearRefreshCookie(
  response: Response,
  config: RefreshCookieRuntimeConfig,
): void {
  const options = resolveCookieOptions(config);
  response.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });
}
