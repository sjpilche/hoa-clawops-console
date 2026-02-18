-- ============================================================
-- PHASE 1: Multi-Tenant Campaign Architecture
-- Migration 014: Create campaigns tables
-- ============================================================

-- campaigns: The tenant boundary - every agent/lead/run belongs to a campaign
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'marketing',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT '🎯',
  description TEXT,
  config TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_company ON campaigns(company);
CREATE INDEX idx_campaigns_slug ON campaigns(slug);

-- campaign_agents: Agent instances per campaign
-- Each campaign can have its own instances of agent templates with custom configs
CREATE TABLE IF NOT EXISTS campaign_agents (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  prompt_spec_path TEXT,
  status TEXT DEFAULT 'idle' CHECK(status IN ('idle','running','paused','error','disabled')),
  schedule TEXT,
  last_run_at DATETIME,
  last_result TEXT,
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  config TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaign_agents_campaign ON campaign_agents(campaign_id);
CREATE INDEX idx_campaign_agents_status ON campaign_agents(status);
CREATE INDEX idx_campaign_agents_type ON campaign_agents(agent_type);

-- campaign_metrics: Daily rollup stats per campaign
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  leads_generated INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  agent_runs INTEGER DEFAULT 0,
  agent_errors INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  custom_metrics TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, date)
);

CREATE INDEX idx_metrics_campaign_date ON campaign_metrics(campaign_id, date);
CREATE INDEX idx_metrics_date ON campaign_metrics(date);

-- campaign_activity_log: Unified activity feed per campaign
CREATE TABLE IF NOT EXISTS campaign_activity_log (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES campaign_agents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warning','error','success')),
  title TEXT NOT NULL,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_campaign ON campaign_activity_log(campaign_id, created_at DESC);
CREATE INDEX idx_activity_type ON campaign_activity_log(event_type);
CREATE INDEX idx_activity_severity ON campaign_activity_log(severity);
