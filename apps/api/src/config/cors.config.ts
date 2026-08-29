export const DEV_CORS_ORIGINS = [
  'http://localhost:3001',
  'http://localhost:3002',
];

/**
 * Resolve the allowed CORS origins.
 *
 * Fail-closed: in production a non-empty CORS_ORIGINS is mandatory. In
 * development we fall back to the known local frontend origins so the dev
 * stack keeps working without extra configuration.
 */
export function resolveCorsOrigins(
  nodeEnv: string,
  configuredOrigins: string[],
): string[] {
  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'CORS_ORIGINS must be set in production (comma-separated list of allowed origins)',
    );
  }

  return DEV_CORS_ORIGINS;
}
