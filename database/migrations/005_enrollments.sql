-- ─────────────────────────────────────────────
--  Migration 005 — Enrollments
--
--  Payment processing is handled manually.
--  No Stripe tables, no orders, no coupons.
--  Paid course enrollment is done by admins
--  after offline payment confirmation.
-- ─────────────────────────────────────────────

CREATE TABLE enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  status            enrollment_status NOT NULL DEFAULT 'active',

  -- Progress snapshot (denormalized for fast dashboard queries)
  progress_percent  INTEGER NOT NULL DEFAULT 0
    CHECK (progress_percent BETWEEN 0 AND 100),
  lessons_completed INTEGER NOT NULL DEFAULT 0,

  enrolled_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMP,
  expires_at        TIMESTAMP,  -- reserved for future time-limited access

  UNIQUE(user_id, course_id)
);

CREATE INDEX idx_enrollments_user_id   ON enrollments(user_id);
CREATE INDEX idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX idx_enrollments_status    ON enrollments(status);
