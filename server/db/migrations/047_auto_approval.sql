-- 047: Auto-approval columns for autonomous outreach pipeline
-- Tracks which drafts were auto-approved, why, and when.

ALTER TABLE cfo_outreach_sequences ADD COLUMN auto_approval_decision TEXT DEFAULT NULL;
ALTER TABLE cfo_outreach_sequences ADD COLUMN auto_approval_reason TEXT DEFAULT NULL;
ALTER TABLE cfo_outreach_sequences ADD COLUMN auto_approved_at TEXT DEFAULT NULL;
