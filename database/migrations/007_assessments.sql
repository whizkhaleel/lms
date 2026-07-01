-- ─────────────────────────────────────────────
--  Migration 007 — Assessments & Grading
--
--  Tables:
--    quizzes           → quiz config attached to a lesson
--    quiz_questions    → individual questions inside a quiz
--    quiz_attempts     → one attempt record per student per quiz
--    quiz_answers      → student's answer to each question
--    assignments       → assignment config attached to a lesson
--    assignment_submissions → student file/text submission
--    grades            → unified grade record (quiz or assignment)
-- ─────────────────────────────────────────────

-- ── Question type enum ────────────────────────
DO $$ BEGIN
  CREATE TYPE question_type AS ENUM (
    'multiple_choice',
    'multi_select',
    'true_false',
    'short_answer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Quizzes ───────────────────────────────────
-- One quiz per lesson (lesson.type = 'quiz')
CREATE TABLE IF NOT EXISTS quizzes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           UUID NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  title               VARCHAR(255) NOT NULL,
  description         TEXT,

  -- Attempt rules
  max_attempts        INTEGER DEFAULT 1,      -- NULL = unlimited
  time_limit_mins     INTEGER,                -- NULL = no limit
  passing_score_pct   INTEGER NOT NULL DEFAULT 70  -- 0-100
    CHECK (passing_score_pct BETWEEN 0 AND 100),

  -- Behaviour
  shuffle_questions   BOOLEAN NOT NULL DEFAULT false,
  shuffle_options     BOOLEAN NOT NULL DEFAULT false,
  show_answers_after  BOOLEAN NOT NULL DEFAULT true,  -- reveal correct answers after submit

  is_published        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_id ON quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON quizzes(course_id);

CREATE TRIGGER trg_quizzes_updated_at
  BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Quiz Questions ────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type          question_type NOT NULL DEFAULT 'multiple_choice',
  question_text TEXT NOT NULL,
  -- Options stored as JSONB array:
  -- [{ "id": "a", "text": "Paris", "is_correct": true }, ...]
  options       JSONB NOT NULL DEFAULT '[]',
  -- For short_answer: model answer for instructor reference
  model_answer  TEXT,
  explanation   TEXT,         -- shown after attempt if show_answers_after = true
  points        INTEGER NOT NULL DEFAULT 1 CHECK (points > 0),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);

-- ── Quiz Attempts ─────────────────────────────
-- One row per attempt. A student may have multiple rows if max_attempts > 1.
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  attempt_number  INTEGER NOT NULL DEFAULT 1,

  -- Scoring
  total_points    INTEGER NOT NULL DEFAULT 0,   -- max possible
  earned_points   INTEGER NOT NULL DEFAULT 0,
  score_pct       NUMERIC(5,2),                 -- earned/total * 100
  passed          BOOLEAN,

  -- Timing
  started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMP,
  time_taken_secs INTEGER,

  -- State
  status          VARCHAR(20) NOT NULL DEFAULT 'in_progress',
                  -- 'in_progress' | 'submitted' | 'graded'

  -- Snapshot of question order for this attempt (supports shuffle)
  question_order  JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_qa_quiz_id  ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_qa_user_id  ON quiz_attempts(user_id);
CREATE UNIQUE INDEX idx_qa_user_attempt
  ON quiz_attempts(user_id, quiz_id, attempt_number);

-- ── Quiz Answers ──────────────────────────────
-- One row per question per attempt.
CREATE TABLE IF NOT EXISTS quiz_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,

  -- Student's answer (flexible — works for all question types)
  -- MCQ/TF: ["a"] or ["true"]
  -- Multi-select: ["a", "c"]
  -- Short answer: ["free text here"]
  selected_options JSONB NOT NULL DEFAULT '[]',

  -- Grading
  is_correct      BOOLEAN,         -- NULL for short_answer (manual grade)
  points_earned   NUMERIC(5,2) NOT NULL DEFAULT 0,
  instructor_note TEXT,            -- feedback on short answer

  UNIQUE(attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt_id ON quiz_answers(attempt_id);

-- ── Assignments ───────────────────────────────
-- One assignment per lesson (lesson.type = 'assignment')
CREATE TABLE IF NOT EXISTS assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           UUID NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  title               VARCHAR(255) NOT NULL,
  instructions        TEXT,
  max_score           INTEGER NOT NULL DEFAULT 100,
  passing_score       INTEGER NOT NULL DEFAULT 50,

  -- Submission rules
  allow_text_submission  BOOLEAN NOT NULL DEFAULT true,
  allow_file_submission  BOOLEAN NOT NULL DEFAULT true,
  max_file_size_mb       INTEGER NOT NULL DEFAULT 50,
  allowed_file_types     TEXT[],    -- e.g. ['pdf','docx','zip']
  max_files              INTEGER NOT NULL DEFAULT 3,

  due_date            TIMESTAMP,
  is_published        BOOLEAN NOT NULL DEFAULT true,

  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_lesson_id ON assignments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);

CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Assignment Submissions ────────────────────
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- Content (text or files or both)
  text_content    TEXT,
  file_ids        JSONB NOT NULL DEFAULT '[]',  -- array of file UUIDs from files table

  status          submission_status NOT NULL DEFAULT 'submitted',

  -- Grading
  score           NUMERIC(5,2),
  feedback        TEXT,
  graded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  graded_at       TIMESTAMP,

  -- Attempt tracking
  attempt_number  INTEGER NOT NULL DEFAULT 1,

  submitted_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(assignment_id, user_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_as_assignment_id ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_as_user_id       ON assignment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_as_status        ON assignment_submissions(status);

CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Unified Grades ────────────────────────────
-- Single grade record per student per lesson (quiz or assignment).
-- Feeds into the gradebook and transcript views.
CREATE TABLE IF NOT EXISTS grades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,

  -- Source (one of these will be set)
  quiz_attempt_id       UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  submission_id         UUID REFERENCES assignment_submissions(id) ON DELETE SET NULL,

  grade_type      VARCHAR(20) NOT NULL,  -- 'quiz' | 'assignment'
  score           NUMERIC(5,2) NOT NULL,
  max_score       NUMERIC(5,2) NOT NULL,
  score_pct       NUMERIC(5,2) NOT NULL,
  passed          BOOLEAN NOT NULL DEFAULT false,

  graded_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, lesson_id, grade_type)
);

CREATE INDEX IF NOT EXISTS idx_grades_user_id   ON grades(user_id);
CREATE INDEX IF NOT EXISTS idx_grades_course_id ON grades(course_id);
CREATE INDEX IF NOT EXISTS idx_grades_lesson_id ON grades(lesson_id);

CREATE TRIGGER trg_grades_updated_at
  BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();