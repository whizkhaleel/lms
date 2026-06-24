-- ─────────────────────────────────────────────
--  Migration 012: Certificates & Gamification
--  Adds tables for PDF certificates, XP system,
--  badges, and achievement tracking.
-- ─────────────────────────────────────────────

-- ── Certificates ─────────────────────────────
-- Each student gets one certificate per completed course.

CREATE SEQUENCE seq_certificate_number START 1;

CREATE TABLE certificates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  file_id             UUID REFERENCES files(id) ON DELETE SET NULL,
  certificate_number  VARCHAR(50) UNIQUE NOT NULL,
  issued_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, course_id)
);

CREATE INDEX idx_certificates_user    ON certificates(user_id);
CREATE INDEX idx_certificates_course  ON certificates(course_id);

-- ── User XP & Levels ────────────────────────
CREATE TABLE user_xp (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_xp    INTEGER NOT NULL DEFAULT 0,
  level       INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── XP Transactions (audit trail for XP) ────
CREATE TABLE xp_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  reason        VARCHAR(100) NOT NULL,
  reference_id  UUID,     -- optional FK to lesson_progress, certificates, etc.
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_xp_tx_user ON xp_transactions(user_id);

-- ── Badge Definitions ────────────────────────
CREATE TABLE badges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  icon          VARCHAR(50),
  badge_type    VARCHAR(50) NOT NULL,  -- 'course_complete', 'streak', 'first_lesson', 'quiz_perfect', 'milestone'
  xp_required   INTEGER,              -- for level-based badges (NULL = event-based)
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── User Badges (earned) ─────────────────────
CREATE TABLE user_badges (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id  UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, badge_id)
);

CREATE INDEX idx_ub_user ON user_badges(user_id);

-- ── Add XP column to course_progress ─────────
ALTER TABLE course_progress ADD COLUMN IF NOT EXISTS xp_earned INTEGER NOT NULL DEFAULT 0;

-- ── Seed default badges ──────────────────────
INSERT INTO badges (name, description, icon, badge_type) VALUES
  ('First Steps',    'Complete your first lesson',         'play',       'first_lesson'),
  ('Quick Learner',  'Complete 5 lessons',                 'zap',        'milestone'),
  ('Dedicated',      'Complete 25 lessons',                'star',       'milestone'),
  ('Scholar',        'Complete 50 lessons',                'award',      'milestone'),
  ('Course Graduate','Complete an entire course',          'graduation', 'course_complete'),
  ('Perfect Score',  'Get 100% on a quiz',                 'check',      'quiz_perfect'),
  ('On Fire',        'Maintain a 7-day streak',            'flame',      'streak'),
  ('Unstoppable',    'Maintain a 30-day streak',           'flame',      'streak')
ON CONFLICT DO NOTHING;
