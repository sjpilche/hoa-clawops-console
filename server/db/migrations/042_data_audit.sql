-- 042_data_audit.sql — Data Audit Service (Lane 3: Service Arbitrage)
-- Stores audit requests, results, and delivery tracking.
-- 2026-03-15

CREATE TABLE IF NOT EXISTS audit_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  company_name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  erp_system TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  source TEXT DEFAULT 'manual',          -- manual | stripe | fiverr | upwork | landing_page
  payment_status TEXT DEFAULT 'free',    -- free | paid | pending
  stripe_payment_id TEXT,
  amount_cents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',         -- pending | processing | completed | failed | delivered
  chaos_score INTEGER DEFAULT 0,        -- 0-100 data chaos assessment
  report_json TEXT,                      -- full audit result
  report_pdf_path TEXT,                  -- path to generated PDF
  delivered_at DATETIME,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_requests_status ON audit_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_requests_email ON audit_requests(contact_email);
CREATE INDEX IF NOT EXISTS idx_audit_requests_created ON audit_requests(created_at);
