-- 048: Link outreach sequences to the run that created them for outcome attribution.
-- When a SendGrid webhook fires (reply/bounce/open), we trace back to the original
-- agent run and update the episode with the REAL outcome score.

ALTER TABLE cfo_outreach_sequences ADD COLUMN source_run_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_source_run ON cfo_outreach_sequences(source_run_id);
