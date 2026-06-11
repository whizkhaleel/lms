-- ─────────────────────────────────────────────
--  Seed 001 — Default Admin User
--  Password: Admin@12345 (bcrypt hash)
--  CHANGE THIS IMMEDIATELY after first login.
-- ─────────────────────────────────────────────

INSERT INTO users (
  id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  status,
  email_verified_at
) VALUES (
  gen_random_uuid(),
  'admin@lms.local',
  -- bcrypt hash of 'Admin@12345' with 12 rounds
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCgNPGVwQdMFUb.Vs8fxeHG',
  'System',
  'Admin',
  'admin',
  'active',
  NOW()
) ON CONFLICT (email) DO NOTHING;
