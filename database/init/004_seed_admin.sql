-- ─────────────────────────────────────────────
--  Seed 001 — Admin User
--  Password: SMAbr0!h@rs2026 (bcrypt hash)
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
  'shaheedmahmoudacademy@gmail.com',
  -- bcrypt hash of 'SMAbr0!h@rs2026' with 12 rounds
  '$2b$12$n3Gya3/acKelghHlZIy77O4pZLv3w/LqAVaVZ3ebG1YTvVcgjHTR.',
  'Shaheed Mahmoud',
  'Academy',
  'super_admin',
  'active',
  NOW()
) ON CONFLICT (email) DO NOTHING;
