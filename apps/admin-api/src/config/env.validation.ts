import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3100),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().optional(),
  TENANT_API_URL: Joi.string().uri().optional(),
  INTERNAL_MONITORING_KEY: Joi.string().min(16).optional(),
  STUCK_JOB_TIMEOUT_MINUTES: Joi.number().integer().min(1).optional(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRATION: Joi.string().default('30d'),
  REFRESH_COOKIE_CROSS_ORIGIN: Joi.string()
    .valid('true', 'false', '1', '0')
    .optional(),
  CORS_ORIGINS: Joi.string().optional(),
  API_VERSION: Joi.string().optional(),
});
