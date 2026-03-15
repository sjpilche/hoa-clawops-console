-- Migration 038: Ralph QA Gate for Outreach & Content
-- Adds QA tracking columns to outreach sequences and content pieces.
-- Enables the Ralph review workflow: draft → qa_pending → qa_passed/qa_failed → approved

-- QA columns on outreach sequences
ALTER TABLE cfo_outreach_sequences ADD COLUMN qa_status TEXT DEFAULT NULL;
-- Values: NULL (legacy/no QA), 'pending', 'passed', 'failed', 'flagged'
ALTER TABLE cfo_outreach_sequences ADD COLUMN qa_score INTEGER DEFAULT NULL;
-- 0-100 quality score from Ralph
ALTER TABLE cfo_outreach_sequences ADD COLUMN qa_notes TEXT DEFAULT NULL;
-- Ralph's feedback on what needs fixing
ALTER TABLE cfo_outreach_sequences ADD COLUMN qa_reviewed_at TEXT DEFAULT NULL;
ALTER TABLE cfo_outreach_sequences ADD COLUMN source_agent TEXT DEFAULT NULL;
-- Which agent drafted this (jake, cfo, hoa)
ALTER TABLE cfo_outreach_sequences ADD COLUMN angle_type TEXT DEFAULT NULL;
-- A/B tracking: pain_signal, social_proof, curious_question, direct_ask, bump, new_angle

-- QA columns on content pieces
ALTER TABLE cfo_content_pieces ADD COLUMN qa_status TEXT DEFAULT NULL;
ALTER TABLE cfo_content_pieces ADD COLUMN qa_score INTEGER DEFAULT NULL;
ALTER TABLE cfo_content_pieces ADD COLUMN qa_notes TEXT DEFAULT NULL;
ALTER TABLE cfo_content_pieces ADD COLUMN qa_reviewed_at TEXT DEFAULT NULL;
ALTER TABLE cfo_content_pieces ADD COLUMN source_agent TEXT DEFAULT NULL;

-- Acquisition cost tracking on leads (Week 3 item, adding now to avoid double migration)
ALTER TABLE cfo_leads ADD COLUMN acquisition_cost_usd REAL DEFAULT 0;
-- Sum of all run costs that touched this lead

-- Index for QA queue
CREATE INDEX IF NOT EXISTS idx_outreach_qa ON cfo_outreach_sequences(qa_status);
CREATE INDEX IF NOT EXISTS idx_content_qa ON cfo_content_pieces(qa_status);

SELECT 'Migration 038 complete: Ralph QA gate columns added' AS status;
