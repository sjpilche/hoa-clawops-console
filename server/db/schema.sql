-- ==============================================================================
-- ClawOps Console — Database Schema
-- ==============================================================================
-- Database: SQLite (via sql.js — pure JavaScript implementation)
--
-- DESIGN DECISIONS:
-- 1. We use TEXT for IDs (UUIDs) instead of auto-increment integers.
--    Why? UUIDs are generated client-side, no race conditions, easy to debug.
-- 2. Every table has created_at and updated_at timestamps.
-- 3. All dates are stored as ISO 8601 strings (SQLite doesn't have a date type).
-- 4. We use JSON columns (TEXT type) for flexible data — SQLite handles this fine.
-- ==============================================================================

-- =============================================================================
-- USERS — Authentication and identity
-- =============================================================================
-- For v1, there's just one admin user. But the schema supports multiple users
-- so we don't have to rewrite everything when we add team features.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,                    -- UUID
  email       TEXT NOT NULL UNIQUE,                -- Login email
  password    TEXT NOT NULL,                       -- bcrypt hashed password (NEVER stored in plain text)
  name        TEXT NOT NULL DEFAULT 'Admin',       -- Display name
  role        TEXT NOT NULL DEFAULT 'admin',       -- 'admin' or 'viewer' (for future use)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- AGENTS — Agent registry and configuration
-- =============================================================================
-- Each row represents one configured OpenClaw agent (e.g., "AP Invoice Extractor").
-- The config column stores the agent's full YAML/JSON configuration.
CREATE TABLE IF NOT EXISTS agents (
  id          TEXT PRIMARY KEY,                    -- UUID
  name        TEXT NOT NULL,                       -- Human-readable name
  description TEXT,                                -- What this agent does
  target_system TEXT,                              -- e.g., "Sage 300", "QuickBooks", "Procore"
  status      TEXT NOT NULL DEFAULT 'idle',        -- 'idle', 'running', 'disabled', 'error'
  config      TEXT NOT NULL DEFAULT '{}',          -- JSON: full agent configuration
  domains     TEXT NOT NULL DEFAULT '[]',          -- JSON array: allowed domains for this agent
  permissions TEXT NOT NULL DEFAULT 'read-only',   -- 'read-only', 'read-write', 'form-submit'
  instructions TEXT DEFAULT '',                    -- SOUL.md content / agent instructions
  success_rate REAL DEFAULT 0,                     -- Calculated: successful runs / total runs
  total_runs  INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,                                -- When this agent last ran
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Migration: Add instructions column if missing (for existing databases)
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we handle this in code

-- =============================================================================
-- RUNS — Agent execution history
-- =============================================================================
-- Every time an agent is triggered, a run record is created. This is the
-- core of the audit trail — we know exactly what happened, when, and why.
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,                    -- UUID
  agent_id    TEXT NOT NULL,                       -- Which agent ran
  user_id     TEXT NOT NULL,                       -- Who triggered it
  status      TEXT NOT NULL DEFAULT 'pending',     -- 'pending','running','success','failed','cancelled','timeout'
  trigger     TEXT NOT NULL DEFAULT 'manual',      -- 'manual', 'scheduled', 'chat-command'

  -- Timing
  started_at  TEXT,                                -- When execution started
  completed_at TEXT,                               -- When execution finished
  duration_ms INTEGER,                             -- How long it took (milliseconds)

  -- Cost tracking
  tokens_used INTEGER DEFAULT 0,                   -- Total tokens consumed
  cost_usd    REAL DEFAULT 0,                      -- Estimated cost in USD

  -- Results
  result_data TEXT DEFAULT '{}',                   -- JSON: extracted data or results
  error_msg   TEXT,                                -- Error message if failed

  -- Safety
  confirmed_by TEXT,                               -- User ID who confirmed the run
  confirmed_at TEXT,                               -- When confirmation was given

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- =============================================================================
-- CHAT_THREADS — Conversation grouping
-- =============================================================================
-- Messages are grouped into threads. A thread might be a single task,
-- an agent run, or a general conversation.
CREATE TABLE IF NOT EXISTS chat_threads (
  id          TEXT PRIMARY KEY,                    -- UUID
  title       TEXT NOT NULL DEFAULT 'New Conversation',
  user_id     TEXT NOT NULL,
  run_id      TEXT,                                -- Optional: link to agent run
  is_active   INTEGER NOT NULL DEFAULT 1,          -- 1 = active, 0 = archived
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- =============================================================================
-- CHAT_MESSAGES — Individual messages in conversations
-- =============================================================================
-- This is the heart of the chat persistence layer. Every message —
-- user commands, agent responses, system alerts — is stored here.
CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,                    -- UUID
  thread_id   TEXT NOT NULL,                       -- Which thread this belongs to
  sender_type TEXT NOT NULL,                       -- 'user', 'agent', 'system'
  sender_id   TEXT,                                -- User ID or agent ID
  content     TEXT NOT NULL,                       -- The message text
  msg_type    TEXT NOT NULL DEFAULT 'text',        -- 'text','code','data-table','screenshot','status','alert','action'
  metadata    TEXT DEFAULT '{}',                   -- JSON: extra data (e.g., screenshot URL, table data)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
);

-- =============================================================================
-- AUDIT_LOG — Immutable audit trail (safety-critical)
-- =============================================================================
-- EVERY significant action is logged here. This table is append-only —
-- rows are never updated or deleted. This is your paper trail.
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,                    -- UUID
  timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
  user_id     TEXT,                                -- Who did it (null for system actions)
  action      TEXT NOT NULL,                       -- e.g., 'agent.run', 'agent.stop', 'auth.login'
  resource    TEXT,                                -- e.g., 'agent:uuid-123', 'run:uuid-456'
  details     TEXT DEFAULT '{}',                   -- JSON: action-specific details
  ip_address  TEXT,                                -- Client IP for security
  outcome     TEXT NOT NULL DEFAULT 'success'      -- 'success', 'failure', 'denied'
);

-- =============================================================================
-- SETTINGS — Key-value system configuration
-- =============================================================================
-- Stores system-wide settings like cost thresholds, domain allowlists, etc.
-- Simple key-value store — no need for a complex settings schema.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,                                -- What this setting controls
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- CREDENTIALS — Encrypted credential vault
-- =============================================================================
-- Stores encrypted credentials for target systems (e.g., Sage login).
-- The 'encrypted_value' column is AES-256 encrypted — never stored in plain text.
CREATE TABLE IF NOT EXISTS credentials (
  id          TEXT PRIMARY KEY,                    -- UUID
  name        TEXT NOT NULL,                       -- Human-readable name (e.g., "Sage 300 - Production")
  target_system TEXT NOT NULL,                     -- Which system these creds are for
  encrypted_value TEXT NOT NULL,                   -- AES-256 encrypted JSON blob
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- DOMAINS — Business domain registry (v2.0)
-- =============================================================================
-- Each domain represents a business function (marketing, operations, finance).
-- Domains group agents, extensions, and tools together with optional external
-- database connections and embedded dashboards.
CREATE TABLE IF NOT EXISTS domains (
  id          TEXT PRIMARY KEY,                    -- UUID
  name        TEXT NOT NULL UNIQUE,                -- 'marketing', 'operations', 'finance'
  display_name TEXT NOT NULL,                      -- 'Marketing Automation'
  description TEXT,
  icon        TEXT DEFAULT 'Box',                  -- Lucide icon name
  color       TEXT DEFAULT '#6366f1',              -- Hex color for UI theming
  status      TEXT NOT NULL DEFAULT 'active',      -- 'active', 'disabled'

  -- External database connection (optional — for domain dashboards & data)
  db_type     TEXT,                                -- 'postgresql', 'mysql', 'sqlite', null
  db_config   TEXT,                                -- JSON: encrypted connection details

  -- Dashboard embedding
  dashboard_url TEXT,                              -- External dashboard URL (full URL)
  dashboard_port INTEGER,                          -- Local dashboard port (for localhost)

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- EXTENSIONS — OpenClaw extension registry (v2.0)
-- =============================================================================
-- Synced from OpenClaw's ~/.openclaw/extensions/ directory.
-- Each extension provides MCP tools that agents can use.
CREATE TABLE IF NOT EXISTS extensions (
  id          TEXT PRIMARY KEY,                    -- Extension ID (e.g., 'nsg-marketing-core')
  domain_id   TEXT,                                -- Which domain this belongs to (nullable for global)
  name        TEXT NOT NULL,
  description TEXT,
  version     TEXT,

  -- Extension metadata
  plugin_path TEXT NOT NULL,                       -- Path to extension in OpenClaw
  config_schema TEXT DEFAULT '{}',                 -- JSON Schema from openclaw.plugin.json
  config      TEXT DEFAULT '{}',                   -- User configuration (JSON)

  -- Status tracking
  status      TEXT NOT NULL DEFAULT 'unknown',     -- 'active', 'inactive', 'error'
  enabled     INTEGER NOT NULL DEFAULT 1,          -- 1 = enabled, 0 = disabled
  tools_count INTEGER DEFAULT 0,                   -- Cached count of tools

  -- Health
  last_sync_at TEXT,
  health_status TEXT DEFAULT 'unknown',            -- 'healthy', 'degraded', 'unhealthy'
  health_message TEXT,

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL
);

-- =============================================================================
-- TOOLS — MCP tools registry (v2.0)
-- =============================================================================
-- Tools discovered from extensions. Each tool is a callable function
-- that agents can use during execution (e.g., crm_add_prospect, campaign_create).
CREATE TABLE IF NOT EXISTS tools (
  id          TEXT PRIMARY KEY,                    -- UUID
  extension_id TEXT NOT NULL,                      -- Which extension provides this
  name        TEXT NOT NULL,                       -- Tool name (e.g., 'crm_add_prospect')
  display_name TEXT,                               -- Human-readable name
  description TEXT,
  category    TEXT,                                -- 'crm', 'campaign', 'analytics', etc.
  input_schema TEXT DEFAULT '{}',                  -- JSON Schema for tool inputs

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
  UNIQUE(extension_id, name)
);

-- =============================================================================
-- AGENT_HIERARCHIES — Parent/child agent relationships (v2.0)
-- =============================================================================
-- Defines orchestration patterns: commander → coordinators → specialists.
-- Each agent can have one parent. Layer 0 = root (commander), Layer 1+ = children.
CREATE TABLE IF NOT EXISTS agent_hierarchies (
  id          TEXT PRIMARY KEY,                    -- UUID
  agent_id    TEXT NOT NULL,                       -- Child agent
  parent_id   TEXT,                                -- Parent agent (NULL for root)
  domain_id   TEXT NOT NULL,                       -- Which domain

  -- Hierarchy metadata
  hierarchy_type TEXT NOT NULL DEFAULT 'command',  -- 'command', 'delegation', 'collaboration'
  layer       INTEGER DEFAULT 0,                   -- 0 = root, 1 = tier-1, etc.
  order_index INTEGER DEFAULT 0,                   -- Display order among siblings

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
  UNIQUE(agent_id)                                 -- Each agent belongs to one hierarchy position
);

-- =============================================================================
-- AGENT_TOOLS — Per-agent tool access control (v2.0)
-- =============================================================================
-- Controls which tools each agent can use. If no records exist for an agent,
-- they get access to all tools from their domain's extensions (open by default).
CREATE TABLE IF NOT EXISTS agent_tools (
  id          TEXT PRIMARY KEY,                    -- UUID
  agent_id    TEXT NOT NULL,
  tool_id     TEXT NOT NULL,
  allowed     INTEGER NOT NULL DEFAULT 1,          -- 1 = allowed, 0 = denied

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE,
  UNIQUE(agent_id, tool_id)
);

-- =============================================================================
-- AGENT_TEAMS — Agent team groupings (v2.0)
-- =============================================================================
-- Teams allow ad-hoc groupings of agents for coordinated execution.
-- A team defines how multiple agents work together on a shared goal.
CREATE TABLE IF NOT EXISTS agent_teams (
  id          TEXT PRIMARY KEY,                    -- UUID
  domain_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  coordination_strategy TEXT DEFAULT 'sequential', -- 'sequential', 'parallel', 'conditional'

  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_team_members (
  id          TEXT PRIMARY KEY,                    -- UUID
  team_id     TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  role        TEXT,                                -- Optional role in team (e.g., 'lead', 'support')
  order_index INTEGER DEFAULT 0,                   -- Execution order for sequential strategies

  FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(team_id, agent_id)
);

-- =============================================================================
-- INDEXES — Speed up common queries
-- =============================================================================

-- Original indexes (v1.0)
CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);

-- New indexes (v2.0)
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_extensions_domain ON extensions(domain_id);
CREATE INDEX IF NOT EXISTS idx_extensions_status ON extensions(status);
CREATE INDEX IF NOT EXISTS idx_tools_extension ON tools(extension_id);
CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);
CREATE INDEX IF NOT EXISTS idx_agent_hierarchies_domain ON agent_hierarchies(domain_id);
CREATE INDEX IF NOT EXISTS idx_agent_hierarchies_parent ON agent_hierarchies(parent_id);
CREATE INDEX IF NOT EXISTS idx_agent_hierarchies_agent ON agent_hierarchies(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_teams_domain ON agent_teams(domain_id);
CREATE INDEX IF NOT EXISTS idx_agent_team_members_team ON agent_team_members(team_id);

-- =============================================================================
-- HOA FUNDING DOMAIN TABLES — Agent fleet for lending automation (v2.1)
-- =============================================================================
-- These tables support the HOA Project Funding Agent Fleet, enabling automated
-- lending platform research, compliance verification, and document processing.

-- =============================================================================
-- LENDING_PRODUCTS — Catalog of loan products from all platforms
-- =============================================================================
CREATE TABLE IF NOT EXISTS lending_products (
  id                TEXT PRIMARY KEY,                    -- UUID
  lender_name       TEXT NOT NULL,                       -- Financial institution name
  product_name      TEXT NOT NULL,                       -- Product name
  product_type      TEXT NOT NULL,                       -- 'reserve_fund_loan', 'assessment_bond', 'line_of_credit', 'term_loan'

  -- Terms
  min_amount        INTEGER,                             -- Minimum loan amount
  max_amount        INTEGER,                             -- Maximum loan amount
  term_months_min   INTEGER,                             -- Minimum term in months
  term_months_max   INTEGER,                             -- Maximum term in months
  interest_rate_min REAL,                                -- Minimum APR (e.g., 4.5)
  interest_rate_max REAL,                                -- Maximum APR (e.g., 7.5)

  -- Requirements
  min_units         INTEGER,                             -- Minimum HOA size (units)
  min_credit_score  INTEGER,                             -- Minimum credit score
  states_available  TEXT,                                -- JSON array of state codes (e.g., ["FL", "CA"])

  -- Metadata
  platform_source   TEXT,                                -- Source platform (e.g., 'creditunion.com')
  last_scraped_at   TEXT,                                -- When data was last updated
  is_active         INTEGER DEFAULT 1,                   -- 1 = active, 0 = inactive

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- LOAN_OPTIONS — Generated quotes per lead/workflow
-- =============================================================================
CREATE TABLE IF NOT EXISTS loan_options (
  id                TEXT PRIMARY KEY,                    -- UUID
  workflow_id       TEXT NOT NULL,                       -- FK to funding_workflows
  lead_id           TEXT NOT NULL,                       -- FK to leads (from existing system)
  product_id        TEXT,                                -- FK to lending_products (nullable)

  -- Quote details
  quoted_amount     INTEGER NOT NULL,                    -- Loan amount quoted
  quoted_rate       REAL NOT NULL,                       -- Interest rate (APR)
  quoted_term_months INTEGER NOT NULL,                   -- Term in months
  monthly_payment   REAL,                                -- Estimated monthly payment
  total_cost        REAL,                                -- Total cost over life of loan

  -- Lender details
  lender_name       TEXT NOT NULL,                       -- Lender name
  lender_contact    TEXT,                                -- JSON: {phone, email, url}

  -- Matching
  match_score       INTEGER DEFAULT 0,                   -- 0-100 match quality score
  match_reasons     TEXT,                                -- JSON array: why this matches

  -- Status
  status            TEXT DEFAULT 'pending',              -- 'pending', 'approved', 'rejected', 'expired'

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (workflow_id) REFERENCES funding_workflows(id)
);

-- =============================================================================
-- COMPLIANCE_RULES — State-specific HOA regulations database
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance_rules (
  id                TEXT PRIMARY KEY,                    -- UUID
  rule_type         TEXT NOT NULL,                       -- 'state_regulation', 'document_requirement', 'deadline'

  -- Scope
  state_code        TEXT,                                -- State code (e.g., 'FL'), NULL = applies to all
  hoa_type          TEXT,                                -- 'condo', 'townhome', 'single_family', NULL = all

  -- Rule definition
  rule_name         TEXT NOT NULL,                       -- Human-readable rule name
  rule_description  TEXT,                                -- Detailed description
  rule_details      TEXT,                                -- JSON: structured rule data

  -- Document requirements
  required_documents TEXT,                               -- JSON array of document types

  -- Deadlines
  deadline_days     INTEGER,                             -- Days from application

  -- Metadata
  source_url        TEXT,                                -- Link to authoritative source
  last_verified_at  TEXT,                                -- When rule was last verified
  is_active         INTEGER DEFAULT 1,                   -- 1 = active, 0 = inactive

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- COMPLIANCE_CHECKS — Per-workflow compliance validation results
-- =============================================================================
CREATE TABLE IF NOT EXISTS compliance_checks (
  id                TEXT PRIMARY KEY,                    -- UUID
  workflow_id       TEXT NOT NULL,                       -- FK to funding_workflows
  lead_id           TEXT NOT NULL,                       -- FK to leads
  rule_id           TEXT NOT NULL,                       -- FK to compliance_rules

  -- Check results
  status            TEXT NOT NULL DEFAULT 'pending',     -- 'pending', 'pass', 'fail', 'warning', 'manual_review'
  checked_at        TEXT,                                -- When check was performed
  checked_by_agent  TEXT,                                -- Agent ID that performed check

  -- Details
  check_details     TEXT,                                -- JSON: what was checked
  issues_found      TEXT,                                -- JSON array of issues
  remediation_steps TEXT,                                -- JSON: how to fix

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (workflow_id) REFERENCES funding_workflows(id),
  FOREIGN KEY (rule_id) REFERENCES compliance_rules(id)
);

-- =============================================================================
-- DOCUMENTS — Document metadata and processing status
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id                TEXT PRIMARY KEY,                    -- UUID
  workflow_id       TEXT NOT NULL,                       -- FK to funding_workflows
  lead_id           TEXT NOT NULL,                       -- FK to leads

  -- Document info
  document_type     TEXT NOT NULL,                       -- 'budget', 'reserve_study', 'financial_statement', 'bylaws', etc.
  file_name         TEXT NOT NULL,                       -- Original filename
  file_path         TEXT NOT NULL,                       -- Storage location
  file_size_bytes   INTEGER,                             -- File size
  mime_type         TEXT,                                -- MIME type

  -- Processing
  processing_status TEXT DEFAULT 'pending',              -- 'pending', 'extracted', 'failed'
  extracted_data    TEXT,                                -- JSON: key data points extracted
  ocr_confidence    REAL,                                -- 0-1 confidence score for OCR

  -- Metadata
  uploaded_at       TEXT,                                -- Upload timestamp
  processed_at      TEXT,                                -- Processing completion timestamp
  processed_by_agent TEXT,                               -- Agent ID that processed

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (workflow_id) REFERENCES funding_workflows(id)
);

-- =============================================================================
-- FUNDING_WORKFLOWS — Master workflow tracking table
-- =============================================================================
CREATE TABLE IF NOT EXISTS funding_workflows (
  id                TEXT PRIMARY KEY,                    -- UUID
  lead_id           TEXT NOT NULL UNIQUE,                -- FK to leads (one workflow per lead)

  -- Workflow state
  current_stage     TEXT NOT NULL DEFAULT 'intake',      -- 'intake', 'lending_research', 'compliance', 'document_prep', 'complete'
  status            TEXT NOT NULL DEFAULT 'pending',     -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'

  -- Progress tracking
  progress_percent  INTEGER DEFAULT 0,                   -- 0-100 progress

  -- Agent assignments
  commander_agent_id TEXT,                               -- Commander agent ID
  assigned_agents   TEXT,                                -- JSON array of agent IDs

  -- Results
  loan_options_count INTEGER DEFAULT 0,                  -- Number of loan options found
  compliance_pass   INTEGER DEFAULT 0,                   -- Boolean: compliance passed
  documents_ready   INTEGER DEFAULT 0,                   -- Boolean: documents ready

  -- Timeline
  started_at        TEXT,                                -- Workflow start timestamp
  completed_at      TEXT,                                -- Workflow completion timestamp

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- AGENT_TASK_QUEUE — Persistent task queue (complements Redis)
-- =============================================================================
CREATE TABLE IF NOT EXISTS agent_task_queue (
  id                TEXT PRIMARY KEY,                    -- UUID
  workflow_id       TEXT NOT NULL,                       -- FK to funding_workflows
  agent_id          TEXT NOT NULL,                       -- Target agent ID
  parent_task_id    TEXT,                                -- For hierarchical tasks

  -- Task definition
  task_type         TEXT NOT NULL,                       -- 'scrape_lender', 'verify_compliance', 'extract_document'
  task_payload      TEXT NOT NULL,                       -- JSON: task-specific data

  -- Execution
  status            TEXT NOT NULL DEFAULT 'pending',     -- 'pending', 'claimed', 'running', 'completed', 'failed'
  priority          INTEGER DEFAULT 5,                   -- 1-10 (10 = highest priority)
  retry_count       INTEGER DEFAULT 0,                   -- Current retry count
  max_retries       INTEGER DEFAULT 3,                   -- Maximum retries allowed

  -- Results
  result_data       TEXT,                                -- JSON: task output
  error_message     TEXT,                                -- Error message if failed

  -- Timing
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at        TEXT,                                -- When task was claimed by agent
  started_at        TEXT,                                -- When execution started
  completed_at      TEXT,                                -- When execution completed

  FOREIGN KEY (workflow_id) REFERENCES funding_workflows(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- =============================================================================
-- HOA FUNDING INDEXES — Performance optimization
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_loan_options_workflow ON loan_options(workflow_id);
CREATE INDEX IF NOT EXISTS idx_loan_options_lead ON loan_options(lead_id);
CREATE INDEX IF NOT EXISTS idx_loan_options_status ON loan_options(status);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_workflow ON compliance_checks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_status ON compliance_checks(status);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_rule ON compliance_checks(rule_id);
CREATE INDEX IF NOT EXISTS idx_documents_workflow ON documents(workflow_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON funding_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_stage ON funding_workflows(current_stage);
CREATE INDEX IF NOT EXISTS idx_workflows_lead ON funding_workflows(lead_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON agent_task_queue(status);
CREATE INDEX IF NOT EXISTS idx_task_queue_agent ON agent_task_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_workflow ON agent_task_queue(workflow_id);
CREATE INDEX IF NOT EXISTS idx_task_queue_priority ON agent_task_queue(priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_lending_products_active ON lending_products(is_active);
CREATE INDEX IF NOT EXISTS idx_lending_products_type ON lending_products(product_type);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_active ON compliance_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_state ON compliance_rules(state_code);

-- =============================================================================
-- DEFAULT SETTINGS — Seed sensible defaults
-- =============================================================================
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('max_concurrent_agents', '3', 'Maximum number of agents running simultaneously'),
  ('max_cost_per_run', '5.00', 'Maximum cost (USD) per single agent run'),
  ('max_duration_per_run', '300', 'Maximum duration (seconds) per agent run'),
  ('max_tokens_per_run', '100000', 'Maximum tokens per agent run'),
  ('max_runs_per_hour', '20', 'Maximum agent runs allowed per hour'),
  ('data_retention_days', '90', 'Auto-purge results older than this many days'),
  ('domain_allowlist', '[]', 'JSON array of approved domains agents can visit'),
  ('openclaw_api_url', 'http://localhost:8000', 'OpenClaw API base URL'),
  ('pii_masking_enabled', 'true', 'Mask PII in logs and chat display');
-- ==============================================================================
-- Lead Generation Module — Database Migration
-- ==============================================================================
-- Migration: 007_lead_gen_module.sql
-- Purpose: Add tables for HOA Networker community engagement agent
-- Tables: lg_engagement_queue, lg_community_accounts
-- Created: February 2026

-- ==============================================================================
-- LG_ENGAGEMENT_QUEUE — Networker's work queue
-- ==============================================================================
-- Every engagement opportunity found goes here for manual review and approval

CREATE TABLE IF NOT EXISTS lg_engagement_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Platform & Community
  platform TEXT NOT NULL,                    -- 'facebook', 'reddit', 'linkedin', 'biggerpockets', 'quora', 'nextdoor'
  community TEXT,                            -- Group name or subreddit
  post_url TEXT NOT NULL,                    -- Link to original post
  post_title TEXT,                           -- Title or first line
  post_summary TEXT,                         -- Brief summary of question
  post_author TEXT,                          -- Username/display name
  post_age_hours INTEGER,                    -- Age when found

  -- Relevance & Template
  relevance_score INTEGER,                   -- 1-100 how relevant to HOA financing
  recommended_template TEXT,                 -- Which response template fits

  -- Draft Response
  draft_response TEXT NOT NULL,              -- The Networker's drafted response
  includes_link BOOLEAN DEFAULT 0,           -- Whether response links to site
  link_url TEXT,                             -- Specific URL (with UTM params)

  -- Status & Approval
  status TEXT DEFAULT 'pending_review',      -- 'pending_review', 'approved', 'rejected', 'posted', 'expired'
  approved_at DATETIME,                      -- When you approved it
  posted_at DATETIME,                        -- When actually posted

  -- Engagement Tracking (updated after posting)
  engagement_likes INTEGER DEFAULT 0,        -- Likes/upvotes received
  engagement_replies INTEGER DEFAULT 0,      -- Replies/comments
  engagement_clicks INTEGER DEFAULT 0,       -- UTM-tracked clicks to site

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT                                 -- Your notes or edits
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_engagement_status ON lg_engagement_queue(status);
CREATE INDEX IF NOT EXISTS idx_engagement_platform ON lg_engagement_queue(platform);
CREATE INDEX IF NOT EXISTS idx_engagement_relevance ON lg_engagement_queue(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_created ON lg_engagement_queue(created_at DESC);

-- ==============================================================================
-- LG_COMMUNITY_ACCOUNTS — Tracked communities
-- ==============================================================================
-- Tracks which communities The Networker monitors and our reputation in each

CREATE TABLE IF NOT EXISTS lg_community_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Community Info
  platform TEXT NOT NULL,                    -- Platform name
  community_name TEXT NOT NULL,              -- Group/subreddit/forum name
  community_url TEXT,                        -- Direct link
  member_count INTEGER,                      -- Size of community

  -- Our Status
  our_status TEXT DEFAULT 'discovered',      -- 'discovered', 'joined', 'lurking', 'active', 'established'
  joined_at DATETIME,                        -- When we joined

  -- Performance Metrics
  posts_made INTEGER DEFAULT 0,              -- Responses posted in this community
  avg_engagement REAL DEFAULT 0,             -- Average likes/replies per response
  last_scanned DATETIME,                     -- Last time agent checked

  -- Community Rules
  rules_notes TEXT,                          -- Relevant posting rules
  is_active BOOLEAN DEFAULT 1,               -- Whether to keep monitoring

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_platform ON lg_community_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_community_status ON lg_community_accounts(our_status);
CREATE INDEX IF NOT EXISTS idx_community_active ON lg_community_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_community_last_scan ON lg_community_accounts(last_scanned);

-- ==============================================================================
-- BLITZ MODE — Run all agents and capture outputs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS blitz_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'running',             -- 'running', 'completed', 'failed'
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  total_agents INTEGER DEFAULT 6,
  completed_agents INTEGER DEFAULT 0,
  failed_agents INTEGER DEFAULT 0,
  total_duration_ms INTEGER                   -- Total time for entire run
);

CREATE TABLE IF NOT EXISTS blitz_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blitz_run_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  output TEXT,
  status TEXT DEFAULT 'pending',             -- 'pending', 'running', 'completed', 'failed'
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error TEXT,
  FOREIGN KEY (blitz_run_id) REFERENCES blitz_runs(id)
);

-- Indexes for blitz queries
CREATE INDEX IF NOT EXISTS idx_blitz_results_run ON blitz_results(blitz_run_id);
CREATE INDEX IF NOT EXISTS idx_blitz_results_status ON blitz_results(status);
CREATE INDEX IF NOT EXISTS idx_blitz_runs_status ON blitz_runs(status);

-- ==============================================================================
-- Verify Migration
-- ==============================================================================
-- Check that tables were created successfully
SELECT 'Migration 008 complete: Blitz Mode tables created' AS status;
