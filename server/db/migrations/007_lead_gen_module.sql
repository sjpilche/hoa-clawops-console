-- ==============================================================================
-- Lead Generation Module — Database Migration
-- ==============================================================================
-- Migration: 007_lead_gen_module.sql
-- Purpose: Add tables for HOA Networker community engagement agent
-- Tables: lg_engagement_queue, lg_community_accounts
-- Created: February 2026

-- ==============================================================================
-- LG_ENGAGEMENT_QUEUE — Networker's work queue
-- ==============================================================================
-- Every engagement opportunity found goes here for manual review and approval

CREATE TABLE IF NOT EXISTS lg_engagement_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Platform & Community
  platform TEXT NOT NULL,                    -- 'facebook', 'reddit', 'linkedin', 'biggerpockets', 'quora', 'nextdoor'
  community TEXT,                            -- Group name or subreddit
  post_url TEXT NOT NULL,                    -- Link to original post
  post_title TEXT,                           -- Title or first line
  post_summary TEXT,                         -- Brief summary of question
  post_author TEXT,                          -- Username/display name
  post_age_hours INTEGER,                    -- Age when found

  -- Relevance & Template
  relevance_score INTEGER,                   -- 1-100 how relevant to HOA financing
  recommended_template TEXT,                 -- Which response template fits

  -- Draft Response
  draft_response TEXT NOT NULL,              -- The Networker's drafted response
  includes_link BOOLEAN DEFAULT 0,           -- Whether response links to site
  link_url TEXT,                             -- Specific URL (with UTM params)

  -- Status & Approval
  status TEXT DEFAULT 'pending_review',      -- 'pending_review', 'approved', 'rejected', 'posted', 'expired'
  approved_at DATETIME,                      -- When you approved it
  posted_at DATETIME,                        -- When actually posted

  -- Engagement Tracking (updated after posting)
  engagement_likes INTEGER DEFAULT 0,        -- Likes/upvotes received
  engagement_replies INTEGER DEFAULT 0,      -- Replies/comments
  engagement_clicks INTEGER DEFAULT 0,       -- UTM-tracked clicks to site

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT                                 -- Your notes or edits
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_engagement_status ON lg_engagement_queue(status);
CREATE INDEX IF NOT EXISTS idx_engagement_platform ON lg_engagement_queue(platform);
CREATE INDEX IF NOT EXISTS idx_engagement_relevance ON lg_engagement_queue(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_created ON lg_engagement_queue(created_at DESC);

-- ==============================================================================
-- LG_COMMUNITY_ACCOUNTS — Tracked communities
-- ==============================================================================
-- Tracks which communities The Networker monitors and our reputation in each

CREATE TABLE IF NOT EXISTS lg_community_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Community Info
  platform TEXT NOT NULL,                    -- Platform name
  community_name TEXT NOT NULL,              -- Group/subreddit/forum name
  community_url TEXT,                        -- Direct link
  member_count INTEGER,                      -- Size of community

  -- Our Status
  our_status TEXT DEFAULT 'discovered',      -- 'discovered', 'joined', 'lurking', 'active', 'established'
  joined_at DATETIME,                        -- When we joined

  -- Performance Metrics
  posts_made INTEGER DEFAULT 0,              -- Responses posted in this community
  avg_engagement REAL DEFAULT 0,             -- Average likes/replies per response
  last_scanned DATETIME,                     -- Last time agent checked

  -- Community Rules
  rules_notes TEXT,                          -- Relevant posting rules
  is_active BOOLEAN DEFAULT 1,               -- Whether to keep monitoring

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_platform ON lg_community_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_community_status ON lg_community_accounts(our_status);
CREATE INDEX IF NOT EXISTS idx_community_active ON lg_community_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_community_last_scan ON lg_community_accounts(last_scanned);

-- ==============================================================================
-- Verify Migration
-- ==============================================================================
-- Check that tables were created successfully
SELECT 'Migration 007 complete: Lead Gen Module tables created' AS status;
