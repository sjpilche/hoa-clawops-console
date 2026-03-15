-- ==============================================================================
-- Training System Upgrade — Two-Layer Architecture with QA Gate
-- ==============================================================================
-- Migration: 036_training_upgrade.sql
-- Tables: training_queue, skill_candidates, training_benchmarks
-- ALTERs: agent_skills (lineage), training_sessions (activity type)
-- Created: March 2026

-- Training queue — pending jobs with activity type and priority
CREATE TABLE IF NOT EXISTS training_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id      TEXT NOT NULL,
  agent_name    TEXT NOT NULL,
  activity_type TEXT NOT NULL,          -- 'reflection', 'internal_corpus', 'youtube', 'maintenance', 'benchmark'
  priority      INTEGER DEFAULT 5,      -- 1-10, 10 = highest
  topic         TEXT,                   -- What to study / reflect on
  source_type   TEXT,                   -- 'brain_episode', 'brain_kb', 'past_run', 'youtube', 'maintenance_task'
  source_ref    TEXT,                   -- JSON: { episode_id, run_id, url, etc }
  status        TEXT DEFAULT 'pending', -- 'pending', 'claimed', 'completed', 'failed', 'expired'
  claimed_at    TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Skill candidates — skills live here until QA promotes them to agent_skills
CREATE TABLE IF NOT EXISTS skill_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        TEXT NOT NULL,
  agent_name      TEXT NOT NULL,
  skill_name      TEXT NOT NULL,
  summary         TEXT NOT NULL,            -- What was learned
  takeaways       TEXT,                     -- JSON array of key points
  source_activity TEXT NOT NULL,            -- 'reflection', 'internal_corpus', 'youtube'
  source_ref      TEXT,                     -- JSON: { training_session_id, episode_ids, kb_ids }
  confidence      REAL DEFAULT 0.5,         -- 0-1 from generation model
  qa_score        REAL,                     -- 0-1 from QA grading model (different prompt)
  qa_verdict      TEXT,                     -- 'pending', 'pass', 'fail', 'pass_with_notes'
  qa_notes        TEXT,                     -- Why it passed/failed
  qa_graded_at    TEXT,
  status          TEXT DEFAULT 'candidate', -- 'candidate', 'approved', 'rejected'
  promoted_at     TEXT,                     -- When moved to agent_skills
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Training benchmarks — before/after performance snapshots (pure SQL, no LLM)
CREATE TABLE IF NOT EXISTS training_benchmarks (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id           TEXT NOT NULL,
  skill_candidate_id INTEGER,              -- FK to skill_candidates
  benchmark_type     TEXT NOT NULL,         -- 'pre_training', 'post_training'
  metric_name        TEXT NOT NULL,         -- 'email_reply_rate', 'enrichment_hit_rate', etc
  metric_value       REAL NOT NULL,
  sample_size        INTEGER,              -- How many data points
  measured_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tq_agent ON training_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_tq_status ON training_queue(status);
CREATE INDEX IF NOT EXISTS idx_tq_priority ON training_queue(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_tq_activity ON training_queue(activity_type);
CREATE INDEX IF NOT EXISTS idx_sc_agent ON skill_candidates(agent_id);
CREATE INDEX IF NOT EXISTS idx_sc_status ON skill_candidates(status);
CREATE INDEX IF NOT EXISTS idx_sc_qa ON skill_candidates(qa_verdict);
CREATE INDEX IF NOT EXISTS idx_sc_created ON skill_candidates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_agent ON training_benchmarks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tb_candidate ON training_benchmarks(skill_candidate_id);

SELECT 'Migration 036 complete: Training upgrade tables created' AS status;
