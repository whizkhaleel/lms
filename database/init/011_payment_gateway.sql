-- ─────────────────────────────────────────────
--  Migration 010 — External Payment Gateway
--
--  Context: A separate payment website now exists.
--  Visitors (no LMS account yet) pay there directly.
--  That system calls our webhook with payment proof.
--  Admin reviews in our panel and approves.
--  On approval: account is auto-created, student is
--  auto-enrolled, and login credentials are emailed.
-- ─────────────────────────────────────────────

-- ── Extend payment_method enum for gateway-originated payments ──
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'card_gateway';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'bank_transfer_gateway';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'ussd';

-- ── Track where a payment record came from ────
CREATE TYPE payment_origin AS ENUM (
  'admin_recorded',   -- admin manually logged it (existing Phase 5 flow)
  'external_gateway'  -- pushed in via webhook from the payment site
);

-- ── Extend manual_payments table ──────────────
-- user_id becomes nullable: a webhook payment may arrive
-- BEFORE any LMS account exists for that buyer.
ALTER TABLE manual_payments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE manual_payments
  ADD COLUMN IF NOT EXISTS origin              payment_origin NOT NULL DEFAULT 'admin_recorded',
  ADD COLUMN IF NOT EXISTS buyer_email          VARCHAR(255),   -- from the payment site, pre-account
  ADD COLUMN IF NOT EXISTS buyer_first_name     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS buyer_last_name      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS buyer_phone          VARCHAR(30),
  ADD COLUMN IF NOT EXISTS external_reference   VARCHAR(255),   -- the payment site's own transaction ID
  ADD COLUMN IF NOT EXISTS external_payload     JSONB,          -- raw webhook payload, for audit/debug
  ADD COLUMN IF NOT EXISTS account_created      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credentials_email_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credentials_sent_at  TIMESTAMP;

-- Prevent double-processing of the same external transaction
CREATE UNIQUE INDEX IF NOT EXISTS idx_mp_external_reference
  ON manual_payments(external_reference)
  WHERE external_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mp_origin       ON manual_payments(origin);
CREATE INDEX IF NOT EXISTS idx_mp_buyer_email  ON manual_payments(buyer_email);

-- ── Force password change after first login ───
-- Used for auto-provisioned accounts — student must
-- set their own password on first login.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- ── Webhook event log (idempotency + audit) ───
-- Every inbound webhook call is logged here BEFORE processing.
-- The external_reference uniqueness above is the hard guarantee;
-- this table is for visibility/debugging/replay protection.
CREATE TABLE payment_webhook_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_reference VARCHAR(255) NOT NULL,
  payload            JSONB NOT NULL,
  signature_valid    BOOLEAN NOT NULL,
  processed          BOOLEAN NOT NULL DEFAULT false,
  processing_error   TEXT,
  manual_payment_id  UUID REFERENCES manual_payments(id) ON DELETE SET NULL,
  received_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pwe_external_reference ON payment_webhook_events(external_reference);
CREATE INDEX idx_pwe_processed          ON payment_webhook_events(processed);