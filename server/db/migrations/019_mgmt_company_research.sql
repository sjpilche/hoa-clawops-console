-- ============================================
-- MANAGEMENT COMPANY RESEARCH — DATABASE MIGRATION 019
-- Supports Agents 36-40 (Mgmt Company Pipeline)
-- Safe to run multiple times (IF NOT EXISTS + individual ALTERs)
-- ============================================

-- ============================================
-- ENSURE hoa_communities TABLE EXISTS
-- (Originally created by fix-state-constraint.js, not in base schema)
-- ============================================
CREATE TABLE IF NOT EXISTS hoa_communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  state TEXT,
  city TEXT,
  zip TEXT,
  county TEXT,
  unit_count INTEGER,
  website_url TEXT,
  document_portal_url TEXT,
  management_company TEXT,
  management_company_url TEXT,
  source TEXT,
  source_url TEXT,
  portal_type TEXT,
  status TEXT,
  priority INTEGER,
  last_scanned DATETIME,
  created_at DATETIME,
  google_signal_score REAL,
  google_signal_tier TEXT,
  google_signal_keywords TEXT,
  total_google_reviews INTEGER,
  signal_review_count INTEGER,
  google_last_reviewed_at TEXT,
  google_maps_url TEXT,
  google_place_id TEXT,
  avg_star_rating REAL,
  zip_code TEXT,
  phone TEXT,
  google_rating REAL,
  review_count INTEGER,
  category TEXT,
  search_query TEXT,
  geo_target_id TEXT,
  discovered_at DATETIME,
  last_seen_at DATETIME,
  needs_review_scan INTEGER DEFAULT 0,
  needs_website_scrape INTEGER DEFAULT 0,
  needs_contact_enrichment INTEGER DEFAULT 0,
  needs_minutes_scan INTEGER DEFAULT 0,
  website_scrape_status TEXT DEFAULT 'pending',
  contact_enrichment_status TEXT DEFAULT 'pending',
  review_scan_status TEXT DEFAULT 'pending',
  is_management_company INTEGER DEFAULT 0,
  management_company_id TEXT,
  address TEXT
);

-- ============================================
-- ENSURE management_companies TABLE EXISTS
-- (017_discovery_schema.sql may have been partially applied)
-- ============================================
CREATE TABLE IF NOT EXISTS management_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  portfolio_size INTEGER,
  google_rating REAL,
  review_count INTEGER,
  is_potential_partner INTEGER DEFAULT 0,
  notes TEXT,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- EXTEND management_companies TABLE
-- Add columns for CAI data, pipeline flags, vendor info, review health
-- Each ALTER is independent; migration runner catches dupes
-- ============================================

ALTER TABLE management_companies ADD COLUMN email TEXT;
ALTER TABLE management_companies ADD COLUMN hq_address TEXT;
ALTER TABLE management_companies ADD COLUMN cai_designations TEXT DEFAULT '[]';
ALTER TABLE management_companies ADD COLUMN cai_chapters TEXT DEFAULT '[]';
ALTER TABLE management_companies ADD COLUMN designated_employees TEXT DEFAULT '[]';
ALTER TABLE management_companies ADD COLUMN priority_tier TEXT DEFAULT 'UNKNOWN';
ALTER TABLE management_companies ADD COLUMN communities_managed INTEGER;
ALTER TABLE management_companies ADD COLUMN units_managed INTEGER;
ALTER TABLE management_companies ADD COLUMN communities_scraped INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN communities_mapped INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN service_states TEXT DEFAULT '[]';
ALTER TABLE management_companies ADD COLUMN service_regions TEXT DEFAULT '[]';
ALTER TABLE management_companies ADD COLUMN specializations TEXT DEFAULT '[]';
ALTER TABLE management_companies ADD COLUMN years_in_business INTEGER;
ALTER TABLE management_companies ADD COLUMN vendor_portal_url TEXT;
ALTER TABLE management_companies ADD COLUMN vendor_email TEXT;
ALTER TABLE management_companies ADD COLUMN vendor_phone TEXT;
ALTER TABLE management_companies ADD COLUMN has_vendor_program INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN email_pattern TEXT;
ALTER TABLE management_companies ADD COLUMN outreach_priority TEXT DEFAULT 'UNKNOWN';
ALTER TABLE management_companies ADD COLUMN google_review_count INTEGER;
ALTER TABLE management_companies ADD COLUMN bbb_rating TEXT;
ALTER TABLE management_companies ADD COLUMN bbb_complaint_count INTEGER;
ALTER TABLE management_companies ADD COLUMN yelp_rating REAL;
ALTER TABLE management_companies ADD COLUMN company_health TEXT DEFAULT 'unknown';
ALTER TABLE management_companies ADD COLUMN switching_signals INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN last_review_scan DATETIME;
ALTER TABLE management_companies ADD COLUMN portfolio_scraped INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN contacts_pulled INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN portfolio_mapped INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN reviews_scanned INTEGER DEFAULT 0;
ALTER TABLE management_companies ADD COLUMN source TEXT;
ALTER TABLE management_companies ADD COLUMN website TEXT;


-- ============================================
-- TABLE: mgmt_company_contacts
-- Decision makers and contact pathways
-- Fed by Agent 37 (Contact Puller)
-- ============================================
CREATE TABLE IF NOT EXISTS mgmt_company_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mgmt_company_id TEXT,
  mgmt_company_name TEXT NOT NULL,
  contact_type TEXT NOT NULL,
  full_name TEXT,
  title TEXT,
  email TEXT,
  email_quality TEXT DEFAULT 'unknown',
  phone TEXT,
  linkedin_url TEXT,
  office_location TEXT,
  region_covered TEXT,
  bio_notes TEXT,
  cai_designations TEXT,
  source_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mgmt_contacts_company ON mgmt_company_contacts(mgmt_company_id);
