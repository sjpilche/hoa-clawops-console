-- ==============================================================================
-- Dream Team Nightly Learning Cycle — Database Schema
-- ==============================================================================
-- Migration: 040_dream_team_nightly.sql
-- Purpose: Scorecards, learned patterns, overnight actions, morning reports
-- for the Dream Team (Todd, Scout, Charlie, Ralph, Quill)
-- Created: March 2026

-- ==============================================================================
-- DT_DAILY_SNAPSHOTS — Raw performance data collected at 11 PM
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dt_daily_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date   TEXT NOT NULL UNIQUE,     -- '2026-03-14'
  data            TEXT NOT NULL,            -- JSON: full day's metrics for all agents
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==============================================================================
-- DT_SCORECARDS — One row per Dream Team agent per night
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dt_scorecards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name      TEXT NOT NULL,            -- 'todd','scout','charlie','ralph','quill'
  score_date      TEXT NOT NULL,            -- '2026-03-14'

  -- 4 dimension scores (0-100 each)
  dim1_name       TEXT NOT NULL,
  dim1_score      INTEGER NOT NULL,
  dim2_name       TEXT NOT NULL,
  dim2_score      INTEGER NOT NULL,
  dim3_name       TEXT NOT NULL,
  dim3_score      INTEGER NOT NULL,
  dim4_name       TEXT NOT NULL,
  dim4_score      INTEGER NOT NULL,

  -- Composite
  composite_score INTEGER NOT NULL,         -- weighted average
  grade           TEXT NOT NULL,            -- 'A','B','C','D','F'

  -- Trend
  prev_composite  INTEGER,                 -- yesterday's composite
  trend           TEXT,                     -- 'up','down','stable'

  -- LLM assessment
  assessment      TEXT,                     -- 1-2 sentence summary
  recommendations TEXT,                     -- JSON array of improvements

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_name, score_date)
);

CREATE INDEX IF NOT EXISTS idx_dt_scorecards_date ON dt_scorecards(score_date);
CREATE INDEX IF NOT EXISTS idx_dt_scorecards_agent ON dt_scorecards(agent_name);

-- ==============================================================================
-- DT_LEARNED_PATTERNS — Dynamic instructions per agent (injected at runtime)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dt_learned_patterns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name      TEXT NOT NULL,            -- which Dream Team member owns this
  pattern_text    TEXT NOT NULL,            -- the actual instruction/insight
  category        TEXT NOT NULL,            -- 'timing','quality','workflow','outreach','enrichment','building','scoring'
  confidence      REAL NOT NULL DEFAULT 0.5,-- 0-1, increases with verification

  -- Provenance
  source_type     TEXT NOT NULL,            -- 'self_assessment','brain_distillation','manual','scorecard'
  source_scorecard_id INTEGER,              -- FK to dt_scorecards
  evidence        TEXT,                     -- JSON: what data supports this

  -- Lifecycle
  status          TEXT NOT NULL DEFAULT 'proposed', -- 'proposed','active','suspended','verified','archived'
  version         INTEGER NOT NULL DEFAULT 1,
  activated_at    TEXT,
  suspended_at    TEXT,
  suspension_reason TEXT,

  -- Anti-drift tracking
  pre_activation_score INTEGER,            -- agent's composite when activated
  post_activation_score INTEGER,           -- agent's composite 3 days later

  -- QA
  qa_verdict      TEXT,                     -- 'PASS','REJECT' from Ralph
  qa_notes        TEXT,
  qa_reviewed_at  TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dt_patterns_agent ON dt_learned_patterns(agent_name);
CREATE INDEX IF NOT EXISTS idx_dt_patterns_status ON dt_learned_patterns(status);

-- ==============================================================================
-- DT_OVERNIGHT_ACTIONS — What Todd changed overnight
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dt_overnight_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  action_date     TEXT NOT NULL,            -- '2026-03-14'
  action_type     TEXT NOT NULL,            -- 'schedule_adjust','content_approve','worker_reassign','pattern_suspend','pattern_activate'
  target          TEXT NOT NULL,            -- what was changed
  old_value       TEXT,                     -- previous state (JSON)
  new_value       TEXT,                     -- new state (JSON)
  reason          TEXT NOT NULL,            -- why Todd made this change
  status          TEXT NOT NULL DEFAULT 'executed', -- 'executed','blocked','overridden_by_steve'
  blocked_reason  TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dt_actions_date ON dt_overnight_actions(action_date);

-- ==============================================================================
-- DT_PATTERN_AUDIT — Full audit trail for pattern state changes
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dt_pattern_audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id      INTEGER NOT NULL,         -- FK to dt_learned_patterns
  action          TEXT NOT NULL,            -- 'proposed','activated','suspended','verified','archived','rejected'
  actor           TEXT NOT NULL,            -- 'ralph','todd','steve','system'
  reason          TEXT,
  scorecard_snapshot TEXT,                  -- JSON: agent's scorecard at time of action

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (pattern_id) REFERENCES dt_learned_patterns(id)
);

CREATE INDEX IF NOT EXISTS idx_dt_audit_pattern ON dt_pattern_audit(pattern_id);

-- ==============================================================================
-- DT_MORNING_REPORTS — Stored morning accountability reports
-- ==============================================================================
CREATE TABLE IF NOT EXISTS dt_morning_reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date     TEXT NOT NULL UNIQUE,     -- '2026-03-14'
  report_text     TEXT NOT NULL,            -- Full formatted report
  scorecards_json TEXT NOT NULL,            -- JSON: all 5 scorecards
  actions_json    TEXT NOT NULL,            -- JSON: all overnight actions
  patterns_json   TEXT NOT NULL,            -- JSON: patterns proposed/approved/rejected
  overrides_needed TEXT,                    -- JSON: items requiring Steve's decision
  discord_posted  INTEGER NOT NULL DEFAULT 0,

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
