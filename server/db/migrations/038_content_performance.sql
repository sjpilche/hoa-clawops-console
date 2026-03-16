-- Migration 038: Content Performance Tracking
-- Tracks how each piece of content performs so the brain can learn what works.
-- Feeds into self-recursive learning: write → measure → learn → write better.

-- Score each content piece based on downstream results
ALTER TABLE cfo_content_pieces ADD COLUMN performance_score INTEGER DEFAULT NULL;
ALTER TABLE cfo_content_pieces ADD COLUMN leads_generated INTEGER DEFAULT 0;
ALTER TABLE cfo_content_pieces ADD COLUMN email_clicks INTEGER DEFAULT 0;
ALTER TABLE cfo_content_pieces ADD COLUMN social_shares INTEGER DEFAULT 0;
ALTER TABLE cfo_content_pieces ADD COLUMN newsletter_clicks INTEGER DEFAULT 0;
ALTER TABLE cfo_content_pieces ADD COLUMN page_views INTEGER DEFAULT 0;
ALTER TABLE cfo_content_pieces ADD COLUMN scored_at TEXT DEFAULT NULL;
ALTER TABLE cfo_content_pieces ADD COLUMN target_keyword TEXT DEFAULT NULL;
ALTER TABLE cfo_content_pieces ADD COLUMN calendar_id INTEGER DEFAULT NULL;

-- Score each content calendar topic based on actual results
ALTER TABLE content_calendar ADD COLUMN performance_score INTEGER DEFAULT NULL;
ALTER TABLE content_calendar ADD COLUMN leads_generated INTEGER DEFAULT 0;
ALTER TABLE content_calendar ADD COLUMN scored_at TEXT DEFAULT NULL;

-- Learning log: what the system learned and when
CREATE TABLE IF NOT EXISTS marketing_learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learning_type TEXT NOT NULL,
  -- Types:
  --   'topic_winner'       — this topic/keyword drove leads
  --   'topic_loser'        — this topic/keyword produced nothing
  --   'angle_winner'       — this outreach angle converts
  --   'angle_loser'        — this outreach angle fails
  --   'timing_insight'     — best day/time for posting/sending
  --   'format_insight'     — blog vs social vs email effectiveness
  --   'market_insight'     — which markets respond to which content
  --   'pillar_performance' — which content pillar drives most leads
  product TEXT DEFAULT 'both',           -- 'hoa' | 'jake' | 'both'
  summary TEXT NOT NULL,                 -- Human-readable insight
  data TEXT DEFAULT NULL,                -- JSON with supporting metrics
  confidence REAL DEFAULT 0.5,           -- 0.0-1.0 how confident the system is
  applied INTEGER DEFAULT 0,             -- 1 = this learning has been applied to future content
  applied_at TEXT DEFAULT NULL,
  source_agent TEXT DEFAULT NULL,        -- which agent generated the learning
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_learnings_type ON marketing_learnings(learning_type);
CREATE INDEX IF NOT EXISTS idx_learnings_applied ON marketing_learnings(applied);
CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON marketing_learnings(confidence DESC);
