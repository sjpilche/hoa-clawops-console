-- ==============================================================================
-- Migration: 022_agent_pipelines.sql
-- Purpose: Agent pipeline orchestration — completion-triggered chaining
-- ==============================================================================

-- Pipeline definitions — each pipeline is a named sequence of agent steps
CREATE TABLE IF NOT EXISTS agent_pipelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,                -- 'hoa-discovery-pipeline'
  description TEXT,                          -- Human description
  domain TEXT,                               -- 'hoa', 'jake', 'cfo', 'mgmt'
  steps TEXT NOT NULL,                       -- JSON array: [{agent_name, delay_minutes, message_template}]
  is_active INTEGER DEFAULT 1,              -- 1 = active, 0 = paused
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Pipeline run instances — tracks execution of a pipeline from start to finish
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id INTEGER NOT NULL,             -- FK to agent_pipelines
  status TEXT DEFAULT 'running',            -- 'running', 'completed', 'failed', 'paused'
  current_step INTEGER DEFAULT 0,           -- Index into pipeline.steps[]
  total_steps INTEGER NOT NULL,             -- Total number of steps
  trigger_type TEXT DEFAULT 'manual',       -- 'manual', 'scheduled', 'blitz'
  context TEXT DEFAULT '{}',                -- JSON: accumulated output from prior steps
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (pipeline_id) REFERENCES agent_pipelines(id)
);

-- Links individual agent runs back to their pipeline run + step
CREATE TABLE IF NOT EXISTS pipeline_run_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_run_id INTEGER NOT NULL,         -- FK to pipeline_runs
  step_index INTEGER NOT NULL,              -- Which step (0-based)
  agent_name TEXT NOT NULL,                 -- Agent slug
  run_id TEXT,                              -- FK to runs table (filled when run starts)
  status TEXT DEFAULT 'pending',            -- 'pending', 'waiting', 'running', 'completed', 'failed', 'skipped'
  input_context TEXT,                       -- JSON: context passed to this step
  output_summary TEXT,                      -- JSON: summary of output for next step
  delay_minutes INTEGER DEFAULT 0,          -- Delay before starting this step
  scheduled_for TEXT,                       -- When this step should execute (after delay)
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run ON pipeline_run_steps(pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_status ON pipeline_run_steps(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_agent ON pipeline_run_steps(agent_name);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run_id ON pipeline_run_steps(run_id);

SELECT 'Migration 022 complete: Agent pipeline tables created' AS status;
