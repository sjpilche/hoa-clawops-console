-- ============================================================================
-- 053_fence_quotes.sql
-- AI-powered fence quote generation and storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS fence_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES fence_leads(id),

  -- Community info
  community_name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  homes_count INTEGER,
  role TEXT CHECK(role IN ('board_member', 'property_manager', 'homeowner', 'other')),

  -- Fence details
  fence_type TEXT CHECK(fence_type IN ('wood', 'vinyl', 'metal', 'mixed', 'unknown')),
  common_lf INTEGER,
  private_lf INTEGER,
  fence_condition TEXT CHECK(fence_condition IN ('good', 'fair', 'poor', 'unknown')),
  last_painted TEXT,

  -- Pricing (deterministic)
  common_area_total REAL,
  private_fence_total REAL,
  assessment_fee REAL DEFAULT 1500,
  management_fee REAL DEFAULT 2500,
  total_estimate REAL,

  -- AI output
  ai_summary TEXT,
  ai_confidence TEXT CHECK(ai_confidence IN ('high', 'medium', 'low')),
  estimation_method TEXT DEFAULT 'manual' CHECK(estimation_method IN ('manual', 'ai_estimate', 'satellite', 'spec_parse')),
  source_text TEXT,

  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  timeline TEXT,
  notes TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'viewed', 'converted')),
  sent_at DATETIME,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fence_quotes_status ON fence_quotes(status);
CREATE INDEX IF NOT EXISTS idx_fence_quotes_community ON fence_quotes(community_name);
