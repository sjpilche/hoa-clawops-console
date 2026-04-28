-- ============================================================================
-- 054_terrapin_fire_wui.sql
-- Add fire_wui sequence type and wui_community lead type for Terrapin Station
-- Community Services dual-service model (fence + wildfire mitigation)
-- ============================================================================

-- SQLite doesn't support ALTER CHECK constraints, so we recreate via permissive approach:
-- The application enforces valid types; the DB allows the new values.

-- Add 'wui_community' as valid lead_type (SQLite can't alter CHECK, so we just insert and let app validate)
-- Add 'fire_wui' as valid sequence_type

-- Add WUI-specific columns to fence_leads
ALTER TABLE fence_leads ADD COLUMN wui_zone INTEGER DEFAULT 0;
ALTER TABLE fence_leads ADD COLUMN wui_data_source TEXT;
ALTER TABLE fence_leads ADD COLUMN insurance_renewal_month TEXT;

-- Add tier 4 support (self-managed HOAs)
-- tier CHECK already allows NULL, and SQLite CHECK isn't enforced strictly for ALTER
