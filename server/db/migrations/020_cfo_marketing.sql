-- Migration 020: CFO AI Suite Marketing System
-- Phase 0: Paid Pilot Blitz infrastructure
-- Targets: $10M-$75M construction companies using Vista/Sage300/QBE

CREATE TABLE IF NOT EXISTS cfo_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  erp_type TEXT,                          -- Vista, Sage300, QBE, Unknown
  revenue_range TEXT,                     -- e.g. "$10M-$25M"
  employee_count INTEGER,
  contact_name TEXT,
  contact_title TEXT,                     -- CFO, Controller, VP Finance
  contact_email TEXT,
  contact_linkedin TEXT,
  website TEXT,
  state TEXT,
  city TEXT,
  pilot_fit_score INTEGER DEFAULT 0,      -- 0-100
  pilot_fit_reason TEXT,
  status TEXT DEFAULT 'new',              -- new, contacted, replied, pilot, closed_won, closed_lost
  source TEXT,                            -- lead_scout, manual, referral
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cfo_outreach_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES cfo_leads(id),
  sequence_type TEXT DEFAULT 'blitz',     -- blitz, nurture, follow_up
  email_subject TEXT,
  email_body TEXT,
  pilot_offer TEXT,                       -- spend_leak, close_acceleration, get_paid_faster
  status TEXT DEFAULT 'draft',            -- draft, approved, sent, replied, bounced
  sent_at TEXT,
  replied_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cfo_content_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pillar TEXT,                            -- cash_flow, cost_control, pilot_proof, trust_envelope
  channel TEXT,                           -- linkedin, blog, email, landing_page
  title TEXT,
  content_markdown TEXT,
  cta TEXT,
  status TEXT DEFAULT 'draft',            -- draft, approved, published
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_cfo_leads_status ON cfo_leads(status);
CREATE INDEX IF NOT EXISTS idx_cfo_leads_erp_type ON cfo_leads(erp_type);
CREATE INDEX IF NOT EXISTS idx_cfo_leads_pilot_fit ON cfo_leads(pilot_fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_cfo_outreach_lead ON cfo_outreach_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_cfo_outreach_status ON cfo_outreach_sequences(status);
CREATE INDEX IF NOT EXISTS idx_cfo_content_status ON cfo_content_pieces(status);
