-- Add trending_topics table for content creation workflow
-- This table wasn't created in the first migration

CREATE TABLE IF NOT EXISTS trending_topics (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  frequency_count INTEGER DEFAULT 1,
  platforms TEXT, -- JSON array of platforms where topic appeared
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  blog_post_created BOOLEAN DEFAULT 0,
  blog_post_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trending_topics_frequency ON trending_topics(frequency_count DESC);
CREATE INDEX IF NOT EXISTS idx_trending_topics_blog_created ON trending_topics(blog_post_created);
