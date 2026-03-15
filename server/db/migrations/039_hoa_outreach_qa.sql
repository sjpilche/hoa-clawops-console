-- Migration 039: HOA Outreach QA Gate
-- NOTE: This migration targets the HOA database (hoa_leads.sqlite), not clawops.db.
-- Apply manually: Run the hoaOutreachDrafter.js ensureQAColumns() function on first load.

-- QA columns on HOA outreach_queue
-- These must be added via ALTER TABLE since the table already exists in hoa_leads.sqlite.
-- The hoaOutreachDrafter.js will auto-add these columns if missing (safe to re-run).

-- ALTER TABLE outreach_queue ADD COLUMN qa_status TEXT DEFAULT NULL;
-- ALTER TABLE outreach_queue ADD COLUMN qa_score INTEGER DEFAULT NULL;
-- ALTER TABLE outreach_queue ADD COLUMN qa_notes TEXT DEFAULT NULL;
-- ALTER TABLE outreach_queue ADD COLUMN qa_reviewed_at TEXT DEFAULT NULL;

SELECT 'Migration 039: HOA outreach QA columns — applied via hoaOutreachDrafter.js auto-migration' AS status;
