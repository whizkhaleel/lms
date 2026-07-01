-- Lesson Availability / Conditional Access
-- Instructors can restrict lesson access based on conditions.

CREATE TABLE IF NOT EXISTS lesson_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  conditions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_lesson_avail_lesson ON lesson_availability(lesson_id);

DROP TRIGGER IF EXISTS trg_lesson_availability_updated_at ON lesson_availability;
CREATE TRIGGER trg_lesson_availability_updated_at
  BEFORE UPDATE ON lesson_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  lesson_availability IS 'Per-lesson access conditions evaluated at runtime for each student';
COMMENT ON COLUMN lesson_availability.conditions IS 'JSON array of condition objects — see docs for schema';
