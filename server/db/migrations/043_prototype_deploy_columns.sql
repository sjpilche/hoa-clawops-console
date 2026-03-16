-- ==============================================================================
-- Add deployment columns to opp_prototypes
-- ==============================================================================
-- Migration: 043_prototype_deploy_columns.sql
-- Purpose: Add github_repo, stripe_product_id, deployed_at, product_name columns
--          needed by prototypeDeployer.js and tractionMonitorService.js

ALTER TABLE opp_prototypes ADD COLUMN github_repo TEXT;
ALTER TABLE opp_prototypes ADD COLUMN stripe_product_id TEXT;
ALTER TABLE opp_prototypes ADD COLUMN deployed_at TEXT;
ALTER TABLE opp_prototypes ADD COLUMN product_name TEXT;
