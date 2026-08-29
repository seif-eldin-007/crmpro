export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3100', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    version: process.env.API_VERSION ?? '1.0.0',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  tenantApi: {
    baseUrl: process.env.TENANT_API_URL ?? 'http://localhost:3000/api/v1',
    internalMonitoringKey: process.env.INTERNAL_MONITORING_KEY,
  },
  jobs: {
    stuckTimeoutMinutes: parseInt(
      process.env.STUCK_JOB_TIMEOUT_MINUTES ?? '15',
      10,
    ),
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? '30d',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
});
