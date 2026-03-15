-- ==============================================================================
-- Revenue Signal Engine — Database Schema
-- ==============================================================================
-- Migration: 037_revenue_signal_engine.sql
-- Purpose: Autonomous YouTube creator monitoring, signal scoring, expert library
-- Tables: rse_sources, rse_transcripts, rse_signals, rse_build_specs, rse_campaigns, rse_expert_library
-- Created: March 2026

-- ==============================================================================
-- RSE_SOURCES — Curated creator/channel registry
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rse_sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,                    -- 'Cole Medin', 'Anthropic Docs'
  platform        TEXT NOT NULL DEFAULT 'youtube',  -- 'youtube','docs','blog','twitter'
  channel_id      TEXT,                             -- YouTube channel ID (UCxxxx)
  channel_url     TEXT,                             -- https://youtube.com/@ColeMedin
  rss_url         TEXT,                             -- YouTube RSS feed URL (free, no auth)
  focus_areas     TEXT,                             -- JSON: ['claude_code','ai_automation','openclaw']
  trust_score     REAL NOT NULL DEFAULT 0.5,        -- 0-1, raised by good signals, lowered by fluff
  total_videos_scanned  INTEGER NOT NULL DEFAULT 0,
  total_signals_accepted INTEGER NOT NULL DEFAULT 0,
  enabled         INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,                             -- Why this source matters
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_scanned_at TEXT,
  UNIQUE(platform, channel_id),
  UNIQUE(name, platform)
);

CREATE INDEX IF NOT EXISTS idx_rse_sources_enabled ON rse_sources(enabled);

-- ==============================================================================
-- RSE_TRANSCRIPTS — Raw transcript store with dedup
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rse_transcripts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       INTEGER NOT NULL,                 -- FK to rse_sources
  video_id        TEXT NOT NULL UNIQUE,             -- YouTube video ID (dedup key)
  video_url       TEXT NOT NULL,
  title           TEXT NOT NULL,
  published_at    TEXT,                             -- Video publish date
  duration_secs   INTEGER DEFAULT 0,
  view_count      INTEGER DEFAULT 0,

  -- Transcript data
  transcript_text TEXT,                             -- Full transcript (yt-dlp auto-subs)
  transcript_lang TEXT DEFAULT 'en',
  transcript_source TEXT DEFAULT 'yt-dlp',          -- 'yt-dlp','piped','manual'
  word_count      INTEGER DEFAULT 0,

  -- Processing state
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending','transcribed','scored','accepted','rejected','expired'
  content_hash    TEXT,                             -- SHA-256 for dedup

  scraped_at      TEXT NOT NULL DEFAULT (datetime('now')),
  scored_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (source_id) REFERENCES rse_sources(id)
);

CREATE INDEX IF NOT EXISTS idx_rse_transcripts_status ON rse_transcripts(status);
CREATE INDEX IF NOT EXISTS idx_rse_transcripts_source ON rse_transcripts(source_id);

-- ==============================================================================
-- RSE_SIGNALS — Scored, accepted insights
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rse_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  transcript_id   INTEGER NOT NULL,                 -- FK to rse_transcripts
  source_id       INTEGER NOT NULL,                 -- FK to rse_sources (denorm for speed)

  -- Signal content
  signal_type     TEXT NOT NULL,                    -- 'technique','tool','pattern','strategy','integration','workflow','monetization'
  title           TEXT NOT NULL,                    -- One-line signal summary
  description     TEXT NOT NULL,                    -- 2-3 paragraph description
  key_insights    TEXT,                             -- JSON array of 3-5 bullet points

  -- Scoring (Ollama $0 scoring)
  truth_density       INTEGER NOT NULL,             -- 1-5: fluff vs concrete detail
  implementation_depth INTEGER NOT NULL,            -- 1-5: vague idea vs step-by-step
  monetization_relevance INTEGER NOT NULL,          -- 1-5: interesting vs directly revenue-producing
  composite_score     REAL NOT NULL,                -- Weighted: (truth*0.35 + impl*0.35 + monet*0.30)
  score_reasoning     TEXT,                         -- Why scored this way

  -- Classification
  tags            TEXT,                             -- JSON: ['claude_code','mcp','agent_framework']
  difficulty      TEXT,                             -- 'trivial','moderate','complex','expert'
  time_to_build   TEXT,                             -- '1h','4h','1d','1w'

  -- Pipeline state
  status          TEXT NOT NULL DEFAULT 'accepted', -- 'accepted','spec_generated','campaign_generated','executed','archived'

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (transcript_id) REFERENCES rse_transcripts(id),
  FOREIGN KEY (source_id) REFERENCES rse_sources(id)
);

