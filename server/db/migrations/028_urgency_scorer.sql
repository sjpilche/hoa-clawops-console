-- ==============================================================================
-- Migration 028: Urgency / Intent Scorer columns
-- ==============================================================================
-- Adds urgency scoring columns to cfo_leads (Jake + CFO marketing pipeline)
-- and lg_engagement_queue (HOA community engagement pipeline).
-- Populated by server/services/urgencyScorer.js — runs Monday 6 AM.

-- ── cfo_leads (Jake + CFO pipeline) ──────────────────────────────────────────
ALTER TABLE cfo_leads ADD COLUMN urgency_score     INTEGER DEFAULT 0;
ALTER TABLE cfo_leads ADD COLUMN urgency_signals   TEXT;        -- JSON array of signal objects
ALTER TABLE cfo_leads ADD COLUMN urgency_updated_at TEXT;

-- ── lg_engagement_queue (HOA pipeline) ───────────────────────────────────────
ALTER TABLE lg_engagement_queue ADD COLUMN urgency_score     INTEGER DEFAULT 0;
ALTER TABLE lg_engagement_queue ADD COLUMN urgency_signals   TEXT;        -- JSON array
ALTER TABLE lg_engagement_queue ADD COLUMN urgency_updated_at TEXT;

-- Indexes for the console "sort by urgency" UI view
CREATE INDEX IF NOT EXISTS idx_cfo_leads_urgency       ON cfo_leads(urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_lg_engagement_urgency   ON lg_engagement_queue(urgency_score DESC);

SELECT 'Migration 028 complete: urgency scoring columns added to cfo_leads + lg_engagement_queue' AS status;
