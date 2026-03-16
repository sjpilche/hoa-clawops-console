-- Migration 035a: Revenue Attribution — CREATE TABLE statements
-- These use IF NOT EXISTS and are safe to re-run.
-- ALTER TABLE statements moved to 035b (separate file for sql.js compatibility).

CREATE TABLE IF NOT EXISTS revenue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  lead_table TEXT NOT NULL DEFAULT 'cfo_leads',
  event_type TEXT NOT NULL,
  revenue_stage_before TEXT,
  revenue_stage_after TEXT,
  value_cents INTEGER DEFAULT NULL,
  agent_name TEXT,
  sequence_id INTEGER DEFAULT NULL,
  touch_number INTEGER DEFAULT NULL,
  channel TEXT DEFAULT NULL,
  metadata TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