CREATE INDEX IF NOT EXISTS idx_rse_signals_status ON rse_signals(status);
CREATE INDEX IF NOT EXISTS idx_rse_signals_score ON rse_signals(composite_score);
CREATE INDEX IF NOT EXISTS idx_rse_signals_source ON rse_signals(source_id);

-- ==============================================================================
-- RSE_BUILD_SPECS — Actionable build specifications
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rse_build_specs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id       INTEGER NOT NULL,                 -- FK to rse_signals

  -- Spec content
  spec_title      TEXT NOT NULL,                    -- 'MCP Server for QB Data Extraction'
  spec_type       TEXT NOT NULL,                    -- 'feature','tool','integration','automation','product'
  problem_statement TEXT NOT NULL,
  proposed_solution TEXT NOT NULL,                   -- 1-2 paragraphs
  implementation_steps TEXT NOT NULL,               -- JSON array of ordered steps
  tech_stack      TEXT,                             -- JSON: ['node','sqlite','playwright']
  estimated_hours REAL,
  estimated_cost_usd REAL DEFAULT 0,
  revenue_model   TEXT,                             -- How this makes money

  -- Pipeline state
  status          TEXT NOT NULL DEFAULT 'draft',    -- 'draft','approved','building','built','shipped','killed'
  assigned_to     TEXT,                             -- Agent or human

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (signal_id) REFERENCES rse_signals(id)
);

CREATE INDEX IF NOT EXISTS idx_rse_build_specs_status ON rse_build_specs(status);

-- ==============================================================================
-- RSE_CAMPAIGNS — Marketing campaigns derived from signals
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rse_campaigns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id       INTEGER,                          -- FK to rse_signals (nullable for manual)
  build_spec_id   INTEGER,                          -- FK to rse_build_specs (nullable)

  -- Campaign content
  campaign_type   TEXT NOT NULL,                    -- 'content','outreach','social','offer','experiment'
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  target_audience TEXT,                             -- Who this is for
  messaging_angle TEXT,                             -- The hook/angle from the signal
  content_brief   TEXT,                             -- Enough for content-engine to write from

  -- Execution state
  status          TEXT NOT NULL DEFAULT 'draft',    -- 'draft','approved','queued','executing','completed','killed'
  assigned_agent  TEXT,                             -- e.g. 'jake-content-engine', 'cfo-outreach-agent'

  -- Performance
  leads_generated INTEGER DEFAULT 0,
  revenue_attributed_cents INTEGER DEFAULT 0,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (signal_id) REFERENCES rse_signals(id),
  FOREIGN KEY (build_spec_id) REFERENCES rse_build_specs(id)
);

CREATE INDEX IF NOT EXISTS idx_rse_campaigns_status ON rse_campaigns(status);

