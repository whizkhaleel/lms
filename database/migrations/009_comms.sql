-- ─────────────────────────────────────────────
--  Migration 009 — Forums, Messages, Notifications
--
--  Tables:
--    forum_threads      → discussion thread per course
--    forum_posts        → replies inside a thread
--    forum_reactions    → emoji reactions on posts
--    direct_messages    → DM conversation between two users
--    dm_messages        → individual messages in a DM thread
--    notifications      → in-app notification records
--    notification_prefs → per-user notification preferences
-- ─────────────────────────────────────────────

-- ── Fix notification_type enum — add missing types ──
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'forum_reply';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'forum_mention';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'direct_message';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'quiz_graded';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'course_announcement';

-- ═════════════════════════════════════════════
--  FORUMS
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS forum_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

  title       VARCHAR(500) NOT NULL,
  content     TEXT NOT NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT false,   -- instructors can pin
  is_locked   BOOLEAN NOT NULL DEFAULT false,   -- no new replies when locked
  is_answered BOOLEAN NOT NULL DEFAULT false,   -- thread marked resolved

  -- Denormalized counts for list view (no COUNT(*) on every load)
  reply_count  INTEGER NOT NULL DEFAULT 0,
  view_count   INTEGER NOT NULL DEFAULT 0,
  last_post_at TIMESTAMP NOT NULL DEFAULT NOW(),

  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ft_course_id    ON forum_threads(course_id);
CREATE INDEX IF NOT EXISTS idx_ft_author_id    ON forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_ft_last_post    ON forum_threads(last_post_at DESC);
CREATE INDEX IF NOT EXISTS idx_ft_deleted      ON forum_threads(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ft_pinned       ON forum_threads(is_pinned DESC, last_post_at DESC);

DROP TRIGGER IF EXISTS trg_forum_threads_updated_at ON forum_threads;
CREATE TRIGGER trg_forum_threads_updated_at
  BEFORE UPDATE ON forum_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Forum Posts (replies) ─────────────────────
CREATE TABLE IF NOT EXISTS forum_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  parent_id   UUID REFERENCES forum_posts(id) ON DELETE CASCADE, -- nested replies

  content     TEXT NOT NULL,
  is_answer   BOOLEAN NOT NULL DEFAULT false,   -- marked as accepted answer by instructor
  is_edited   BOOLEAN NOT NULL DEFAULT false,

  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fp_thread_id  ON forum_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_fp_author_id  ON forum_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_fp_parent_id  ON forum_posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_fp_deleted    ON forum_posts(deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_forum_posts_updated_at ON forum_posts;
CREATE TRIGGER trg_forum_posts_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Forum Reactions ───────────────────────────
-- One row per (user × post × emoji). Unique enforced.
CREATE TABLE IF NOT EXISTS forum_reactions (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id  UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji    VARCHAR(10) NOT NULL DEFAULT '👍',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_fr_post_id ON forum_reactions(post_id);

-- Auto-update thread last_post_at and reply_count when post added
CREATE OR REPLACE FUNCTION update_thread_on_post()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forum_threads
    SET reply_count  = reply_count + 1,
        last_post_at = NOW()
    WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE forum_threads
    SET reply_count = GREATEST(0, reply_count - 1)
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_thread_on_post ON forum_posts;
CREATE TRIGGER trg_update_thread_on_post
  AFTER INSERT OR UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION update_thread_on_post();

-- ═════════════════════════════════════════════
--  DIRECT MESSAGES
-- ═════════════════════════════════════════════

-- One conversation row per pair of users (ordered by UUID for consistency)
CREATE TABLE IF NOT EXISTS dm_conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Denormalized preview
  last_message TEXT,
  last_message_at TIMESTAMP,

  -- Unread counts per side
  unread_a     INTEGER NOT NULL DEFAULT 0,  -- unread for user_a
  unread_b     INTEGER NOT NULL DEFAULT 0,  -- unread for user_b

  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Canonical pair — user_a always < user_b by UUID string comparison
  UNIQUE(user_a_id, user_b_id),
  CHECK(user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_dmc_user_a ON dm_conversations(user_a_id);
CREATE INDEX IF NOT EXISTS idx_dmc_user_b ON dm_conversations(user_b_id);

CREATE TABLE IF NOT EXISTS dm_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  content         TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dmm_conversation_id ON dm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dmm_sender_id       ON dm_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_dmm_created_at      ON dm_messages(created_at DESC);

-- ═════════════════════════════════════════════
--  NOTIFICATIONS
-- ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  -- Deep-link data so frontend knows where to navigate
  data        JSONB NOT NULL DEFAULT '{}',
  is_read     BOOLEAN NOT NULL DEFAULT false,
  read_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_id    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_is_read    ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notif_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_type       ON notifications(type);

-- ── Notification Preferences ──────────────────
-- Per-user toggle for each notification type.
-- Rows only inserted when user changes default (default = all ON).
CREATE TABLE IF NOT EXISTS notification_prefs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  in_app      BOOLEAN NOT NULL DEFAULT true,
  email       BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_np_user_id ON notification_prefs(user_id);