-- Course announcements — instructors post, students see on classroom page

CREATE TABLE IF NOT EXISTS course_announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  instructor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ca_course_id    ON course_announcements(course_id);
CREATE INDEX IF NOT EXISTS idx_ca_created_at   ON course_announcements(created_at DESC);

CREATE TRIGGER trg_course_announcements_updated_at
  BEFORE UPDATE ON course_announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  course_announcements IS 'Instructor-created announcements visible to enrolled students';
