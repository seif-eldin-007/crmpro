import ms, { StringValue } from 'ms';

export const REFRESH_COOKIE_NAME = 'crmpro_admin_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export type RefreshCookieSameSite = 'lax' | 'none';

export interface RefreshCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: RefreshCookieSameSite;
  path: string;
  maxAge: number;
}

export function getRefreshCookieMaxAgeMs(
  refreshTokenExpiration: string,
): number {
  const duration = ms(refreshTokenExpiration as StringValue);

  if (duration === undefined) {
    throw new Error('Invalid JWT_REFRESH_EXPIRATION');
  }

  return duration;
}

/**
 * Cookie flags for the platform admin refresh token.
 *
 * Default (same-origin / proxied web): SameSite=Lax — works for localhost
 * proxy and production when the browser talks to one origin.
 *
 * Set REFRESH_COOKIE_CROSS_ORIGIN=true when the SPA calls the API on a
 * different site in production (HTTPS required: SameSite=None; Secure).
 */
export function buildRefreshCookieOptions(
  nodeEnv: string,
  refreshTokenExpiration: string,
  crossOrigin = process.env.REFRESH_COOKIE_CROSS_ORIGIN === 'true',
): RefreshCookieOptions {
  const isProduction = nodeEnv === 'production';
  const useCrossOrigin = isProduction && crossOrigin;

  return {
    httpOnly: true,
    secure: isProduction || useCrossOrigin,
    sameSite: useCrossOrigin ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: getRefreshCookieMaxAgeMs(refreshTokenExpiration),
  };
}
