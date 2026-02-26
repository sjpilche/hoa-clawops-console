-- Migration 024: Outreach delivery tracking
-- Track whether emails were actually delivered via SMTP

ALTER TABLE cfo_outreach_sequences ADD COLUMN delivery_status TEXT;
-- Values: NULL, 'delivered', 'failed', 'bounced'

ALTER TABLE cfo_outreach_sequences ADD COLUMN delivery_error TEXT;
-- Error message if delivery failed
