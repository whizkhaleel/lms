-- ─────────────────────────────────────────────
--  Migration 004 — Courses, Categories,
--                  Sections, Lessons
-- ─────────────────────────────────────────────

-- ── Course Categories ─────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  icon        VARCHAR(100),
  parent_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug      ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- ── Courses ───────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 VARCHAR(255) NOT NULL,
  slug                  VARCHAR(280) NOT NULL UNIQUE,
  description           TEXT,
  short_description     VARCHAR(500),
  status                course_status NOT NULL DEFAULT 'draft',

  -- Ownership
  instructor_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_id           UUID REFERENCES categories(id) ON DELETE SET NULL,

  -- Media
  thumbnail_file_id     UUID REFERENCES files(id) ON DELETE SET NULL,
  preview_video_file_id UUID REFERENCES files(id) ON DELETE SET NULL,

  -- Pricing
  is_free               BOOLEAN NOT NULL DEFAULT false,
  price                 NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discount_price        NUMERIC(10,2),
  currency              VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Meta
  level                 VARCHAR(20) DEFAULT 'beginner',
  language              VARCHAR(50) DEFAULT 'English',
  tags                  TEXT[],
  requirements          TEXT[],
  objectives            TEXT[],
  duration_seconds      INTEGER DEFAULT 0,
  lesson_count          INTEGER DEFAULT 0,
  student_count         INTEGER DEFAULT 0,
  rating_average        NUMERIC(3,2) DEFAULT 0.00,
  rating_count          INTEGER DEFAULT 0,

  published_at          TIMESTAMP,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_slug          ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_instructor_id ON courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_courses_category_id   ON courses(category_id);
CREATE INDEX IF NOT EXISTS idx_courses_status        ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_deleted_at    ON courses(deleted_at) WHERE deleted_at IS NULL;
-- idx_courses_is_free removed — column dropped by 015_remove_pricing.sql

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_courses_fts ON courses
  USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Course Sections ───────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sections_course_id ON sections(course_id);

DROP TRIGGER IF EXISTS trg_sections_updated_at ON sections;

CREATE TRIGGER trg_sections_updated_at
  BEFORE UPDATE ON sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Lessons ───────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id       UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            VARCHAR(255) NOT NULL,
  type             lesson_type NOT NULL DEFAULT 'video',
  content          TEXT,
  video_file_id    UUID REFERENCES files(id) ON DELETE SET NULL,
  duration_seconds INTEGER DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_free_preview  BOOLEAN NOT NULL DEFAULT false,
  is_published     BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lessons_section_id ON lessons(section_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id  ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_deleted_at ON lessons(deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_lessons_updated_at ON lessons;

CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Lesson Resources (PDF, docs attached to a lesson) ──
CREATE TABLE IF NOT EXISTS lesson_resources (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_id    UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  title      VARCHAR(255),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_resources_lesson_id ON lesson_resources(lesson_id);

-- ── Seed default categories ───────────────────
INSERT INTO categories (name, slug, description, sort_order) VALUES
  ('Technology', 'technology', 'Software, hardware and IT courses', 1),
  ('Business', 'business', 'Management, entrepreneurship and finance', 2),
  ('Science', 'science', 'Biology, chemistry, physics and more', 3),
  ('Arts & Humanities', 'arts-humanities', 'Literature, history, art and philosophy', 4),
  ('Health', 'health', 'Medicine, nursing and wellness', 5),
  ('Languages', 'languages', 'English, Arabic, French and other languages', 6),
  ('Mathematics', 'mathematics', 'Calculus, statistics and applied math', 7),
  ('Personal Development', 'personal-development', 'Leadership, productivity and life skills', 8)
ON CONFLICT (slug) DO NOTHING;
