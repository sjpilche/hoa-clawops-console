-- Migration 023: Lead enrichment tracking columns
-- Tracks which leads have been enriched with contact info

ALTER TABLE cfo_leads ADD COLUMN enrichment_status TEXT DEFAULT 'pending';
-- Values: 'pending', 'in_progress', 'enriched', 'failed', 'manual'

ALTER TABLE cfo_leads ADD COLUMN enrichment_method TEXT;
-- Values: 'web_search', 'website_scrape', 'google_search', 'manual', 'agent_output'

ALTER TABLE cfo_leads ADD COLUMN enriched_at TEXT;

ALTER TABLE cfo_leads ADD COLUMN phone TEXT;

CREATE INDEX IF NOT EXISTS idx_cfo_leads_enrichment ON cfo_leads(enrichment_status);

-- Backfill: mark leads that already have email as enriched
UPDATE cfo_leads SET enrichment_status = 'enriched', enrichment_method = 'agent_output'
WHERE contact_email IS NOT NULL AND contact_email != '';
