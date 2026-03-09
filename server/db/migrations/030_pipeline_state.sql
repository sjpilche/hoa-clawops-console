-- ==============================================================================
-- Migration 030: Pipeline State Tracker
-- ==============================================================================
-- Adds stage tracking columns to cfo_leads + lg_engagement_queue, and creates
-- a pipeline_events audit log for every stage transition.
-- Populated by server/services/pipelineStateTracker.js ($0/run — pure SQL).

-- ── cfo_leads (Jake + CFO pipeline) ──────────────────────────────────────────
ALTER TABLE cfo_leads ADD COLUMN pipeline_stage      TEXT DEFAULT 'New';
ALTER TABLE cfo_leads ADD COLUMN stage_entered_at    TEXT;
ALTER TABLE cfo_leads ADD COLUMN days_in_stage       INTEGER DEFAULT 0;
ALTER TABLE cfo_leads ADD COLUMN next_action         TEXT;
ALTER TABLE cfo_leads ADD COLUMN next_action_due     TEXT;
ALTER TABLE cfo_leads ADD COLUMN stalled             INTEGER DEFAULT 0;

-- ── lg_engagement_queue (HOA pipeline) ───────────────────────────────────────
ALTER TABLE lg_engagement_queue ADD COLUMN pipeline_stage      TEXT DEFAULT 'New';
ALTER TABLE lg_engagement_queue ADD COLUMN stage_entered_at    TEXT;
ALTER TABLE lg_engagement_queue ADD COLUMN days_in_stage       INTEGER DEFAULT 0;
ALTER TABLE lg_engagement_queue ADD COLUMN next_action         TEXT;
ALTER TABLE lg_engagement_queue ADD COLUMN next_action_due     TEXT;
ALTER TABLE lg_engagement_queue ADD COLUMN stalled             INTEGER DEFAULT 0;

-- ── pipeline_events — immutable audit log of every stage change ───────────────
CREATE TABLE IF NOT EXISTS pipeline_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     INTEGER NOT NULL,
  product     TEXT    NOT NULL,          -- 'jake' | 'hoa'
  from_stage  TEXT,
  to_stage    TEXT    NOT NULL,
  agent       TEXT,                      -- which agent/service caused the change
  action      TEXT,                      -- action that was taken
  timestamp   TEXT    NOT NULL DEFAULT (datetime('now')),
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_lead    ON pipeline_events(lead_id, product);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_ts      ON pipeline_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_stage   ON pipeline_events(to_stage);

-- ── Indexes for "leads needing work" queries ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cfo_leads_pipeline      ON cfo_leads(pipeline_stage, next_action_due);
CREATE INDEX IF NOT EXISTS idx_cfo_leads_stalled       ON cfo_leads(stalled, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_lg_pipeline             ON lg_engagement_queue(pipeline_stage, next_action_due);
CREATE INDEX IF NOT EXISTS idx_lg_stalled              ON lg_engagement_queue(stalled, pipeline_stage);

SELECT 'Migration 030 complete: pipeline_stage columns + pipeline_events table added' AS status;
