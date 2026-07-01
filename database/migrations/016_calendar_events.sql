-- Calendar events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          VARCHAR(500) NOT NULL,
  description    TEXT,
  event_type     VARCHAR(50) NOT NULL DEFAULT 'manual',
  start_date     TIMESTAMPTZ NOT NULL,
  end_date       TIMESTAMPTZ,
  all_day        BOOLEAN NOT NULL DEFAULT false,
  course_id      UUID REFERENCES courses(id) ON DELETE CASCADE,
  reference_type VARCHAR(50),
  reference_id   UUID,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_course ON calendar_events(course_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_dates  ON calendar_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_ref    ON calendar_events(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type   ON calendar_events(event_type);

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
