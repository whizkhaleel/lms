-- ─────────────────────────────────────────────
--  Migration 022 — SCORM & LTI Support
-- ─────────────────────────────────────────────

-- Extend lesson_type enum
ALTER TYPE lesson_type ADD VALUE IF NOT EXISTS 'scorm';
ALTER TYPE lesson_type ADD VALUE IF NOT EXISTS 'lti';

-- ── SCORM Packages ────────────────────────────
-- Each row = one uploaded SCORM package (a .zip)
-- The zip is extracted into lmsdata/scorm/<id>/
CREATE TABLE IF NOT EXISTS scorm_packages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id        UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title            VARCHAR(255) NOT NULL,

  -- Original uploaded filename
  package_name     VARCHAR(255) NOT NULL,

  -- Where the extracted SCORM files live (relative to lmsdata)
  storage_path     TEXT NOT NULL,

  -- Launch file found inside imsmanifest.xml
  -- e.g. 'index.html', 'player.html', 'scormcontent/index.html'
  launch_file      VARCHAR(500) NOT NULL DEFAULT 'index.html',

  -- SCORM version detected: '1.2' or '2004'
  scorm_version    VARCHAR(10) DEFAULT '1.2',

  -- Parsed manifest metadata (JSON)
  manifest_data    JSONB DEFAULT '{}',

  -- File size of original zip
  size_bytes       BIGINT NOT NULL DEFAULT 0,

  uploaded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scorm_packages_course_id  ON scorm_packages(course_id);
CREATE INDEX IF NOT EXISTS idx_scorm_packages_lesson_id  ON scorm_packages(lesson_id);

DROP TRIGGER IF EXISTS trg_scorm_packages_updated_at ON scorm_packages;
CREATE TRIGGER trg_scorm_packages_updated_at
  BEFORE UPDATE ON scorm_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SCORM Runtime Data (per user per SCO) ─────
-- Stores SCORM cmi data so progress persists across sessions.
CREATE TABLE IF NOT EXISTS scorm_sco_data (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id   UUID NOT NULL REFERENCES scorm_packages(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,

  -- SCORM runtime data stored as key-value pairs
  -- Keys: cmi.core.score.raw, cmi.core.lesson_status, etc.
  data         JSONB NOT NULL DEFAULT '{}',

  -- Convenience columns for common LMS queries
  lesson_status  VARCHAR(50),   -- 'completed','passed','failed','incomplete','browsed','not attempted'
  score_raw      NUMERIC(10,2),
  score_max      NUMERIC(10,2) DEFAULT 100,
  score_min      NUMERIC(10,2) DEFAULT 0,
  total_time     VARCHAR(20),   -- 'PT1H30M00S' (ISO 8601 duration)

  session_time   TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(package_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scorm_sco_data_package_id ON scorm_sco_data(package_id);
CREATE INDEX IF NOT EXISTS idx_scorm_sco_data_user_id    ON scorm_sco_data(user_id);
CREATE INDEX IF NOT EXISTS idx_scorm_sco_data_lesson_id  ON scorm_sco_data(lesson_id);

DROP TRIGGER IF EXISTS trg_scorm_sco_data_updated_at ON scorm_sco_data;
CREATE TRIGGER trg_scorm_sco_data_updated_at
  BEFORE UPDATE ON scorm_sco_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── LTI Tool Registrations ────────────────────
-- Instructors register external tools that can be used as LTI lessons.
CREATE TABLE IF NOT EXISTS lti_tools (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,

  -- The URL the LTI launch request will be sent to
  launch_url     VARCHAR(500) NOT NULL,

  -- OAuth credentials for LTI 1.0/1.1 signing
  consumer_key    VARCHAR(255) NOT NULL,
  consumer_secret VARCHAR(255) NOT NULL,

  -- Optional: custom parameters to include in every launch
  custom_params   JSONB DEFAULT '{}',

  -- LTI version: '1.0', '1.1'
  lti_version     VARCHAR(10) NOT NULL DEFAULT '1.1',

  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lti_tools_course_id ON lti_tools(course_id);

DROP TRIGGER IF EXISTS trg_lti_tools_updated_at ON lti_tools;
CREATE TRIGGER trg_lti_tools_updated_at
  BEFORE UPDATE ON lti_tools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── LTI Launch Sessions ───────────────────────
-- Tracks LTI launch requests to enable grade passback (future).
CREATE TABLE IF NOT EXISTS lti_launches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id        UUID NOT NULL REFERENCES lti_tools(id) ON DELETE CASCADE,
  lesson_id      UUID REFERENCES lessons(id) ON DELETE SET NULL,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- The signed launch parameters sent
  launch_params  JSONB DEFAULT '{}',

  -- OAuth signature used
  oauth_signature VARCHAR(300),

  -- LTI lis_result_sourcedid — used for grade passback
  lis_result_sourcedid TEXT,

  -- Session expiry
  expires_at     TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lti_launches_tool_id   ON lti_launches(tool_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_user_id   ON lti_launches(user_id);
CREATE INDEX IF NOT EXISTS idx_lti_launches_lesson_id ON lti_launches(lesson_id);
