-- Add forum_thread_created to notification_type enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'forum_thread_created';
