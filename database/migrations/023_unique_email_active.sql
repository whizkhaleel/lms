-- Replace full UNIQUE constraint on users.email with a partial unique index
-- so that soft-deleted rows (deleted_at IS NOT NULL) don't block creating
-- a new user with the same email address.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
  ON users (email)
  WHERE deleted_at IS NULL;