CREATE INDEX IF NOT EXISTS idx_mgmt_contacts_type ON mgmt_company_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_mgmt_contacts_quality ON mgmt_company_contacts(email_quality);


-- ============================================
-- TABLE: review_signals
-- Flagged reviews with signal analysis
-- Fed by Agent 39 (Review Scanner)
-- ============================================
CREATE TABLE IF NOT EXISTS review_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mgmt_company_id TEXT,
  mgmt_company_name TEXT NOT NULL,
  review_source TEXT NOT NULL,
  reviewer_name TEXT,
  review_date TEXT,
  star_rating INTEGER,
  review_text TEXT NOT NULL,
  source_url TEXT,
  community_mentioned TEXT,
  community_city TEXT,
  community_state TEXT,
  hoa_community_id INTEGER,
  tier1_signals TEXT DEFAULT '[]',
  tier2_signals TEXT DEFAULT '[]',
  tier3_signals TEXT DEFAULT '[]',
  tier4_signals TEXT DEFAULT '[]',
  signal_score INTEGER DEFAULT 0,
  primary_issue TEXT,
  urgency TEXT DEFAULT 'low',
  lead_created INTEGER DEFAULT 0,
  outreach_triggered INTEGER DEFAULT 0,
  scan_run_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_signals_company ON review_signals(mgmt_company_id);
CREATE INDEX IF NOT EXISTS idx_review_signals_community ON review_signals(community_mentioned);
CREATE INDEX IF NOT EXISTS idx_review_signals_urgency ON review_signals(urgency);
CREATE INDEX IF NOT EXISTS idx_review_signals_score ON review_signals(signal_score DESC);
CREATE INDEX IF NOT EXISTS idx_review_signals_hoa ON review_signals(hoa_community_id);


-- ============================================
-- INDEXES on management_companies new columns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_mgmt_priority ON management_companies(priority_tier);
CREATE INDEX IF NOT EXISTS idx_mgmt_health ON management_companies(company_health);
CREATE INDEX IF NOT EXISTS idx_mgmt_pipeline ON management_companies(portfolio_scraped, contacts_pulled, portfolio_mapped, reviews_scanned);


-- ============================================
-- VIEW: mgmt_company_dashboard
-- ============================================
CREATE VIEW IF NOT EXISTS mgmt_company_dashboard AS
SELECT
  mc.id,
  mc.name,
  mc.website,
  mc.website_url,
  mc.priority_tier,
  mc.cai_designations,
  mc.communities_managed,
  mc.communities_scraped,
  mc.communities_mapped,
  mc.google_rating,
  mc.bbb_rating,
  mc.company_health,
  mc.switching_signals,
  mc.outreach_priority,
  mc.has_vendor_program,
  mc.portfolio_scraped,
  mc.contacts_pulled,
  mc.portfolio_mapped,
  mc.reviews_scanned,
  CASE
    WHEN COALESCE(mc.portfolio_scraped,0) + COALESCE(mc.contacts_pulled,0) + COALESCE(mc.portfolio_mapped,0) + COALESCE(mc.reviews_scanned,0) = 4 THEN 'complete'
    WHEN COALESCE(mc.portfolio_scraped,0) + COALESCE(mc.contacts_pulled,0) + COALESCE(mc.portfolio_mapped,0) + COALESCE(mc.reviews_scanned,0) > 0 THEN 'in_progress'
    ELSE 'queued'
  END as pipeline_status,
  (SELECT COUNT(*) FROM mgmt_company_contacts mcc WHERE mcc.mgmt_company_id = mc.id) as contact_count,
  (SELECT COUNT(*) FROM review_signals rs WHERE rs.mgmt_company_id = mc.id AND rs.urgency IN ('critical', 'high')) as hot_signal_count,
  mc.created_at,
  mc.updated_at
FROM management_companies mc
ORDER BY
  CASE mc.priority_tier
    WHEN 'AAMC_TOP' THEN 1
    WHEN 'DESIGNATED' THEN 2
    WHEN 'MEMBER' THEN 3
    ELSE 4
  END,
  mc.communities_managed DESC;


-- ============================================
-- VIEW: hot_review_leads
-- Communities with critical/high urgency signals
-- ============================================
CREATE VIEW IF NOT EXISTS hot_review_leads AS
SELECT
  rs.community_mentioned as community_name,
  rs.community_city as city,
  rs.community_state as state,
  rs.mgmt_company_name as management_company,
  COUNT(*) as total_reviews,
  COUNT(DISTINCT rs.reviewer_name) as unique_reviewers,
  SUM(rs.signal_score) as combined_signal_score,
  MAX(rs.urgency) as max_urgency,
  GROUP_CONCAT(DISTINCT rs.primary_issue) as issues,
  GROUP_CONCAT(DISTINCT rs.review_source) as sources,
  MIN(rs.review_date) as earliest_mention,
  MAX(rs.review_date) as latest_mention,
  rs.hoa_community_id
FROM review_signals rs
WHERE rs.community_mentioned IS NOT NULL
  AND rs.signal_score >= 10
GROUP BY rs.community_mentioned, rs.community_city, rs.community_state
HAVING COUNT(*) >= 2
ORDER BY combined_signal_score DESC;
