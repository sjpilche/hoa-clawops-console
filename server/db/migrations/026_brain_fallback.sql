-- ==============================================================================
-- Migration 026: Collective Brain SQLite Fallback Tables
-- ==============================================================================
-- Purpose: Local SQLite mirror of Azure SQL brain tables.
-- When Azure is unavailable, brain writes go here instead of being lost.
-- drainFallback() syncs these rows to Azure on reconnect.
-- Only observations, feedback, and episodes are mirrored (KB is distillation-only).
-- ==============================================================================

-- Mirror of shared_observations (Layer 1 — Shared Scratchpad)
CREATE TABLE IF NOT EXISTS brain_fallback_observations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  agent_name  TEXT NOT NULL,
  obs_type    TEXT NOT NULL,       -- lead_signal, market_insight, contact_found, risk_flag, content_gap
  subject     TEXT,
  content     TEXT NOT NULL,
  confidence  REAL DEFAULT 0.8,
  metadata    TEXT DEFAULT '{}',   -- JSON
  synced      INTEGER DEFAULT 0,   -- 0 = pending sync to Azure, 1 = synced
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mirror of agent_feedback (Layer 2 — Feedback Signals)
CREATE TABLE IF NOT EXISTS brain_fallback_feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name  TEXT NOT NULL,
  output_type TEXT NOT NULL,       -- outreach, content, lead
  output_id   TEXT NOT NULL,
  signal      TEXT NOT NULL,       -- approved, rejected, edited, converted, bounced
  before_text TEXT,
  after_text  TEXT,
  market      TEXT,
  notes       TEXT,
  metadata    TEXT DEFAULT '{}',
  synced      INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mirror of agent_episodes (Layer 3 — Episodic Memory)
CREATE TABLE IF NOT EXISTS brain_fallback_episodes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name    TEXT NOT NULL,
  market        TEXT,
  erp_context   TEXT,
  contact_title TEXT,
  action_taken  TEXT,
  outcome       TEXT NOT NULL,
  outcome_type  TEXT NOT NULL,     -- replied, converted, bounced, unsubscribed
  outcome_score REAL DEFAULT 0.5,
  days_to_outcome INTEGER,
  lead_id       TEXT,
  run_id        TEXT,
  synced        INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_brain_fallback_obs_synced   ON brain_fallback_observations(synced);
CREATE INDEX IF NOT EXISTS idx_brain_fallback_fb_synced    ON brain_fallback_feedback(synced);
CREATE INDEX IF NOT EXISTS idx_brain_fallback_ep_synced    ON brain_fallback_episodes(synced);

SELECT 'Migration 026 complete: brain fallback tables created' AS status;