-- ==============================================================================
-- RSE_EXPERT_LIBRARY — Proven patterns/techniques (the core deliverable)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rse_expert_library (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id       INTEGER,                          -- FK to rse_signals (nullable for manual entries)
  source_name     TEXT NOT NULL,                    -- Creator who demonstrated this

  -- Pattern content
  pattern_name    TEXT NOT NULL,                    -- 'Parallel Agent Orchestration'
  category        TEXT NOT NULL,                    -- 'claude_code','prompt_engineering','agent_architecture','monetization','automation'
  description     TEXT NOT NULL,                    -- Full technique description
  example_code    TEXT,                             -- Code snippet if applicable
  prerequisites   TEXT,                             -- JSON: what you need to know first

  -- Quality tracking
  times_referenced INTEGER NOT NULL DEFAULT 0,      -- How often agents pull this pattern
  success_rate    REAL,                             -- 0-1, tracked via brain episodes
  verified        INTEGER NOT NULL DEFAULT 0,       -- 1 = we've successfully used this ourselves
  verification_notes TEXT,                          -- What happened when we tried it

  -- Tags for retrieval
  tags            TEXT,                             -- JSON: ['mcp','tool_use','multi_agent']

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rse_expert_library_category ON rse_expert_library(category);
CREATE INDEX IF NOT EXISTS idx_rse_expert_library_verified ON rse_expert_library(verified);

-- ==============================================================================
-- RSE_EVALUATIONS — Ranked business opportunity evaluations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rse_evaluations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id       INTEGER NOT NULL,                 -- FK to rse_signals
  spec_id         INTEGER,                          -- FK to rse_build_specs (nullable if spec not yet generated)

  -- Business scoring (1-10 each, GPT-4o-mini)
  revenue_potential   INTEGER NOT NULL,             -- 1-10: how much money could this make?
  build_effort        INTEGER NOT NULL,             -- 1-10: how hard to build? (10=trivial, 1=months)
  stack_fit           INTEGER NOT NULL,             -- 1-10: how well does it fit our Node/SQLite/OpenClaw stack?
  market_timing       INTEGER NOT NULL,             -- 1-10: is this hot right now? first-mover advantage?
  differentiation     INTEGER NOT NULL,             -- 1-10: can we do this better than existing solutions?

  -- Composite
  composite_score     REAL NOT NULL,                -- Weighted average
  rank                INTEGER,                      -- Position in the ranked list (1=best)

  -- Context
  one_liner           TEXT NOT NULL,                -- "Build X to solve Y for Z" (1 sentence)
  why_now             TEXT,                         -- Why this is timely
  revenue_path        TEXT,                         -- Specific revenue mechanism
  first_step          TEXT,                         -- "To start, do X" (1 sentence)
  estimated_hours     REAL,                         -- Realistic build time
  comparable          TEXT,                         -- Existing product this competes with
  risk                TEXT,                         -- Main risk or reason NOT to build

  status              TEXT NOT NULL DEFAULT 'evaluated', -- 'evaluated','shortlisted','picked','building','shipped','passed'

  evaluated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (signal_id) REFERENCES rse_signals(id),
  FOREIGN KEY (spec_id) REFERENCES rse_build_specs(id)
);

CREATE INDEX IF NOT EXISTS idx_rse_evaluations_rank ON rse_evaluations(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_rse_evaluations_status ON rse_evaluations(status);

-- ==============================================================================
-- SEED DATA — Initial curated sources
-- ==============================================================================
INSERT OR IGNORE INTO rse_sources (name, platform, channel_url, focus_areas, trust_score, notes) VALUES
  ('Cole Medin',     'youtube', 'https://youtube.com/@ColeMedin',       '["claude_code","mcp","agent_framework","n8n"]',       0.8, 'Deep dives on Claude Code, MCP servers, multi-agent patterns. High implementation depth.'),
  ('Alex Finn',      'youtube', 'https://youtube.com/@alexfinnai',      '["ai_automation","agent_framework","monetization"]',  0.7, 'AI automation workflows, practical builds, revenue-focused.'),
  ('Cody Schneider', 'youtube', 'https://youtube.com/@CodySchneider1',  '["ai_marketing","seo","revenue","automation"]',       0.7, 'AI + marketing intersection. Concrete revenue examples.'),
  ('Greg Isenberg',  'youtube', 'https://youtube.com/@GregIsenberg',    '["startup","product","ai_business","monetization"]',  0.6, 'Startup/product ideas, AI business models. High-level but revenue-focused.'),
  ('Matt Berman',    'youtube', 'https://youtube.com/@MattVidPro',      '["claude_code","ai_news","benchmarks","tools"]',      0.6, 'AI news with technical depth, Claude comparisons, tool reviews.'),
  ('IndyDevDan',     'youtube', 'https://youtube.com/@IndyDevDan',      '["claude_code","cursor","dev_tools","automation"]',   0.7, 'Claude Code deep technical builds, real projects, dev workflow automation.');
