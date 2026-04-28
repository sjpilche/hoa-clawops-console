-- ============================================================================
-- 052_fence_outreach.sql
-- HOA Fence Program outreach pipeline — leads, email sequences, metrics
-- ============================================================================

-- fence_leads: prospects for fence program outreach
CREATE TABLE IF NOT EXISTS fence_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_type TEXT NOT NULL CHECK(lead_type IN ('mgmt_company', 'board_president', 'warm_contact')),
  tier INTEGER CHECK(tier IN (1, 2, 3)),
  company_name TEXT,
  community_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_title TEXT,
  homes_count INTEGER,
  linear_feet_estimate INTEGER,
  previous_project_type TEXT,         -- for warm re-engagement leads (roofing, siding, etc.)
  source TEXT DEFAULT 'manual' CHECK(source IN ('apollo', 'linkedin', 'crm', 'manual')),
  status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'replied', 'assessment_booked', 'contracted', 'lost')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- fence_outreach_sequences: email queue with per-step tracking
CREATE TABLE IF NOT EXISTS fence_outreach_sequences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES fence_leads(id),
  sequence_type TEXT NOT NULL CHECK(sequence_type IN ('cold_mgmt', 'cold_board', 'warm')),
  sequence_step INTEGER NOT NULL CHECK(sequence_step BETWEEN 1 AND 4),
  email_subject TEXT,
  email_body_html TEXT,
  email_body_text TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'approved', 'sent', 'replied', 'bounced', 'skipped')),
  scheduled_send_date DATETIME,
  approved_at DATETIME,
  sent_at DATETIME,
  opened_at DATETIME,
  replied_at DATETIME,
  delivery_status TEXT,
  delivery_error TEXT,
  sendgrid_msg_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- fence_metrics: daily rollup for dashboard
CREATE TABLE IF NOT EXISTS fence_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  leads_added INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  assessments_booked INTEGER DEFAULT 0,
  contracts_signed INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fence_leads_status ON fence_leads(status);
CREATE INDEX IF NOT EXISTS idx_fence_leads_type ON fence_leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_fence_seq_lead ON fence_outreach_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_fence_seq_status ON fence_outreach_sequences(status);
CREATE INDEX IF NOT EXISTS idx_fence_metrics_date ON fence_metrics(date);
