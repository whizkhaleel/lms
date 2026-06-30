'use strict';

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DB = {
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB       || 'lms_test',
  user:     process.env.POSTGRES_USER     || 'lms_user',
  password: process.env.POSTGRES_PASSWORD || 'change_me',
};

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

async function main() {
  const pool = new Pool(DB);

  try {
    console.log('Connecting to database...');
    await pool.query('SELECT 1');
    console.log('Connected.\n');

    // ── 1. Truncate all tables ──────────────────
    console.log('Truncating all tables...');
    await pool.query(`
      DO $$ DECLARE
        tbl TEXT;
      BEGIN
        FOR tbl IN
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename NOT IN ('spatial_ref_sys')
        LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(tbl) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    console.log('All tables truncated.\n');

    // ── 2. Seed admin ───────────────────────────
    const adminEmail = 'shaheedmahmoudacademy@gmail.com';
    const adminPassword = 'SMAbr0!h@rs2026';

    console.log(`Creating admin: ${adminEmail}`);
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(adminPassword, salt);

    const adminRes = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, status, email_verified_at)
       VALUES ($1, $2, $3, $4, 'super_admin', 'active', NOW())
       RETURNING id`,
      [adminEmail, hash, 'Shaheed Mahmoud', 'Academy']
    );
    console.log(`  Admin ID: ${adminRes.rows[0].id}\n`);

    // ── 3. Seed default categories ──────────────
    console.log('Seeding default categories...');
    await pool.query(`
      INSERT INTO categories (name, slug, description, sort_order) VALUES
        ('Technology',          'technology',          'Software, hardware and IT courses', 1),
        ('Business',            'business',            'Management, entrepreneurship and finance', 2),
        ('Science',             'science',             'Biology, chemistry, physics and more', 3),
        ('Arts & Humanities',   'arts-humanities',     'Literature, history, art and philosophy', 4),
        ('Health',              'health',              'Medicine, nursing and wellness', 5),
        ('Languages',           'languages',           'English, Arabic, French and other languages', 6),
        ('Mathematics',         'mathematics',         'Calculus, statistics and applied math', 7),
        ('Personal Development','personal-development','Leadership, productivity and life skills', 8)
      ON CONFLICT (slug) DO NOTHING
    `);
    console.log('Categories seeded.\n');

    // ── 4. Seed default badges ──────────────────
    console.log('Seeding default badges...');
    await pool.query(`
      INSERT INTO badges (name, description, icon, badge_type) VALUES
        ('First Steps',    'Complete your first lesson',         'play',       'first_lesson'),
        ('Quick Learner',  'Complete 5 lessons',                 'zap',        'milestone'),
        ('Dedicated',      'Complete 25 lessons',                'star',       'milestone'),
        ('Scholar',        'Complete 50 lessons',                'award',      'milestone'),
        ('Course Graduate','Complete an entire course',          'graduation', 'course_complete'),
        ('Perfect Score',  'Get 100% on a quiz',                 'check',      'quiz_perfect'),
        ('On Fire',        'Maintain a 7-day streak',            'flame',      'streak'),
        ('Unstoppable',    'Maintain a 30-day streak',           'flame',      'streak')
      ON CONFLICT DO NOTHING
    `);
    console.log('Badges seeded.\n');

    console.log('Database reset complete.');
    console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
