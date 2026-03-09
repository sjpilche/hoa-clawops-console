-- Migration 033: Add sequence_position to outreach sequences
-- Tracks which touch in the sequence this email is (1=first, 2=follow-up, 3=meeting)
ALTER TABLE cfo_outreach_sequences ADD COLUMN sequence_position INTEGER DEFAULT 1;
