# LMS Production Environment Configuration Guide

This guide details all the environment variables needed in the `.env` file of the LMS project for production hosting.

## ⚠️ Important Production Rules
1. **Never commit the `.env` file** to version control (GitHub). It is already ignored in `.gitignore`.
2. **Generate strong, unique secrets** for JWT and payment webhooks using a secure random generator (e.g., running `openssl rand -hex 32` in your terminal).
3. **Use HTTPS** in production. Ensure all `APP_URL`, `API_URL`, and `FRONTEND_URL` start with `https://`.

---

## Production `.env` Reference Template

Copy the configuration below, replace the placeholder values, and save it as `.env` in the root of the LMS directory.

```ini
# ==============================================================================
# LMS Production Environment Configuration
# ==============================================================================

# ── 1. General Environment ────────────────────────────────────────────────────
NODE_ENV=production
APP_ENV=production
APP_NAME="Shaheed Mahmoud Academy"
APP_URL=https://smacademyid.cloud

# ── 2. Backend API Settings ───────────────────────────────────────────────────
BACKEND_PORT=5000
BACKEND_HOST=0.0.0.0
API_URL=https://smacademyid.cloud/api

# ── 3. Frontend Settings ──────────────────────────────────────────────────────
FRONTEND_PORT=5173
FRONTEND_URL=https://smacademyid.cloud
VITE_API_URL=/api/v1

# ── 4. Database (PostgreSQL) ──────────────────────────────────────────────────
# Choose ONE of the following options:

# Option A: Running postgres in Docker container
POSTGRES_DB=lms_prod
POSTGRES_USER=lms_prod_user
POSTGRES_PASSWORD=your_highly_secure_db_password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Option B: External PostgreSQL (uncomment and replace the URL)
# DATABASE_URL=postgresql://lms_prod_user:your_highly_secure_db_password@your-db-host.com:5432/lms_prod

# ── 5. Cache & Session (Redis) ────────────────────────────────────────────────
# Choose ONE of the following options:

# Option A: Running redis in Docker container
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_highly_secure_redis_password

# Option B: External Redis (uncomment and replace the URL)
# REDIS_URL=redis://:your_highly_secure_redis_password@your-redis-host.com:6379

# ── 6. Storage (MinIO / S3-compatible) ────────────────────────────────────────
# If using Local File Storage (default), configure these folders:
STORAGE_BACKEND=local
LMSDATA_PATH=/app/lmsdata
UPLOADS_DIR=./lmsdata/uploads
CERTIFICATES_DIR=./lmsdata/certificates
TEMP_DIR=./lmsdata/temp
PRIVATE_DIR=./lmsdata/private

# If using S3-compatible cloud storage (e.g. AWS S3, MinIO cloud server):
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_BUCKET=lms-files

# ── 7. Authentication (JWT Secrets) ──────────────────────────────────────────
# Generate these using: openssl rand -hex 32
JWT_ACCESS_SECRET=your_super_secret_jwt_access_token_generator_key
JWT_REFRESH_SECRET=your_super_secret_jwt_refresh_token_generator_key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── 8. Payments (Stripe) ──────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_replace_with_your_stripe_live_secret_key
STRIPE_WEBHOOK_SECRET=whsec_replace_with_your_stripe_live_webhook_signing_secret
STRIPE_CURRENCY=usd
PAYMENT_WEBHOOK_SECRET=your_internal_payment_webhook_secret_key

# ── 9. Email / SMTP (Transactional) ───────────────────────────────────────────
SMTP_HOST=smtp.mailgun.org            # e.g., smtp.mailgun.org, smtp.sendgrid.net
SMTP_PORT=587                         # Standard TLS port
SMTP_SECURE=false                     # false for STARTTLS (port 587); true for SSL (port 465)
SMTP_USER=postmaster@smacademyid.cloud
SMTP_PASS=your_smtp_auth_password
EMAIL_FROM=no-reply@smacademyid.cloud

# ── 10. Security Limits ───────────────────────────────────────────────────────
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000           # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100           # Limit each IP to 100 requests per window

# ── 11. Docker & Nginx Reverse Proxy Ports ────────────────────────────────────
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443

# ── 12. Telegram Bot Integration (Laravel) ────────────────────────────────────
# Token shared between LMS and Laravel Course Bot to verify communication
TELEGRAM_INTEGRATION_TOKEN=your_secure_shared_integration_token_2026
LARAVEL_BOT_URL=https://smacademyid.cloud
