-- HOA Lead Engine — Discovery Pipeline Schema Extension
-- Migration 017: Adds geo-targets, discovery tracking, and management companies
-- Safe to re-run (all CREATE IF NOT EXISTS / ALTER TABLE with guards)

-- ============================================
-- GEO TARGETS — Where we search
-- ============================================
CREATE TABLE IF NOT EXISTS geo_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cities TEXT NOT NULL DEFAULT '[]',        -- JSON array of {city, state} objects
  states TEXT NOT NULL DEFAULT '[]',        -- JSON array of state codes
  zip_codes TEXT NOT NULL DEFAULT '[]',     -- JSON array of ZIP strings
  is_active INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 5,      -- 1 = highest
  last_sweep_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ADD MISSING COLUMNS TO hoa_communities
-- ============================================

-- Discovery tracking columns (skip if already exist)
ALTER TABLE hoa_communities ADD COLUMN address TEXT;
ALTER TABLE hoa_communities ADD COLUMN zip_code TEXT;
ALTER TABLE hoa_communities ADD COLUMN phone TEXT;
ALTER TABLE hoa_communities ADD COLUMN google_rating REAL;
ALTER TABLE hoa_communities ADD COLUMN review_count INTEGER DEFAULT 0;
ALTER TABLE hoa_communities ADD COLUMN category TEXT;
ALTER TABLE hoa_communities ADD COLUMN search_query TEXT;
ALTER TABLE hoa_communities ADD COLUMN geo_target_id TEXT;
ALTER TABLE hoa_communities ADD COLUMN discovered_at DATETIME;
ALTER TABLE hoa_communities ADD COLUMN last_seen_at DATETIME;
ALTER TABLE hoa_communities ADD COLUMN needs_review_scan INTEGER DEFAULT 1;
ALTER TABLE hoa_communities ADD COLUMN needs_website_scrape INTEGER DEFAULT 1;
ALTER TABLE hoa_communities ADD COLUMN needs_contact_enrichment INTEGER DEFAULT 1;
ALTER TABLE hoa_communities ADD COLUMN needs_minutes_scan INTEGER DEFAULT 1;
ALTER TABLE hoa_communities ADD COLUMN website_scrape_status TEXT DEFAULT 'pending';
ALTER TABLE hoa_communities ADD COLUMN contact_enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE hoa_communities ADD COLUMN review_scan_status TEXT DEFAULT 'pending';
ALTER TABLE hoa_communities ADD COLUMN is_management_company INTEGER DEFAULT 0;
ALTER TABLE hoa_communities ADD COLUMN management_company_id TEXT;

-- ============================================
-- DISCOVERY SEARCH LOG — Track every search
-- ============================================
CREATE TABLE IF NOT EXISTS discovery_searches (
  id TEXT PRIMARY KEY,
  geo_target_id TEXT NOT NULL,
  search_query TEXT NOT NULL,
  search_type TEXT DEFAULT 'primary',       -- primary, secondary, tertiary
  results_found INTEGER DEFAULT 0,
  new_communities INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  pages_scraped INTEGER DEFAULT 0,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER,
  error_message TEXT,
  FOREIGN KEY (geo_target_id) REFERENCES geo_targets(id)
);

-- ============================================
-- AGENT RUNS — Track each agent execution
-- ============================================
CREATE TABLE IF NOT EXISTS discovery_agent_runs (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  geo_target TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at DATETIME,
  completed_at DATETIME,
  results_count INTEGER DEFAULT 0,
  new_records INTEGER DEFAULT 0,
  updated_records INTEGER DEFAULT 0,
  error_message TEXT,
  cost_estimate REAL DEFAULT 0,
  run_metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MANAGEMENT COMPANIES
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, state)
);

-- ============================================
-- MGMT COMPANY <-> HOA RELATIONSHIP
-- ============================================
CREATE TABLE IF NOT EXISTS mgmt_community_map (
  id TEXT PRIMARY KEY,
  management_company_id TEXT NOT NULL,
  hoa_community_id INTEGER NOT NULL,
  relationship_source TEXT,
  confirmed INTEGER DEFAULT 0,
  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (management_company_id) REFERENCES management_companies(id),
  UNIQUE(management_company_id, hoa_community_id)
);

-- ============================================
-- INDEXES for query performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_communities_geo ON hoa_communities(geo_target_id);
CREATE INDEX IF NOT EXISTS idx_communities_rating ON hoa_communities(google_rating);
CREATE INDEX IF NOT EXISTS idx_searches_geo ON discovery_searches(geo_target_id);
CREATE INDEX IF NOT EXISTS idx_mgmt_portfolio ON management_companies(portfolio_size DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_agent_runs(status);

-- ============================================
-- VIEW: Pipeline status by state
-- ============================================
CREATE VIEW IF NOT EXISTS v_pipeline_status AS
SELECT
  state,
  COUNT(*) as total_communities,
  SUM(CASE WHEN needs_website_scrape = 1 THEN 1 ELSE 0 END) as awaiting_scrape,
  SUM(CASE WHEN needs_review_scan = 1 THEN 1 ELSE 0 END) as awaiting_review_scan,
  SUM(CASE WHEN needs_contact_enrichment = 1 THEN 1 ELSE 0 END) as awaiting_contact_enrichment,
  SUM(CASE WHEN website_url IS NOT NULL THEN 1 ELSE 0 END) as has_website,
  SUM(CASE WHEN google_rating IS NOT NULL THEN 1 ELSE 0 END) as has_rating,
  ROUND(AVG(google_rating), 2) as avg_rating,
  SUM(review_count) as total_reviews
FROM hoa_communities
WHERE is_management_company = 0
GROUP BY state
ORDER BY total_communities DESC;

-- ============================================
-- VIEW: Low-rated communities (hot signals)
-- ============================================
CREATE VIEW IF NOT EXISTS v_low_rated_communities AS
SELECT
  name, city, state, zip_code, google_rating, review_count,
  website_url, management_company, discovered_at
FROM hoa_communities
WHERE google_rating IS NOT NULL
  AND google_rating <= 3.0
  AND review_count >= 5
  AND is_management_company = 0
ORDER BY google_rating ASC, review_count DESC;
