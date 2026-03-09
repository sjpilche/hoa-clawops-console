-- ==============================================================================
-- Migration 029: Lead Dossier columns
-- ==============================================================================
-- Adds dossier columns to cfo_leads (Jake + CFO pipeline)
-- and lg_engagement_queue (HOA pipeline).
-- Populated by server/services/leadDossierGenerator.js
-- $0/run — pure string assembly from DB signals + Collective Brain.

-- ── cfo_leads (Jake + CFO pipeline) ──────────────────────────────────────────
ALTER TABLE cfo_leads ADD COLUMN dossier               TEXT;
ALTER TABLE cfo_leads ADD COLUMN dossier_generated_at  TEXT;
ALTER TABLE cfo_leads ADD COLUMN dossier_version       INTEGER DEFAULT 1;

-- ── lg_engagement_queue (HOA pipeline) ───────────────────────────────────────
ALTER TABLE lg_engagement_queue ADD COLUMN dossier               TEXT;
ALTER TABLE lg_engagement_queue ADD COLUMN dossier_generated_at  TEXT;
ALTER TABLE lg_engagement_queue ADD COLUMN dossier_version       INTEGER DEFAULT 1;

-- Index for "leads needing a fresh dossier" query
CREATE INDEX IF NOT EXISTS idx_cfo_leads_dossier_age     ON cfo_leads(dossier_generated_at);
CREATE INDEX IF NOT EXISTS idx_lg_engagement_dossier_age ON lg_engagement_queue(dossier_generated_at);

SELECT 'Migration 029 complete: dossier columns added to cfo_leads + lg_engagement_queue' AS status;
