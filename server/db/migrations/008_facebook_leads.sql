-- ==============================================================================
-- Facebook Lead Generation — Database Migration
-- ==============================================================================
-- Migration: 008_facebook_leads.sql
-- Purpose: Add table for Facebook Lead Ads integration
-- Tables: leads
-- Created: February 2026

-- ==============================================================================
-- LEADS — Facebook Lead Ads storage
-- ==============================================================================
-- Stores leads captured from Facebook Lead Ads for HOA Project Funding

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source & Identity
  source TEXT NOT NULL,                      -- e.g., 'facebook_Lead Form Name'
  facebook_lead_id TEXT UNIQUE,              -- Facebook's unique lead ID

  -- Lead Information
  name TEXT,                                 -- Contact name
  email TEXT,                                -- Email address
  phone TEXT,                                -- Phone number
  company TEXT,                              -- Company/HOA name

  -- Additional Data
  raw_data TEXT,                             -- JSON: all form fields as submitted

  -- Lead Management
  status TEXT DEFAULT 'new',                 -- 'new', 'contacted', 'qualified', 'converted', 'dead'
  score INTEGER DEFAULT 0,                   -- Lead quality score (0-100)
  assigned_to TEXT,                          -- User ID of assigned sales rep

  -- Follow-up Tracking
  last_contacted_at DATETIME,                -- Last time we reached out
  next_follow_up_at DATETIME,                -- Scheduled next contact
  follow_up_count INTEGER DEFAULT 0,         -- Number of follow-ups sent

  -- Conversion Tracking
  converted_at DATETIME,                     -- When lead became customer
  conversion_value REAL,                     -- Deal value in USD

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT                                 -- Internal notes
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_facebook_id ON leads(facebook_lead_id);

-- ==============================================================================
-- Verify Migration
-- ==============================================================================
SELECT 'Migration 008 complete: Facebook Leads table created' AS status;
