-- Remove pricing columns from courses
ALTER TABLE courses
  DROP COLUMN IF EXISTS is_free,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS discount_price,
  DROP COLUMN IF EXISTS currency;

-- Remove is_free_preview from lessons (no longer needed without pricing)
ALTER TABLE lessons
  DROP COLUMN IF EXISTS is_free_preview;

DROP INDEX IF EXISTS idx_courses_is_free;

-- Remove pricing from manual_payments
ALTER TABLE manual_payments
  DROP COLUMN IF EXISTS amount,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS payment_method;

-- Remove default_currency from institution_settings
DELETE FROM institution_settings WHERE setting_key = 'default_currency';
