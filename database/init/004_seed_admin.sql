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
  '$2a$12$RICbTtGYVBgqHDy1OPuz9OY.HNHVeL0ZN/DDZS9q7s84nHIb8XnVi',
  'System',
  'Admin',
  'admin',
  'active',
  NOW()
) ON CONFLICT (email) DO NOTHING;
