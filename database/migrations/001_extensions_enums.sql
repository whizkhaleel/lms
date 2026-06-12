-- ─────────────────────────────────────────────
--  Migration 001 — Extensions & Enums
--  Run order: first
-- ─────────────────────────────────────────────

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'student',
      'instructor',
      'admin',
      'super_admin'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM (
      'pending_verification',
      'active',
      'suspended',
      'deactivated'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_status') THEN
    CREATE TYPE course_status AS ENUM (
      'draft',
      'under_review',
      'published',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_type') THEN
    CREATE TYPE lesson_type AS ENUM (
      'video',
      'pdf',
      'text',
      'quiz',
      'assignment'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_status') THEN
    CREATE TYPE enrollment_status AS ENUM (
      'active',
      'completed',
      'expired',
      'refunded'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
    CREATE TYPE submission_status AS ENUM (
      'submitted',
      'grading',
      'graded',
      'returned'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM (
      'pending',
      'completed',
      'failed',
      'refunded'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'enrollment',
      'lesson_available',
      'assignment_graded',
      'announcement',
      'certificate_issued',
      'payment_receipt',
      'system'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storage_backend') THEN
    CREATE TYPE storage_backend AS ENUM (
      'local',
      'minio',
      's3'
    );
  END IF;
END
$$;
