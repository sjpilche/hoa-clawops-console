-- ==============================================================================
-- HOA CONTACT FINDER — Database Migration
-- ==============================================================================
-- Migration: 013_hoa_contacts.sql
-- Purpose: Store scraped HOA contact information for lead generation
-- Created: February 2026

-- ==============================================================================
-- HOA_CONTACTS — Scraped HOA contact records
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hoa_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- HOA Information
  hoa_name TEXT NOT NULL,
  entity_number TEXT,                    -- CA Secretary of State entity ID

  -- Contact Information
  contact_person TEXT,
  title TEXT,                            -- President, Manager, Board Member, etc.
  email TEXT,
  phone TEXT,

  -- Property Information
  property_address TEXT,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'CA',
  zip TEXT,
  unit_count INTEGER,

  -- Management Company
  management_company TEXT,

  -- Source & Quality
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,             -- 'sos', 'county', 'directory', 'property_manager'
  confidence_score INTEGER DEFAULT 50,   -- 1-100

  -- Status
  status TEXT DEFAULT 'new',             -- 'new', 'contacted', 'qualified', 'disqualified'
  notes TEXT,

  -- Deduplication
  fingerprint TEXT NOT NULL,             -- Hash of hoa_name + city + zip

  -- Metadata
  scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_contacted_at DATETIME
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hoa_contacts_status ON hoa_contacts(status);
CREATE INDEX IF NOT EXISTS idx_hoa_contacts_city ON hoa_contacts(city);
CREATE INDEX IF NOT EXISTS idx_hoa_contacts_state ON hoa_contacts(state);
CREATE INDEX IF NOT EXISTS idx_hoa_contacts_fingerprint ON hoa_contacts(fingerprint);
CREATE INDEX IF NOT EXISTS idx_hoa_contacts_scraped ON hoa_contacts(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_hoa_contacts_confidence ON hoa_contacts(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_hoa_contacts_email ON hoa_contacts(email);

-- ==============================================================================
-- HOA_SEARCH_HISTORY — Track search operations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hoa_search_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_params TEXT NOT NULL,           -- JSON: {state, city, zip_code, source}
  results_count INTEGER DEFAULT 0,
  new_contacts INTEGER DEFAULT 0,        -- Contacts added (not duplicates)
  duplicates_skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',         -- 'running', 'completed', 'failed'
  error_message TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_search_history_status ON hoa_search_history(status);
CREATE INDEX IF NOT EXISTS idx_search_history_started ON hoa_search_history(started_at DESC);
