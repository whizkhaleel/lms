-- Course groups: students can be organized into teams.
-- Instructors create groups per-course, assign enrolled students,
-- then mark assignments as "group submission" so students submit on behalf of their team.

CREATE TABLE IF NOT EXISTS course_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  max_members  INTEGER CHECK (max_members IS NULL OR max_members > 0),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cg_course_id ON course_groups(course_id);

DROP TRIGGER IF EXISTS trg_cg_updated_at ON course_groups;
CREATE TRIGGER trg_cg_updated_at
  BEFORE UPDATE ON course_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member','manager')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gm_group_id   ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_gm_user_id    ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_gm_course_id  ON group_members(course_id);

-- Add group support to assignments
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS is_group_assignment BOOLEAN NOT NULL DEFAULT false;

-- Add group_id to submissions (nullable — individual submissions remain null)
ALTER TABLE assignment_submissions
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES course_groups(id) ON DELETE SET NULL;

-- Drop old unique constraint and replace with partial indexes
ALTER TABLE assignment_submissions
  DROP CONSTRAINT IF EXISTS assignment_submissions_assignment_id_user_id_attempt_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_as_individual_unique
  ON assignment_submissions (assignment_id, user_id, attempt_number)
  WHERE group_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_as_group_unique
  ON assignment_submissions (assignment_id, group_id, attempt_number)
  WHERE group_id IS NOT NULL;

COMMENT ON TABLE  course_groups       IS 'Student teams within a course';
COMMENT ON TABLE  group_members       IS 'Membership linking students to groups';
COMMENT ON COLUMN assignments.is_group_assignment  IS 'When true, students submit as a group';
COMMENT ON COLUMN assignment_submissions.group_id  IS 'NULL for individual submissions, set for group submissions';
