-- Migration 011: Schedules table
-- Stores agent schedules for the ClawOps Console Scheduler UI

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  agent_id TEXT NOT NULL,           -- references agents.id
  agent_name TEXT,                  -- denormalized for display
  cron_expression TEXT NOT NULL,    -- cron string e.g. "0 9 * * 1"
  message TEXT NOT NULL,            -- task prompt sent to the agent
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedules_agent_id ON schedules(agent_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
