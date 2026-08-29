import {
  BullConfig,
  RedisConnectionConfig,
  resolveRedisConnectionConfig,
} from '../common/redis/redis.config';
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_SLOW_QUERY_THRESHOLD_MS,
} from '../common/logging/logging.constants';
import {
  DEFAULT_CLEANUP_BATCH_SIZE,
  DEFAULT_EXPORT_JOB_TIMEOUT_MINUTES,
  DEFAULT_IMPORT_JOB_TIMEOUT_MINUTES,
  DEFAULT_ORPHAN_S3_CRON,
  DEFAULT_SESSION_RETENTION_DAYS,
  DEFAULT_SESSIONS_INTERVAL_MS,
  DEFAULT_STALE_JOBS_INTERVAL_MS,
  DEFAULT_UPLOAD_INTENT_TTL_MINUTES,
  DEFAULT_UPLOAD_INTENTS_INTERVAL_MS,
} from '../modules/cleanup/cleanup.constants';
import type { CleanupConfig } from '../modules/cleanup/cleanup.types';

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === '1';
}

export default () => {
  const redisConnection = resolveRedisConnectionConfig({
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  });

  return {
    app: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      version: process.env.API_VERSION ?? '1.0.0',
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    monitoring: {
      internalKey: process.env.INTERNAL_MONITORING_KEY,
    },
    redis: {
      url: process.env.REDIS_URL,
      ...redisConnection,
    } satisfies RedisConnectionConfig & { url?: string },
    logging: {
      logLevel: process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
      enableHttpLogging: parseBoolean(process.env.ENABLE_HTTP_LOGGING, true),
      enableWorkerLogging: parseBoolean(
        process.env.ENABLE_WORKER_LOGGING,
        true,
      ),
      enableQueryLogging: parseBoolean(process.env.ENABLE_QUERY_LOGGING, true),
      enableStorageLogging: parseBoolean(
        process.env.ENABLE_STORAGE_LOGGING,
        true,
      ),
      enableAuthLogging: parseBoolean(process.env.ENABLE_AUTH_LOGGING, true),
      slowQueryThresholdMs: parseInt(
        process.env.SLOW_QUERY_THRESHOLD_MS ??
          String(DEFAULT_SLOW_QUERY_THRESHOLD_MS),
        10,
      ),
    },
    bull: {
      prefix: process.env.BULL_PREFIX ?? 'crmpro',
      importConcurrency: parseInt(
        process.env.BULL_IMPORT_CONCURRENCY ?? '3',
        10,
      ),
      exportConcurrency: parseInt(
        process.env.BULL_EXPORT_CONCURRENCY ?? '2',
        10,
      ),
      cleanupConcurrency: parseInt(
        process.env.BULL_CLEANUP_CONCURRENCY ?? '1',
        10,
      ),
      notificationConcurrency: parseInt(
        process.env.BULL_NOTIFICATION_CONCURRENCY ?? '5',
        10,
      ),
      jobAttempts: parseInt(process.env.BULL_JOB_ATTEMPTS ?? '3', 10),
      jobBackoffDelayMs: parseInt(
        process.env.BULL_JOB_BACKOFF_DELAY_MS ?? '3000',
        10,
      ),
    } satisfies BullConfig,
    cleanup: {
      uploadIntentTtlMinutes: parseInt(
        process.env.UPLOAD_INTENT_TTL_MINUTES ??
          String(DEFAULT_UPLOAD_INTENT_TTL_MINUTES),
        10,
      ),
      importJobTimeoutMinutes: parseInt(
        process.env.IMPORT_JOB_TIMEOUT_MINUTES ??
          String(DEFAULT_IMPORT_JOB_TIMEOUT_MINUTES),
        10,
      ),
      exportJobTimeoutMinutes: parseInt(
        process.env.EXPORT_JOB_TIMEOUT_MINUTES ??
          String(DEFAULT_EXPORT_JOB_TIMEOUT_MINUTES),
        10,
      ),
      sessionRetentionDays: parseInt(
        process.env.SESSION_RETENTION_DAYS ??
          String(DEFAULT_SESSION_RETENTION_DAYS),
        10,
      ),
      batchSize: parseInt(
        process.env.CLEANUP_BATCH_SIZE ?? String(DEFAULT_CLEANUP_BATCH_SIZE),
        10,
      ),
      schedules: {
        uploadIntentsIntervalMs: parseInt(
          process.env.CLEANUP_UPLOAD_INTENTS_INTERVAL_MS ??
            String(DEFAULT_UPLOAD_INTENTS_INTERVAL_MS),
          10,
        ),
        staleJobsIntervalMs: parseInt(
          process.env.CLEANUP_STALE_JOBS_INTERVAL_MS ??
            String(DEFAULT_STALE_JOBS_INTERVAL_MS),
          10,
        ),
        sessionsIntervalMs: parseInt(
          process.env.CLEANUP_SESSIONS_INTERVAL_MS ??
            String(DEFAULT_SESSIONS_INTERVAL_MS),
          10,
        ),
        orphanS3Cron:
          process.env.CLEANUP_ORPHAN_S3_CRON ?? DEFAULT_ORPHAN_S3_CRON,
      },
    } satisfies CleanupConfig,
    auth: {
      accessSecret: process.env.JWT_ACCESS_SECRET,
      accessExpiration: process.env.JWT_ACCESS_EXPIRATION ?? '15m',
      refreshTokenExpiration:
        process.env.REFRESH_TOKEN_EXPIRATION ??
        process.env.JWT_REFRESH_EXPIRATION ??
        '7d',
    },
    cors: {
      origins: (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    },
    storage: {
      region: process.env.AWS_REGION,
      bucket: process.env.AWS_S3_BUCKET,
      endpoint: process.env.AWS_S3_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    analytics: {
      cacheTtlSeconds: parseInt(
        process.env.ANALYTICS_CACHE_TTL_SECONDS ?? '300',
        10,
      ),
    },
    notifications: {
      unreadCountTtlSeconds: parseInt(
        process.env.NOTIFICATION_UNREAD_TTL_SECONDS ?? '60',
        10,
      ),
    },
  };
};
