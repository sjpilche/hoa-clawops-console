-- ==============================================================================
-- Collective Brain — Cross-Agent Learning System
-- Migration: 025_collective_brain.sql
-- Target: Azure SQL (EMPCAMPMaster2)
-- ==============================================================================
--
-- 4 tables implement the 4-layer collective intelligence architecture:
--
-- LAYER 1: shared_observations  — agents talk to each other (scratchpad)
-- LAYER 2: agent_feedback        — human signals teach agents (in-context learning)
-- LAYER 3: agent_episodes        — market-specific outcome memory (episodic)
-- LAYER 4: agent_knowledge_base  — distilled best outputs (cross-agent RAG)
-- ==============================================================================

-- ==============================================================================
-- LAYER 1: SHARED OBSERVATIONS — The Agent Scratchpad
-- ==============================================================================
-- Append-only. Agents write structured findings during a pipeline run.
-- Downstream agents in the same pipeline READ these before starting.
-- Links agents in a run via session_id.
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'shared_observations')
CREATE TABLE shared_observations (
  id           NVARCHAR(36)    NOT NULL PRIMARY KEY DEFAULT NEWID(),
  session_id   NVARCHAR(128)   NOT NULL,           -- pipeline run ID (groups related agent runs)
  agent_name   NVARCHAR(64)    NOT NULL,            -- which agent wrote this
  obs_type     NVARCHAR(32)    NOT NULL,            -- 'lead_signal','market_insight','contact_found','risk_flag','content_gap'
  subject      NVARCHAR(256),                       -- company name, market name, topic
  content      NVARCHAR(MAX)   NOT NULL,            -- the actual observation in plain text
  confidence   FLOAT           DEFAULT 1.0,         -- 0.0-1.0 how confident the agent is
  metadata     NVARCHAR(MAX),                       -- JSON: extra structured data
  expires_at   DATETIME2,                           -- optional TTL (NULL = permanent)
  created_at   DATETIME2       NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IF NOT EXISTS idx_obs_session    ON shared_observations(session_id);
CREATE INDEX IF NOT EXISTS idx_obs_agent      ON shared_observations(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_type       ON shared_observations(obs_type);
CREATE INDEX IF NOT EXISTS idx_obs_subject    ON shared_observations(subject);

-- ==============================================================================
-- LAYER 2: AGENT FEEDBACK — Human Signals as Training Data
-- ==============================================================================
-- Every approval, rejection, or edit in the ClawOps UI writes a row here.
-- scheduleRunner.js injects the last N rows per agent into the system prompt.
-- The agent sees its own error history and self-corrects — no fine-tuning needed.
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_feedback')
CREATE TABLE agent_feedback (
  id           NVARCHAR(36)    NOT NULL PRIMARY KEY DEFAULT NEWID(),
  agent_name   NVARCHAR(64)    NOT NULL,
  output_type  NVARCHAR(32)    NOT NULL,            -- 'outreach','content','lead_score','social'
  output_id    NVARCHAR(36),                        -- FK to cfo_outreach_sequences.id, cfo_content_pieces.id, etc.
  signal       NVARCHAR(16)    NOT NULL,            -- 'approved','rejected','edited','converted','bounced','opened'
  before_text  NVARCHAR(MAX),                       -- original agent output (for 'edited' signals)
  after_text   NVARCHAR(MAX),                       -- what human changed it to (for 'edited' signals)
  notes        NVARCHAR(512),                       -- optional human annotation ("too salesy", "great hook")
  market       NVARCHAR(128),                       -- Tampa Bay FL, Denver CO, etc.
  metadata     NVARCHAR(MAX),                       -- JSON: open_rate, click_rate, reply_rate when known
  created_at   DATETIME2       NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IF NOT EXISTS idx_feedback_agent   ON agent_feedback(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_signal  ON agent_feedback(signal);
CREATE INDEX IF NOT EXISTS idx_feedback_market  ON agent_feedback(market);
CREATE INDEX IF NOT EXISTS idx_feedback_type    ON agent_feedback(output_type);

-- ==============================================================================
-- LAYER 3: AGENT EPISODES — Market-Specific Outcome Memory
-- ==============================================================================
-- Every meaningful outcome (email reply, call booked, lead converted, no response)
-- gets recorded as an episode with outcome score 0-1.
-- Before outreach agents run, they retrieve top-scoring similar past episodes.
-- Over time: Tampa Bay gets Tampa-specific patterns. Denver gets Denver patterns.
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_episodes')
CREATE TABLE agent_episodes (
  id               NVARCHAR(36)    NOT NULL PRIMARY KEY DEFAULT NEWID(),
  agent_name       NVARCHAR(64)    NOT NULL,
  market           NVARCHAR(128),                   -- "Tampa Bay, FL", "Denver, CO"
  company_type     NVARCHAR(64),                    -- "GC", "specialty_sub", "commercial"
  erp_context      NVARCHAR(64),                    -- "QuickBooks", "Excel", "Sage", "unknown"
  contact_title    NVARCHAR(64),                    -- "CFO", "Controller", "Owner"
  action_taken     NVARCHAR(MAX)   NOT NULL,        -- what the agent did (email subject+body summary)
  outcome          NVARCHAR(MAX)   NOT NULL,        -- what happened ("replied in 3 days, booked demo")
  outcome_type     NVARCHAR(32)    NOT NULL,        -- 'converted','replied','opened','bounced','no_response'
  outcome_score    FLOAT           DEFAULT 0.0,     -- 0.0=total fail, 0.5=partial, 1.0=converted
  days_to_outcome  INT,                             -- how many days until outcome occurred
  lead_id          NVARCHAR(36),                    -- FK to cfo_leads.id
  run_id           NVARCHAR(36),                    -- FK to runs.id
  created_at       DATETIME2       NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IF NOT EXISTS idx_episodes_agent    ON agent_episodes(agent_name, outcome_score DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_market   ON agent_episodes(market, outcome_score DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_outcome  ON agent_episodes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_episodes_erp      ON agent_episodes(erp_context);

-- ==============================================================================
-- LAYER 4: AGENT KNOWLEDGE BASE — Distilled Best Outputs
-- ==============================================================================
-- Nightly job queries approved, unedited agent outputs and stores them here.
-- All agents query this table before generating — best outputs teach future runs.
-- Jake's best content teaches CFO's agent. Cross-agent learning, zero config.
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'agent_knowledge_base')
CREATE TABLE agent_knowledge_base (
  id            NVARCHAR(36)    NOT NULL PRIMARY KEY DEFAULT NEWID(),
  source_agent  NVARCHAR(64)    NOT NULL,           -- which agent produced this
  content_type  NVARCHAR(32)    NOT NULL,           -- 'outreach_email','blog_post','social_post','lead_profile'
  title         NVARCHAR(512),                      -- subject line, post title, etc.
  content       NVARCHAR(MAX)   NOT NULL,           -- the full approved output
  quality_score FLOAT           DEFAULT 1.0,        -- 0-1: 1.0=approved untouched, 0.5=approved with edits
  market        NVARCHAR(128),                      -- market context if applicable
  erp_context   NVARCHAR(64),                       -- ERP context if applicable
  tags          NVARCHAR(512),                      -- JSON array: ["cash_flow","peer_voice","short"]
  use_count     INT             DEFAULT 0,          -- how many times retrieved as example
  source_id     NVARCHAR(36),                       -- original output ID (content_piece, outreach_sequence)
  distilled_at  DATETIME2       NOT NULL DEFAULT GETUTCDATE(),
  created_at    DATETIME2       NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IF NOT EXISTS idx_kb_agent      ON agent_knowledge_base(source_agent, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_kb_type       ON agent_knowledge_base(content_type, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_kb_market     ON agent_knowledge_base(market);
CREATE INDEX IF NOT EXISTS idx_kb_use_count  ON agent_knowledge_base(use_count DESC);
