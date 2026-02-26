-- Migration 021: Unified Marketing Pipeline
-- Adds source_agent column to CFO tables so Jake + CFO agents share the same pipeline.
-- Existing CFO data defaults to 'cfo', new Jake agent output tagged as 'jake'.

ALTER TABLE cfo_leads ADD COLUMN source_agent TEXT DEFAULT 'cfo';
ALTER TABLE cfo_content_pieces ADD COLUMN source_agent TEXT DEFAULT 'cfo';
ALTER TABLE cfo_outreach_sequences ADD COLUMN source_agent TEXT DEFAULT 'cfo';

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_cfo_leads_source ON cfo_leads(source_agent);
CREATE INDEX IF NOT EXISTS idx_cfo_content_source ON cfo_content_pieces(source_agent);
CREATE INDEX IF NOT EXISTS idx_cfo_outreach_source ON cfo_outreach_sequences(source_agent);
