-- ==============================================================================
-- RSE Task Board — Todd assigns tasks to named agents from picked ideas
-- ==============================================================================
-- Migration: 039_rse_task_board.sql
-- Purpose: Task breakdown + assignment for Revenue Signal Engine ideas
-- Created: March 2026

CREATE TABLE IF NOT EXISTS rse_tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id   INTEGER NOT NULL,                 -- FK to rse_evaluations (the picked idea)

  -- Assignment
  assigned_to     TEXT NOT NULL,                     -- Agent name: 'scout', 'charlie', 'ralph', 'quill', 'todd'
  task_type       TEXT NOT NULL,                     -- 'research', 'build', 'qa', 'copy', 'deploy', 'monitor'
  order_index     INTEGER NOT NULL DEFAULT 1,        -- Execution order (1 = first)

  -- Task content
  title           TEXT NOT NULL,                     -- Short task title
  description     TEXT,                              -- What the agent should do
  depends_on      INTEGER,                           -- FK to rse_tasks.id (blocked until this completes)

  -- Execution
  status          TEXT NOT NULL DEFAULT 'pending',   -- 'pending', 'blocked', 'in_progress', 'completed', 'failed', 'skipped'
  priority        INTEGER NOT NULL DEFAULT 5,        -- 1-10 (10 = highest)
  result_summary  TEXT,                              -- One-line result when completed
  result_data     TEXT,                              -- JSON: full result payload

  -- Timing
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  started_at      TEXT,
  completed_at    TEXT,

  FOREIGN KEY (evaluation_id) REFERENCES rse_evaluations(id)
);

CREATE INDEX IF NOT EXISTS idx_rse_tasks_eval ON rse_tasks(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_rse_tasks_status ON rse_tasks(status);
CREATE INDEX IF NOT EXISTS idx_rse_tasks_agent ON rse_tasks(assigned_to);
