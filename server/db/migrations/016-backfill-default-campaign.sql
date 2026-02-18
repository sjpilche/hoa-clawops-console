-- ============================================================
-- PHASE 1: Multi-Tenant Campaign Architecture
-- Migration 016: Create default campaign and backfill all existing data
-- ============================================================

-- Create default campaign for all existing data
-- This ensures backward compatibility - all current data gets assigned to this campaign
INSERT INTO campaigns (id, name, company, slug, type, status, color, icon, description)
VALUES (
  'default-hoa-fl',
  'HOA FL Lead Gen (Legacy)',
  'HOA Project Funding',
  'hoa-fl-lead-gen',
  'lead-gen',
  'active',
  '#3B82F6',
  '🏠',
  'Original HOA Florida lead generation campaign (migrated from single-tenant setup)'
);

-- Backfill all existing records with default campaign_id
-- This preserves all existing data and makes it accessible in the multi-tenant system

-- Core tables
UPDATE agents SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE runs SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE schedules SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;

-- Lead generation tables
UPDATE leads SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE hoa_contacts SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE lg_engagement_queue SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE lg_community_accounts SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;

-- Multi-channel lead source tables
UPDATE linkedin_prospects SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE email_prospects SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE quora_questions SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE webinars SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;
UPDATE referral_partners SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;

-- Content tables
UPDATE content_queue SET campaign_id = 'default-hoa-fl' WHERE campaign_id IS NULL;

-- Verification query (for manual testing):
-- SELECT
--   'campaigns' as table_name, COUNT(*) as count FROM campaigns
-- UNION ALL
-- SELECT 'agents', COUNT(*) FROM agents WHERE campaign_id = 'default-hoa-fl'
-- UNION ALL
-- SELECT 'runs', COUNT(*) FROM runs WHERE campaign_id = 'default-hoa-fl'
-- UNION ALL
-- SELECT 'schedules', COUNT(*) FROM schedules WHERE campaign_id = 'default-hoa-fl'
-- UNION ALL
-- SELECT 'leads', COUNT(*) FROM leads WHERE campaign_id = 'default-hoa-fl'
-- UNION ALL
-- SELECT 'hoa_contacts', COUNT(*) FROM hoa_contacts WHERE campaign_id = 'default-hoa-fl';
