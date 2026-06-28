-- Add course settings columns

ALTER TABLE courses ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enable_completion_tracking BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS show_grades_to_student BOOLEAN NOT NULL DEFAULT true;
