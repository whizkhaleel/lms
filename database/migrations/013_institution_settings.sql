-- Migration 013: Institution settings table

CREATE TABLE IF NOT EXISTS institution_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO institution_settings (setting_key, setting_value) VALUES
  ('institution_name', 'Shaheed Mahmoud Academy'),
  ('institution_tagline', 'Empowering Education'),
   ('institution_email', 'shaheedmahmoudacademy@gmail.com'),
  ('institution_phone', ''),
  ('institution_address', ''),
  ('institution_website', ''),
  ('institution_logo_url', ''),
  ('academic_year', '2025/2026'),
  ('default_timezone', 'Africa/Lagos'),
  ('default_currency', 'NGN')
ON CONFLICT (setting_key) DO NOTHING;
