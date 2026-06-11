-- ─────────────────────────────────────────────
--  Migration 003 — Files (lmsdata metadata)
--
--  CRITICAL DESIGN RULE:
--  This table stores METADATA only.
--  Actual file bytes live in lmsdata/ on disk.
--  The database never stores file content.
-- ─────────────────────────────────────────────

CREATE TABLE files (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Original name the user uploaded
  original_name    VARCHAR(255) NOT NULL,

  -- Name used on disk (UUID-based, no user-controlled names)
  stored_name      VARCHAR(255) NOT NULL,

  -- Relative path inside lmsdata/ (never absolute)
  -- e.g. 'uploads/lessons/uuid/video/stored_name.mp4'
  storage_path     TEXT NOT NULL,

  mime_type        VARCHAR(100) NOT NULL,
  size_bytes       BIGINT NOT NULL CHECK (size_bytes > 0),

  -- SHA-256 of file contents — used for deduplication
  sha256_hash      CHAR(64) NOT NULL,

  -- Which storage system holds this file
  storage_backend  storage_backend NOT NULL DEFAULT 'local',

  -- true  → served directly by Nginx (thumbnails, public assets)
  -- false → must go through API with auth check (submissions, private docs)
  is_public        BOOLEAN NOT NULL DEFAULT false,

  -- Which module owns this file
  -- 'course_thumbnail', 'lesson_video', 'assignment_submission', 'avatar', 'certificate'
  context          VARCHAR(100) NOT NULL,

  uploaded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at       TIMESTAMP,   -- soft delete (actual file cleaned by worker)
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_sha256       ON files(sha256_hash);
CREATE INDEX idx_files_uploaded_by  ON files(uploaded_by);
CREATE INDEX idx_files_context      ON files(context);
CREATE INDEX idx_files_deleted_at   ON files(deleted_at) WHERE deleted_at IS NULL;

-- Add avatar FK to users now that files table exists
ALTER TABLE users ADD CONSTRAINT fk_users_avatar
  FOREIGN KEY (avatar_file_id) REFERENCES files(id) ON DELETE SET NULL;
