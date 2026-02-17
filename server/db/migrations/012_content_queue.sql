-- Migration 012: Content queue for Facebook (and future platform) posts
-- Stores AI-generated social content waiting to be published

CREATE TABLE IF NOT EXISTS content_queue (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'facebook',   -- 'facebook', 'linkedin', etc.
  post_type TEXT NOT NULL DEFAULT 'page',       -- 'page' or 'group'
  content TEXT NOT NULL,                        -- The post text ready to publish
  topic TEXT,                                   -- Human-readable topic label
  source_agent TEXT,                            -- Which agent generated this
  status TEXT NOT NULL DEFAULT 'pending',       -- 'pending', 'posted', 'failed', 'skipped'
  scheduled_for TEXT,                           -- ISO datetime to post (NULL = post ASAP)
  posted_at TEXT,                               -- When it was actually published
  facebook_post_id TEXT,                        -- FB post ID returned on success
  error_message TEXT,                           -- Error details if status=failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_platform ON content_queue(platform);
CREATE INDEX IF NOT EXISTS idx_content_queue_scheduled_for ON content_queue(scheduled_for);
