-- Rubrics for assignment grading
-- Instructors define criteria with max scores per assignment.
-- Graders assign scores per criterion per submission.

CREATE TABLE IF NOT EXISTS assignment_rubrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL DEFAULT '',
  description     TEXT,
  max_score       NUMERIC(8,2) NOT NULL DEFAULT 0, -- cached sum of criterion max_scores
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id     UUID NOT NULL REFERENCES assignment_rubrics(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  max_score     NUMERIC(5,2) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rubric_criteria_rubric ON rubric_criteria(rubric_id);

CREATE TABLE IF NOT EXISTS rubric_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  criterion_id    UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  score           NUMERIC(5,2) NOT NULL,
  UNIQUE (submission_id, criterion_id)
);

CREATE INDEX IF NOT EXISTS idx_rubric_feedback_submission ON rubric_feedback(submission_id);

CREATE TRIGGER trg_assignment_rubrics_updated_at
  BEFORE UPDATE ON assignment_rubrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rubric_criteria_updated_at
  BEFORE UPDATE ON rubric_criteria
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  assignment_rubrics          IS 'One rubric per assignment';
COMMENT ON TABLE  rubric_criteria             IS 'Criterion rows within a rubric';
COMMENT ON TABLE  rubric_feedback             IS 'Per-criterion scores for a submission';
