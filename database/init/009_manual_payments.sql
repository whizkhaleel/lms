-- ─────────────────────────────────────────────
--  Migration 008 — Manual Payments
--
--  Replaces Stripe-based payment processing.
--  Admins record payments received offline (cash,
--  bank transfer, etc.) and confirm enrollment.
-- ─────────────────────────────────────────────

CREATE TABLE manual_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,

  amount            NUMERIC(10,2) NOT NULL,
  currency          VARCHAR(3) NOT NULL DEFAULT 'NGN',
  payment_method    VARCHAR(50) NOT NULL DEFAULT 'cash',
  reference         VARCHAR(255),
  notes             TEXT,

  -- Status flow: pending → confirmed | rejected
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'rejected')),

  recorded_by       UUID NOT NULL REFERENCES users(id),
  confirmed_by      UUID REFERENCES users(id),
  confirmed_at      TIMESTAMP,
  enrollment_id     UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  rejected_reason   TEXT,

  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mp_user_id    ON manual_payments(user_id);
CREATE INDEX idx_mp_course_id  ON manual_payments(course_id);
CREATE INDEX idx_mp_status     ON manual_payments(status);

CREATE TRIGGER trg_manual_payments_updated_at
  BEFORE UPDATE ON manual_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
