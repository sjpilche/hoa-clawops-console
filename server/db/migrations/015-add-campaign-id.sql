-- ============================================================
-- PHASE 1: Multi-Tenant Campaign Architecture
-- Migration 015: Add campaign_id to existing tables
-- ============================================================

-- Note: SQLite doesn't support adding foreign key constraints to existing tables
-- We'll add the column and create indexes, then backfill in next migration

-- Core tables
ALTER TABLE agents ADD COLUMN campaign_id TEXT;
ALTER TABLE runs ADD COLUMN campaign_id TEXT;
ALTER TABLE schedules ADD COLUMN campaign_id TEXT;

-- Lead generation tables
ALTER TABLE leads ADD COLUMN campaign_id TEXT;
ALTER TABLE hoa_contacts ADD COLUMN campaign_id TEXT;
ALTER TABLE lg_engagement_queue ADD COLUMN campaign_id TEXT;
ALTER TABLE lg_community_accounts ADD COLUMN campaign_id TEXT;

-- Multi-channel lead source tables
ALTER TABLE linkedin_prospects ADD COLUMN campaign_id TEXT;
ALTER TABLE email_prospects ADD COLUMN campaign_id TEXT;
ALTER TABLE quora_questions ADD COLUMN campaign_id TEXT;
ALTER TABLE webinars ADD COLUMN campaign_id TEXT;
ALTER TABLE referral_partners ADD COLUMN campaign_id TEXT;

-- Content tables
ALTER TABLE content_queue ADD COLUMN campaign_id TEXT;

-- Create indexes for performance (critical for queries with WHERE campaign_id = ?)
CREATE INDEX idx_agents_campaign ON agents(campaign_id);
CREATE INDEX idx_runs_campaign ON runs(campaign_id);
CREATE INDEX idx_schedules_campaign ON schedules(campaign_id);
CREATE INDEX idx_content_queue_campaign ON content_queue(campaign_id);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_hoa_contacts_campaign ON hoa_contacts(campaign_id);
CREATE INDEX idx_lg_engagement_queue_campaign ON lg_engagement_queue(campaign_id);
CREATE INDEX idx_lg_community_accounts_campaign ON lg_community_accounts(campaign_id);
CREATE INDEX idx_linkedin_prospects_campaign ON linkedin_prospects(campaign_id);
CREATE INDEX idx_email_prospects_campaign ON email_prospects(campaign_id);
CREATE INDEX idx_quora_questions_campaign ON quora_questions(campaign_id);
CREATE INDEX idx_webinars_campaign ON webinars(campaign_id);
CREATE INDEX idx_referral_partners_campaign ON referral_partners(campaign_id);
