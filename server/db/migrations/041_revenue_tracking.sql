-- Migration 041: Revenue Tracking + Signal Performance
-- Closes the measurement gap: tracks lead→revenue attribution and signal source performance.
-- Populated by pipelineStateTracker.js (revenue_stage) and signalPerformance.js (rollups).

-- ── cfo_leads — revenue tracking columns ──────────────────────────────────────
ALTER TABLE cfo_leads ADD COLUMN revenue_stage       TEXT DEFAULT 'discovered';
-- Values: discovered → contacted → replied → meeting → pilot → closed → revenue
-- More granular than status — tracks the money path specifically

ALTER TABLE cfo_leads ADD COLUMN close_value_cents   INTEGER DEFAULT 0;
-- Actual or estimated deal value in cents (e.g. 1000000 = $10,000)

ALTER TABLE cfo_leads ADD COLUMN conversion_date     TEXT;
-- ISO date when lead reached 'closed' or 'revenue' stage

ALTER TABLE cfo_leads ADD COLUMN days_to_close       INTEGER;
-- Days from first contact to conversion_date

ALTER TABLE cfo_leads ADD COLUMN attribution_source  TEXT;
-- Which signal/agent/method gets credit for this lead
-- Examples: 'pain_signal', 'hiring_signal', 'maps_discovery', 'lead_scout', 'data_rehab_cross_sell'

-- ── lg_engagement_queue (HOA pipeline) — same columns ─────────────────────────
ALTER TABLE lg_engagement_queue ADD COLUMN revenue_stage       TEXT DEFAULT 'discovered';
ALTER TABLE lg_engagement_queue ADD COLUMN close_value_cents   INTEGER DEFAULT 0;
ALTER TABLE lg_engagement_queue ADD COLUMN conversion_date     TEXT;
ALTER TABLE lg_engagement_queue ADD COLUMN days_to_close       INTEGER;
ALTER TABLE lg_engagement_queue ADD COLUMN attribution_source  TEXT;

-- ── Signal Performance rollup table ───────────────────────────────────────────
-- Nightly aggregation: how well does each signal source convert?
CREATE TABLE IF NOT EXISTS signal_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start     TEXT NOT NULL,          -- ISO date (start of 30-day window)
  period_end       TEXT NOT NULL,          -- ISO date (end of window)
  source           TEXT NOT NULL,          -- lead source value (pain_signal, hiring_signal, maps_discovery, etc.)
  source_agent     TEXT,                   -- jake, cfo, owen, hoa, data_rehab
  market           TEXT,                   -- city/state or NULL for aggregate
  leads_inserted   INTEGER DEFAULT 0,
  leads_enriched   INTEGER DEFAULT 0,
  leads_contacted  INTEGER DEFAULT 0,
  leads_replied    INTEGER DEFAULT 0,
  leads_meeting    INTEGER DEFAULT 0,
  leads_pilot      INTEGER DEFAULT 0,
  leads_closed     INTEGER DEFAULT 0,
  reply_rate       REAL DEFAULT 0,         -- leads_replied / leads_contacted
  conversion_rate  REAL DEFAULT 0,         -- leads_closed / leads_inserted
  avg_days_to_reply INTEGER,
  avg_close_value_cents INTEGER,
  total_revenue_cents   INTEGER DEFAULT 0,
  computed_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(period_end, source, source_agent, market)
);

CREATE INDEX IF NOT EXISTS idx_signal_perf_source ON signal_performance(source);
CREATE INDEX IF NOT EXISTS idx_signal_perf_agent  ON signal_performance(source_agent);
CREATE INDEX IF NOT EXISTS idx_signal_perf_date   ON signal_performance(period_end);

-- ── brain_fallback_episodes — add signal_source columns ───────────────────────
ALTER TABLE brain_fallback_episodes ADD COLUMN signal_source    TEXT;
ALTER TABLE brain_fallback_episodes ADD COLUMN signal_fit_score INTEGER;

-- Backfill attribution_source from existing source column
UPDATE cfo_leads SET attribution_source = source WHERE attribution_source IS NULL AND source IS NOT NULL;

-- Backfill revenue_stage from existing status
UPDATE cfo_leads SET revenue_stage = CASE
  WHEN status = 'new'         THEN 'discovered'
  WHEN status = 'contacted'   THEN 'contacted'
  WHEN status = 'replied'     THEN 'replied'
  WHEN status = 'pilot'       THEN 'pilot'
  WHEN status = 'closed_won'  THEN 'closed'
  WHEN status = 'closed_lost' THEN 'discovered'
  ELSE 'discovered'
END
WHERE revenue_stage = 'discovered' OR revenue_stage IS NULL;
