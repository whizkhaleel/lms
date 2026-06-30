-- ─────────────────────────────────────────────
--  Migration 025 — Replace old seed accounts
--  Removes all old demo/seed user accounts and
--  creates the production admin.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  old_ids UUID[];
  new_admin_id UUID;
  tbl RECORD;
  col RECORD;
BEGIN
  -- Collect all old user IDs
  old_ids := ARRAY(
    SELECT id FROM users WHERE email IN (
      'admin@lms.local',
      'james@demo.lms', 'sarah@demo.lms', 'marcus@demo.lms',
      'alice@demo.lms', 'bob@demo.lms', 'chiara@demo.lms',
      'david@demo.lms', 'emma@demo.lms'
    )
  );

  -- Get or create the new admin ID
  SELECT id INTO new_admin_id FROM users WHERE email = 'shaheedmahmoudacademy@gmail.com';

  IF new_admin_id IS NULL THEN
    UPDATE users
    SET email = 'shaheedmahmoudacademy@gmail.com',
        password_hash = '$2b$12$n3Gya3/acKelghHlZIy77O4pZLv3w/LqAVaVZ3ebG1YTvVcgjHTR.',
        first_name = 'Shaheed Mahmoud',
        last_name = 'Academy',
        role = 'super_admin',
        status = 'active',
        email_verified_at = NOW()
    WHERE email = 'admin@lms.local'
    RETURNING id INTO new_admin_id;
  END IF;

  -- Reassign all FK references from old users to the new admin
  -- This handles every table that references users.id
  FOR tbl IN
    SELECT conrelid::regclass AS table_name,
           a.attname AS fk_column
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    WHERE c.confrelid = 'users'::regclass
      AND c.contype = 'f'
      AND c.confdeltype != 'c'  -- skip CASCADE (handled automatically)
    ORDER BY conrelid::regclass::text
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = $1 WHERE %I = ANY($2)',
      tbl.table_name, tbl.fk_column, tbl.fk_column
    ) USING new_admin_id, old_ids;
  END LOOP;

  -- Delete old seed users (CASCADE handles remaining refs)
  DELETE FROM users WHERE id = ANY(old_ids);

  -- Update institution settings email
  UPDATE institution_settings
  SET setting_value = 'shaheedmahmoudacademy@gmail.com'
  WHERE setting_key = 'institution_email';

  RAISE NOTICE 'Migration 025 complete. Replaced % old accounts.', array_length(old_ids, 1);
END $$;
