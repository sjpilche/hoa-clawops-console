-- ==============================================================================
-- Migration 032: Tenacity Cadence Engine
-- Purpose: Multi-touch persistence layer for both Jake (cfo_leads) and HOA
--          (lg_engagement_queue) pipelines. Tracks every touch in a dedicated
--          table; adds cadence state columns to both lead tables.
-- ==============================================================================

-- ── cadence_touches — one row per outreach touch per lead ─────────────────────
CREATE TABLE IF NOT EXISTS cadence_touches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      INTEGER NOT NULL,
  product      TEXT    NOT NULL,  -- 'jake' | 'hoa'
  touch_number INTEGER NOT NULL,  -- 1..12
  channel      TEXT    NOT NULL DEFAULT 'email', -- email | linkedin | sms
  sent_at      TEXT,
  opened_at    TEXT,
  replied_at   TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending', -- pending | sent | opened | replied | bounced | skipped
  variant      TEXT,              -- A/B test label (e.g. 'tone_urgent', 'tone_friendly')
  rationale    TEXT,              -- why this timing/tone/channel was chosen
  run_id       TEXT,              -- FK to runs.id that actually sent this touch
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cadence_lead    ON cadence_touches(lead_id, product);
CREATE INDEX IF NOT EXISTS idx_cadence_status  ON cadence_touches(status);
CREATE INDEX IF NOT EXISTS idx_cadence_sent    ON cadence_touches(sent_at);

-- ── cfo_leads — cadence state columns ────────────────────────────────────────
ALTER TABLE cfo_leads ADD COLUMN last_touch_number INTEGER DEFAULT 0;
ALTER TABLE cfo_leads ADD COLUMN cadence_active    INTEGER DEFAULT 0;
ALTER TABLE cfo_leads ADD COLUMN next_touch_due    TEXT;

-- Activate cadence for existing outreached leads (have at least 1 sent email)
UPDATE cfo_leads
SET    cadence_active    = 1,
       last_touch_number = 1
WHERE  id IN (
  SELECT DISTINCT lead_id FROM cfo_outreach_sequences WHERE status = 'sent'
)
AND status NOT IN ('dead', 'closed', 'unsubscribed', 'bounced', 'replied', 'meeting_booked', 'pilot');

-- ── lg_engagement_queue — cadence state columns ───────────────────────────────
ALTER TABLE lg_engagement_queue ADD COLUMN last_touch_number INTEGER DEFAULT 0;
ALTER TABLE lg_engagement_queue ADD COLUMN cadence_active    INTEGER DEFAULT 0;
ALTER TABLE lg_engagement_queue ADD COLUMN next_touch_due    TEXT;

-- Activate cadence for existing posted HOA engagements
UPDATE lg_engagement_queue
SET    cadence_active    = 1,
       last_touch_number = 1
WHERE  status = 'posted';

SELECT 'Migration 032 complete: cadence_touches table + cadence columns added' AS status;
