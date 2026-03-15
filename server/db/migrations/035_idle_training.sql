-- ==============================================================================
-- Idle Training System — Agent self-improvement when system has spare capacity
-- ==============================================================================
-- Migration: 035_idle_training.sql
-- Tables: training_sessions, agent_skills
-- Created: March 2026

-- Training sessions — one row per YouTube video watched + knowledge extracted
CREATE TABLE IF NOT EXISTS training_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id      TEXT NOT NULL,                     -- FK to agents
  agent_name    TEXT NOT NULL,                     -- Cached for quick display
  topic         TEXT NOT NULL,                     -- What they studied
  source_type   TEXT NOT NULL DEFAULT 'youtube',   -- 'youtube', 'documentation', 'stackoverflow', 'manual'
  source_url    TEXT,                              -- YouTube URL or doc link
  source_title  TEXT,                              -- Video/article title

  -- Knowledge extracted
  summary       TEXT,                              -- Ollama-generated summary of what was learned
  key_takeaways TEXT,                              -- JSON array of 3-5 bullet points
  skill_gained  TEXT,                              -- Short skill name if a new skill was acquired
  confidence    REAL DEFAULT 0.5,                  -- 0-1 how confident the agent is in the new knowledge

  -- System state at training time
  cpu_percent   REAL,                              -- CPU usage when training started
  ram_percent   REAL,                              -- RAM usage when training started

  -- Humor
  quip          TEXT,                              -- Funny one-liner about what they learned

  -- Meta
  duration_ms   INTEGER,                           -- How long the training took
  cost_usd      REAL DEFAULT 0,                    -- Should always be $0
  status        TEXT DEFAULT 'completed',          -- 'completed', 'failed', 'interrupted'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent skills — accumulated knowledge per agent (leveling system)
CREATE TABLE IF NOT EXISTS agent_skills (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id      TEXT NOT NULL,                     -- FK to agents
  agent_name    TEXT NOT NULL,
  skill_name    TEXT NOT NULL,                     -- e.g. "advanced_email_copywriting", "construction_lien_law"
  skill_level   INTEGER DEFAULT 1,                 -- 1-10, increments with each relevant training session
  times_trained INTEGER DEFAULT 1,                 -- How many sessions contributed to this skill
  last_trained  TEXT NOT NULL DEFAULT (datetime('now')),
  first_learned TEXT NOT NULL DEFAULT (datetime('now')),
  notes         TEXT,                              -- Latest learning note

  UNIQUE(agent_id, skill_name)                     -- One skill record per agent
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_training_agent ON training_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_training_created ON training_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_status ON training_sessions(status);
CREATE INDEX IF NOT EXISTS idx_skills_agent ON agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_skills_level ON agent_skills(skill_level DESC);

SELECT 'Migration 035 complete: Idle Training tables created' AS status;
