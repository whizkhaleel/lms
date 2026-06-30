-- ─────────────────────────────────────────────
--  Migration 006 — Progress Tracking
--
--  Three tables work together:
--    lesson_progress   → per-lesson watch state (the heartbeat)
--    course_progress   → denormalized course-level snapshot (fast dashboard)
--    video_bookmarks   → student-placed bookmarks inside a video
-- ─────────────────────────────────────────────

-- ── Lesson Progress ───────────────────────────
-- One row per (student × lesson). Updated on every heartbeat.
CREATE TABLE IF NOT EXISTS lesson_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id           UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrollment_id       UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,

  -- Watch position — where the student last stopped
  watch_position_secs INTEGER NOT NULL DEFAULT 0,

  -- Total seconds actually watched (deduplicated — scrubbing doesn't inflate it)
  watched_secs        INTEGER NOT NULL DEFAULT 0,

  -- Completion
  is_completed        BOOLEAN NOT NULL DEFAULT false,
  completed_at        TIMESTAMP,

  -- How many times this lesson was started
  play_count          INTEGER NOT NULL DEFAULT 0,

  first_watched_at    TIMESTAMP,
  last_watched_at     TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, lesson_id)   -- one progress row per student per lesson
);

CREATE INDEX IF NOT EXISTS idx_lp_user_id     ON lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lp_lesson_id   ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lp_course_id   ON lesson_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_lp_enrollment  ON lesson_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_lp_completed   ON lesson_progress(is_completed);

CREATE TRIGGER trg_lesson_progress_updated_at
  BEFORE UPDATE ON lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Course Progress ───────────────────────────
-- Denormalized snapshot per (student × course).
-- Recomputed whenever a lesson is marked complete.
-- Exists so the dashboard never needs a slow aggregate query.
CREATE TABLE IF NOT EXISTS course_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrollment_id       UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,

  total_lessons       INTEGER NOT NULL DEFAULT 0,
  completed_lessons   INTEGER NOT NULL DEFAULT 0,

  -- 0-100 integer percentage
  percent_complete    INTEGER NOT NULL DEFAULT 0
    CHECK (percent_complete BETWEEN 0 AND 100),

  -- Total seconds watched across all lessons
  total_watched_secs  INTEGER NOT NULL DEFAULT 0,

  -- Streak tracking
  current_streak_days  INTEGER NOT NULL DEFAULT 0,
  longest_streak_days  INTEGER NOT NULL DEFAULT 0,
  last_activity_date   DATE,

  -- Course completion
  is_completed        BOOLEAN NOT NULL DEFAULT false,
  completed_at        TIMESTAMP,

  started_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_user_id    ON course_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_cp_course_id  ON course_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_cp_completed  ON course_progress(is_completed);

CREATE TRIGGER trg_course_progress_updated_at
  BEFORE UPDATE ON course_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Video Bookmarks ───────────────────────────
-- Students can drop named bookmarks inside a video lesson.
CREATE TABLE IF NOT EXISTS video_bookmarks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position_secs INTEGER NOT NULL,
  label      VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vb_user_lesson ON video_bookmarks(user_id, lesson_id);

-- ── Initialise course_progress on new enrollment ──
-- When a student enrolls, seed a course_progress row immediately.
-- This avoids a LEFT JOIN miss on the dashboard.
CREATE OR REPLACE FUNCTION init_course_progress()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO course_progress (
    user_id, course_id, enrollment_id, total_lessons
  )
  SELECT
    NEW.user_id,
    NEW.course_id,
    NEW.id,
    (SELECT COUNT(*) FROM lessons
     WHERE course_id = NEW.course_id
       AND is_published = true
       AND deleted_at IS NULL)
  ON CONFLICT (user_id, course_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_init_course_progress
  AFTER INSERT ON enrollments
  FOR EACH ROW EXECUTE FUNCTION init_course_progress();