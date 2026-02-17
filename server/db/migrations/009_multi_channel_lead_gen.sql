-- Multi-Channel Lead Generation Database Schema
-- Date: February 16, 2026
-- Purpose: Track leads from 17 different channels (Facebook, Reddit, LinkedIn, etc.)

-- ============================================================================
-- ENGAGEMENT QUEUE (for community posts approval workflow)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lg_engagement_queue (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL, -- 'facebook', 'reddit', 'linkedin', 'biggerpockets', 'hoatalk'
  post_url TEXT UNIQUE NOT NULL,
  post_title TEXT,
  post_body TEXT,
  author_name TEXT,
  detected_signals TEXT, -- JSON array of detected keywords
  relevance_score INTEGER DEFAULT 0, -- 0-100
  draft_response TEXT,
  status TEXT DEFAULT 'pending_review', -- 'pending_review', 'approved', 'rejected', 'posted', 'expired'
  reviewed_by TEXT,
  reviewed_at TEXT,
  posted_at TEXT,
  engagement_received TEXT, -- JSON object tracking replies, upvotes, etc.
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_engagement_queue_status ON lg_engagement_queue(status);
CREATE INDEX IF NOT EXISTS idx_engagement_queue_platform ON lg_engagement_queue(platform);
CREATE INDEX IF NOT EXISTS idx_engagement_queue_score ON lg_engagement_queue(relevance_score DESC);

-- ============================================================================
-- LINKEDIN PROSPECTING (for automated outreach)
-- ============================================================================

CREATE TABLE IF NOT EXISTS linkedin_prospects (
  id TEXT PRIMARY KEY,
  linkedin_url TEXT UNIQUE,
  full_name TEXT,
  title TEXT,
  company TEXT,
  location TEXT,
  connection_status TEXT DEFAULT 'pending', -- 'pending', 'connected', 'messaged', 'responded', 'qualified'
  first_message_sent_at TEXT,
  last_interaction_at TEXT,
  response_count INTEGER DEFAULT 0,
  lead_score INTEGER DEFAULT 0, -- 0-100
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS linkedin_messages (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'connection_request', 'first_message', 'follow_up', 'response'
  message_text TEXT,
  sent_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (prospect_id) REFERENCES linkedin_prospects(id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_prospects_status ON linkedin_prospects(connection_status);
CREATE INDEX IF NOT EXISTS idx_linkedin_messages_prospect ON linkedin_messages(prospect_id);

-- ============================================================================
-- EMAIL PROSPECTING (for cold email campaigns)
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_prospects (
  id TEXT PRIMARY KEY,
  company_name TEXT,
  contact_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  website TEXT,
  hoas_managed INTEGER,
  state_code TEXT,
  source TEXT, -- 'cai_directory', 'state_license', 'google_maps'
  status TEXT DEFAULT 'new', -- 'new', 'emailed', 'opened', 'clicked', 'replied', 'qualified', 'disqualified'
  first_email_sent_at TEXT,
  last_contacted_at TEXT,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  lead_score INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_sequences (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  sequence_type TEXT NOT NULL, -- 'cold_outreach', 'follow_up', 'nurture'
  sequence_step INTEGER,
  email_subject TEXT,
  email_body TEXT,
  scheduled_for TEXT,
  sent_at TEXT,
  opened_at TEXT,
  clicked_at TEXT,
  replied_at TEXT,
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'sent', 'opened', 'clicked', 'replied'
  FOREIGN KEY (prospect_id) REFERENCES email_prospects(id)
);

CREATE INDEX IF NOT EXISTS idx_email_prospects_status ON email_prospects(status);
CREATE INDEX IF NOT EXISTS idx_email_sequences_scheduled ON email_sequences(scheduled_for);

-- ============================================================================
-- QUORA CONTENT TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS quora_questions (
  id TEXT PRIMARY KEY,
  question_url TEXT UNIQUE NOT NULL,
  question_text TEXT,
  view_count INTEGER DEFAULT 0,
  answer_count INTEGER DEFAULT 0,
  topic_tags TEXT, -- JSON array
  relevance_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- 'pending', 'answered', 'skipped'
  answered_at TEXT,
  our_answer_views INTEGER DEFAULT 0,
  our_answer_upvotes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quora_status ON quora_questions(status);
CREATE INDEX IF NOT EXISTS idx_quora_relevance ON quora_questions(relevance_score DESC);

-- ============================================================================
-- GOOGLE ADS PERFORMANCE (for monitoring)
-- ============================================================================

CREATE TABLE IF NOT EXISTS google_ads_campaigns (
  id TEXT PRIMARY KEY,
  campaign_name TEXT NOT NULL,
  campaign_id TEXT UNIQUE, -- Google Ads campaign ID
  daily_budget REAL,
  total_spent REAL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cost_per_lead REAL,
  status TEXT DEFAULT 'active',
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_google_ads_status ON google_ads_campaigns(status);

-- ============================================================================
-- WEBINAR TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS webinars (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT,
  scheduled_for TEXT,
  duration_minutes INTEGER DEFAULT 60,
  platform TEXT DEFAULT 'zoom', -- 'zoom', 'google_meet'
  registration_url TEXT,
  replay_url TEXT,
  total_registered INTEGER DEFAULT 0,
  total_attended INTEGER DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  status TEXT DEFAULT 'planned', -- 'planned', 'scheduled', 'completed', 'cancelled'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webinar_registrants (
  id TEXT PRIMARY KEY,
  webinar_id TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  hoa_name TEXT,
  role TEXT, -- 'board_member', 'manager', 'homeowner', 'other'
  state_code TEXT,
  registered_at TEXT DEFAULT (datetime('now')),
  attended BOOLEAN DEFAULT 0,
  attended_duration_minutes INTEGER DEFAULT 0,
  lead_score INTEGER DEFAULT 0,
  FOREIGN KEY (webinar_id) REFERENCES webinars(id)
);

CREATE INDEX IF NOT EXISTS idx_webinars_status ON webinars(status);
CREATE INDEX IF NOT EXISTS idx_webinar_registrants_webinar ON webinar_registrants(webinar_id);

-- ============================================================================
-- PARTNERSHIP REFERRAL TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS referral_partners (
  id TEXT PRIMARY KEY,
  partner_name TEXT NOT NULL,
  partner_type TEXT NOT NULL, -- 'roofing', 'paving', 'structural', 'elevator', 'waterproofing', 'reserve_study'
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  status TEXT DEFAULT 'prospecting', -- 'prospecting', 'active', 'inactive'
  agreement_signed_at TEXT,
  total_referrals INTEGER DEFAULT 0,
  qualified_referrals INTEGER DEFAULT 0,
  closed_deals INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  lead_id TEXT, -- FK to leads table (optional, may not exist yet)
  hoa_name TEXT,
  project_type TEXT,
  project_value REAL,
  referral_date TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'closed', 'lost'
  closed_date TEXT,
  deal_size REAL,
  FOREIGN KEY (partner_id) REFERENCES referral_partners(id)
);

CREATE INDEX IF NOT EXISTS idx_referral_partners_status ON referral_partners(status);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- ============================================================================
-- YOUTUBE VIDEO TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS youtube_videos (
  id TEXT PRIMARY KEY,
  video_id TEXT UNIQUE, -- YouTube video ID
  title TEXT NOT NULL,
  description TEXT,
  publish_date TEXT,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  watch_time_minutes INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  status TEXT DEFAULT 'published',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_youtube_videos_status ON youtube_videos(status);

-- ============================================================================
-- PODCAST OUTREACH TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS podcasts (
  id TEXT PRIMARY KEY,
  podcast_name TEXT NOT NULL,
  host_name TEXT,
  contact_email TEXT,
  website TEXT,
  category TEXT, -- 'property_mgmt', 'real_estate_investing', 'hoa_focused'
  audience_size INTEGER,
  status TEXT DEFAULT 'researched', -- 'researched', 'pitched', 'booked', 'recorded', 'published'
  pitch_sent_at TEXT,
  scheduled_for TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_podcasts_status ON podcasts(status);

-- ============================================================================
-- CHANNEL PERFORMANCE TRACKING (CRITICAL for ROI analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS channel_performance (
  id TEXT PRIMARY KEY,
  channel_name TEXT NOT NULL, -- 'facebook_groups', 'reddit', 'linkedin', etc.
  date TEXT NOT NULL, -- YYYY-MM-DD
  leads_generated INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  cost_per_lead REAL,
  conversion_rate REAL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(channel_name, date)
);

CREATE INDEX IF NOT EXISTS idx_channel_perf_date ON channel_performance(date DESC);
CREATE INDEX IF NOT EXISTS idx_channel_perf_channel ON channel_performance(channel_name);

-- ============================================================================
-- LEAD NURTURE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_touches (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  touch_type TEXT NOT NULL, -- 'email', 'call', 'demo', 'proposal', 'follow_up'
  touch_date TEXT DEFAULT (datetime('now')),
  agent_id TEXT, -- Which agent made the touch
  notes TEXT,
  outcome TEXT, -- 'connected', 'no_response', 'qualified', 'disqualified'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_touches_lead ON lead_touches(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_touches_date ON lead_touches(touch_date DESC);

-- ============================================================================
-- SEO RANKINGS TRACKING (Google Search Console integration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS seo_rankings (
  id TEXT PRIMARY KEY,
  page_url TEXT NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr REAL DEFAULT 0,
  date TEXT NOT NULL, -- YYYY-MM-DD
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(page_url, keyword, date)
);

CREATE INDEX IF NOT EXISTS idx_seo_rankings_date ON seo_rankings(date DESC);
CREATE INDEX IF NOT EXISTS idx_seo_rankings_keyword ON seo_rankings(keyword);

-- ============================================================================
-- COMMUNITY ACCOUNTS TRACKING (for HOA Networker agent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lg_community_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL, -- 'facebook', 'reddit', 'linkedin', 'biggerpockets', 'hoatalk'
  account_username TEXT,
  account_url TEXT,
  community_name TEXT, -- Group name, subreddit name, etc.
  community_url TEXT UNIQUE,
  rules TEXT, -- JSON array of posting rules
  keywords_to_watch TEXT, -- JSON array of keywords
  posting_limit INTEGER DEFAULT 3, -- Max posts per day
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'banned'
  joined_at TEXT DEFAULT (datetime('now')),
  last_scanned_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_community_accounts_platform ON lg_community_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_community_accounts_status ON lg_community_accounts(status);

-- ============================================================================
-- TRENDING TOPICS TRACKING (for content creation workflow)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trending_topics (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  frequency_count INTEGER DEFAULT 1,
  platforms TEXT, -- JSON array of platforms where topic appeared
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  blog_post_created BOOLEAN DEFAULT 0,
  blog_post_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trending_topics_frequency ON trending_topics(frequency_count DESC);
CREATE INDEX IF NOT EXISTS idx_trending_topics_blog_created ON trending_topics(blog_post_created);

-- ============================================================================
-- EXTEND EXISTING LEADS TABLE (only if columns don't already exist)
-- ============================================================================

-- Check if columns exist before adding (SQLite doesn't have IF NOT EXISTS for ALTER TABLE)
-- You may need to manually verify these columns don't already exist

-- ALTER TABLE leads ADD COLUMN source_channel TEXT; -- 'facebook_groups', 'reddit', 'linkedin', etc.
-- ALTER TABLE leads ADD COLUMN source_url TEXT; -- Link to original post/conversation
-- ALTER TABLE leads ADD COLUMN engagement_score INTEGER DEFAULT 0; -- 0-100
-- ALTER TABLE leads ADD COLUMN utm_source TEXT;
-- ALTER TABLE leads ADD COLUMN utm_medium TEXT;
-- ALTER TABLE leads ADD COLUMN utm_campaign TEXT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Uncomment to verify tables were created:
-- SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lg_%' OR name LIKE '%_prospects' ORDER BY name;
