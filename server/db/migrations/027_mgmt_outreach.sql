-- ==============================================================================
-- Migration 027: Management Company Outreach Queue
-- ==============================================================================
-- Stores personalized outreach emails targeting HOA management company contacts.
-- Built by /api/mgmt-outreach/build, sent via SendGrid.

CREATE TABLE IF NOT EXISTS mgmt_outreach_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Company + contact
  mgmt_company_id TEXT NOT NULL,          -- FK → management_companies.id
  company_name    TEXT NOT NULL,
  contact_id      INTEGER,               -- FK → mgmt_company_contacts.id
  contact_name    TEXT,                  -- Full name of contact
  contact_email   TEXT NOT NULL,
  contact_title   TEXT,
  contact_type    TEXT,                  -- vendor_relations | biz_dev | c_suite | operations | general

  -- Email content (pre-rendered at queue-build time)
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  body_text       TEXT NOT NULL,

  -- Personalization context
  hot_community   TEXT,                  -- Most urgent community under their management
  signal_issue    TEXT,                  -- Primary issue from review signals
  signal_score    INTEGER DEFAULT 0,     -- Combined signal score

  -- Workflow status
  status          TEXT DEFAULT 'pending',  -- pending | approved | sent | failed | skipped
  approved_at     TEXT,
  sent_at         TEXT,
  error_msg       TEXT,
  sendgrid_msg_id TEXT,

  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mgmt_outreach_status  ON mgmt_outreach_queue(status);
CREATE INDEX IF NOT EXISTS idx_mgmt_outreach_company ON mgmt_outreach_queue(mgmt_company_id);
CREATE INDEX IF NOT EXISTS idx_mgmt_outreach_sent    ON mgmt_outreach_queue(sent_at);

SELECT 'Migration 027 complete: mgmt_outreach_queue created' AS status;
