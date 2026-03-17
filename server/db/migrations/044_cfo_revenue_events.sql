-- 044: CFO Revenue Events table + missing brain episode column
-- Dedicated event log for CFO pipeline revenue tracking

CREATE TABLE IF NOT EXISTS cfo_revenue_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id        TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  agent_id       TEXT,
  run_id         TEXT,
  deal_value     REAL,
  classification TEXT,
  metadata       TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rev_lead   ON cfo_revenue_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_rev_agent  ON cfo_revenue_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_rev_date   ON cfo_revenue_events(created_at);

-- Add outcome_updated_at to brain fallback episodes (outcome_score and lead_id already exist)
ALTER TABLE brain_fallback_episodes ADD COLUMN outcome_updated_at DATETIME;
