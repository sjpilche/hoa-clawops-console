-- Migration 046: Workspace + Campaign Isolation
-- Adds workspace concept (persistent business lines) separate from campaigns (time-bound pushes).
-- Agent classification: workspace-owned, campaign-owned, global/system.
-- Campaign lifecycle: active, paused, archived.

-- ─────────────────────────────────────────
-- 1. WORKSPACES TABLE (persistent business lines)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  mandate_path TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed workspaces (idempotent)
INSERT OR IGNORE INTO workspaces (id, slug, name, mandate_path, status) VALUES
  (1, 'jake', 'Jake CFO Outreach', 'openclaw-skills/jake/MANDATE.md', 'active'),
  (2, 'hoa', 'HOA Project Funding', 'openclaw-skills/hoa/MANDATE.md', 'active'),
  (3, 'owen', 'Owen PM Outreach', 'openclaw-skills/owen/MANDATE.md', 'frozen'),
  (4, 'data-rehab', 'Data Rehab', 'openclaw-skills/data-rehab/MANDATE.md', 'active');

-- ─────────────────────────────────────────
-- 2. ADD workspace_id TO CAMPAIGNS TABLE
-- ─────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);

-- ─────────────────────────────────────────
-- 3. AGENT CLASSIFICATION
-- ─────────────────────────────────────────
ALTER TABLE agents ADD COLUMN agent_scope TEXT DEFAULT 'workspace';
ALTER TABLE agents ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);

-- ─────────────────────────────────────────
-- 4. MARKETING PIPELINE: workspace_id
-- ─────────────────────────────────────────
ALTER TABLE cfo_leads ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE cfo_outreach_sequences ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);
ALTER TABLE cfo_content_pieces ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id);

-- ─────────────────────────────────────────
-- 5. BRAIN TABLES: workspace_id
-- ─────────────────────────────────────────
ALTER TABLE brain_fallback_observations ADD COLUMN workspace_id INTEGER;
ALTER TABLE brain_fallback_feedback ADD COLUMN workspace_id INTEGER;
ALTER TABLE brain_fallback_episodes ADD COLUMN workspace_id INTEGER;

-- ─────────────────────────────────────────
-- 6. INDEXES
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cfo_leads_workspace ON cfo_leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cfo_outreach_workspace ON cfo_outreach_sequences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cfo_content_workspace ON cfo_content_pieces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_scope ON agents(agent_scope);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
