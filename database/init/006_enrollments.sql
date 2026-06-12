-- ─────────────────────────────────────────────
--  Migration 005 — Enrollments & Payments
-- ─────────────────────────────────────────────

-- ── Coupons ───────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(50) NOT NULL UNIQUE,
  description    VARCHAR(255),
  discount_type  VARCHAR(10) NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(10,2) NOT NULL,
  max_uses       INTEGER,
  uses_count     INTEGER NOT NULL DEFAULT 0,
  valid_from     TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_until    TIMESTAMP,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- ── Orders / Payments ─────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  course_id                UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  coupon_id                UUID REFERENCES coupons(id) ON DELETE SET NULL,

  -- Amounts stored at time of purchase (prices can change later)
  original_price           NUMERIC(10,2) NOT NULL,
  discount_amount          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  final_amount             NUMERIC(10,2) NOT NULL,
  currency                 VARCHAR(3) NOT NULL DEFAULT 'USD',

  status                   payment_status NOT NULL DEFAULT 'pending',

  -- Stripe references
  stripe_session_id        VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id         VARCHAR(255),

  refunded_at              TIMESTAMP,
  refund_reason            TEXT,
  metadata                 JSONB DEFAULT '{}',
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id        ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_course_id      ON orders(course_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Enrollments ───────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  status            enrollment_status NOT NULL DEFAULT 'active',

  -- Progress snapshot (denormalized for fast dashboard queries)
  progress_percent  INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  lessons_completed INTEGER NOT NULL DEFAULT 0,

  enrolled_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMP,
  expires_at        TIMESTAMP,

  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_id   ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status    ON enrollments(status);
