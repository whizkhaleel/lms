-- Question bank: centralized question storage organized by category.
-- Instructors create categories per-course, add questions to them,
-- then import questions from the bank into any quiz.

CREATE TABLE IF NOT EXISTS question_bank_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, name)
);

CREATE INDEX IF NOT EXISTS idx_qbc_course_id ON question_bank_categories(course_id);

CREATE TRIGGER trg_qbc_updated_at
  BEFORE UPDATE ON question_bank_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS question_bank (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID NOT NULL REFERENCES question_bank_categories(id) ON DELETE CASCADE,
  type            question_type NOT NULL DEFAULT 'multiple_choice',
  question_text   TEXT NOT NULL,
  options         JSONB NOT NULL DEFAULT '[]',
  model_answer    TEXT,
  explanation     TEXT,
  points          INTEGER NOT NULL DEFAULT 1 CHECK (points > 0),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_category_id  ON question_bank(category_id);
CREATE INDEX IF NOT EXISTS idx_qb_type         ON question_bank(type);

CREATE TRIGGER trg_qb_updated_at
  BEFORE UPDATE ON question_bank
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  question_bank_categories IS 'Categories for organizing bank questions per course';
COMMENT ON TABLE  question_bank             IS 'Reusable questions that can be imported into any quiz';
