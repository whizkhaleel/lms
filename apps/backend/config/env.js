'use strict';

require('dotenv').config();

// ── Validate all required env vars at startup ──
// App crashes immediately if something is missing.
// No silent failures in production.

const required = [
  'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_DB',
  'POSTGRES_USER', 'POSTGRES_PASSWORD',
  'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD',
  'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[ENV] Missing required environment variables:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

module.exports = {
  NODE_ENV:    process.env.NODE_ENV    || 'development',
  APP_URL:     process.env.APP_URL     || 'http://localhost',
  APP_NAME:    process.env.APP_NAME    || 'LMS Platform',

  BACKEND_PORT: parseInt(process.env.BACKEND_PORT || '5000', 10),

  // Database
  POSTGRES_HOST:     process.env.POSTGRES_HOST,
  POSTGRES_PORT:     parseInt(process.env.POSTGRES_PORT, 10),
  POSTGRES_DB:       process.env.POSTGRES_DB,
  POSTGRES_USER:     process.env.POSTGRES_USER,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,

  // Redis
  REDIS_HOST:     process.env.REDIS_HOST,
  REDIS_PORT:     parseInt(process.env.REDIS_PORT, 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,

  // JWT
  JWT_ACCESS_SECRET:     process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET:    process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN  || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // File storage
  STORAGE_BACKEND: process.env.STORAGE_BACKEND || 'local',
  LMSDATA_PATH:    process.env.LMSDATA_PATH    || '/app/lmsdata',

  // MinIO
  MINIO_ENDPOINT:   process.env.MINIO_ENDPOINT  || 'minio',
  MINIO_PORT:       parseInt(process.env.MINIO_PORT || '9000', 10),
  MINIO_USE_SSL:    process.env.MINIO_USE_SSL === 'true',
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
  MINIO_BUCKET:     process.env.MINIO_BUCKET    || 'lms-files',

  // Email
  SMTP_HOST:   process.env.SMTP_HOST,
  SMTP_PORT:   parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER:   process.env.SMTP_USER,
  SMTP_PASS:   process.env.SMTP_PASS,
  EMAIL_FROM:  process.env.EMAIL_FROM,

  // Security
  BCRYPT_SALT_ROUNDS:      parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  RATE_LIMIT_WINDOW_MS:    parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
};