-- ==============================================================================
-- Opportunity Discovery Engine — Database Schema
-- ==============================================================================
-- Migration: 034_opportunity_engine.sql
-- Purpose: 3-tier autonomous opportunity discovery, scoring, and prototyping
-- Tables: opp_signals, opp_clusters, opp_prototypes, opp_traction, opp_scanner_state
-- Created: March 2026

-- ==============================================================================
-- OPP_SIGNALS — Raw pain signals from 10 free internet sources
-- ==============================================================================
CREATE TABLE IF NOT EXISTS opp_signals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,                    -- 'reddit','hn','ph','github','twitter','forum','trends','stackoverflow','indeed','indiehackers'
  url           TEXT NOT NULL,                    -- Original post/page URL
  title         TEXT,                             -- Post title or first line
  body_text     TEXT,                             -- Full text content (truncated to 5000 chars)
  author        TEXT,                             -- Username/handle
  posted_at     TEXT,                             -- When the original was posted (ISO 8601)
  scraped_at    TEXT NOT NULL DEFAULT (datetime('now')),

  -- Platform engagement metrics
  platform_score INTEGER DEFAULT 0,              -- Upvotes/stars/likes/comments from source

  -- Deduplication layers
  content_hash  TEXT,                             -- SHA-256 of normalized(title + body) — exact dedup
  pain_fingerprint TEXT,                          -- Ollama-generated semantic hash — fuzzy dedup

  -- Classification (populated by Ollama, $0)
  classification TEXT,                            -- 'software_pain','workflow_gap','tooling_need','market_signal','noise',NULL=pending
  severity      INTEGER,                          -- 1-5 pain severity (from Ollama)
  category      TEXT,                             -- 'automation','saas','dev_tools','finance','construction','data','other'

  -- Clustering
  cluster_id    INTEGER,                          -- FK to opp_clusters (assigned after dedup/clustering)

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==============================================================================
-- OPP_CLUSTERS — Grouped signals pointing to the same pain point
-- ==============================================================================
CREATE TABLE IF NOT EXISTS opp_clusters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pain_summary  TEXT NOT NULL,                    -- Human-readable pain description
  pain_category TEXT,                             -- Primary category from signals

  -- Signal aggregation
  signal_count  INTEGER NOT NULL DEFAULT 1,       -- Number of signals in this cluster
  avg_platform_score REAL DEFAULT 0,              -- Average platform engagement
  source_diversity INTEGER DEFAULT 1,             -- Number of distinct sources

  -- Velocity tracking
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_signal_at TEXT NOT NULL DEFAULT (datetime('now')),
  velocity      REAL DEFAULT 0,                   -- Signals per week (computed)

  -- ICE + RPS + ALS scoring
  ice_score     REAL,                             -- Impact × Confidence × Ease (0-100)
  rps_score     REAL,                             -- Revenue Potential Score (0-100)
  als_score     REAL,                             -- Agent Leverage Score (0-100)
  composite_score REAL,                           -- Weighted: (ICE×0.4)+(RPS×0.35)+(ALS×0.25)

  -- Scoring metadata
  scored_by     TEXT,                             -- NULL, 'ollama', 'gpt4o'
  scored_at     TEXT,
  score_reasoning TEXT,                           -- GPT-4o explanation of scores

  -- Pipeline status
  status        TEXT NOT NULL DEFAULT 'raw',      -- 'raw','scored','prototyping','launched','monitoring','killed','scaled'

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==============================================================================
-- OPP_PROTOTYPES — Built software prototypes from high-score clusters
-- ==============================================================================
CREATE TABLE IF NOT EXISTS opp_prototypes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id    INTEGER NOT NULL,                 -- FK to opp_clusters
  name          TEXT NOT NULL,                    -- Prototype name / product name
  description   TEXT,                             -- One-line description

  -- Template & build
  template_type TEXT NOT NULL,                    -- 'saas','cli','landing','api-wrapper','chrome-ext'
  repo_url      TEXT,                             -- GitHub repo URL
  deploy_url    TEXT,                             -- Live deployment URL
  code_summary  TEXT,                             -- Brief description of what was built

  -- Agent tracking
  scaffold_agent TEXT,                            -- Agent that built it (charlie)
  qa_agent      TEXT,                             -- Agent that QA'd it (ralph)
  copy_agent    TEXT,                             -- Agent that wrote launch copy (quill)

  -- Pipeline status
  status        TEXT NOT NULL DEFAULT 'scaffolded', -- 'scaffolded','qa-passed','deployed','monitoring','killed','scaled'

  -- Timeline
  scaffolded_at TEXT NOT NULL DEFAULT (datetime('now')),
  deployed_at   TEXT,
  kill_date     TEXT,                             -- deployed_at + 14 days (auto-kill deadline)
  killed_at     TEXT,
  scaled_at     TEXT,

  -- Cost tracking
  build_cost_usd REAL DEFAULT 0,                 -- GPT-4o cost to scaffold
  total_cost_usd REAL DEFAULT 0,                 -- All costs (build + copy + deploy)

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (cluster_id) REFERENCES opp_clusters(id)
);

-- ==============================================================================
-- OPP_TRACTION — Daily traction metrics per deployed prototype
-- ==============================================================================
CREATE TABLE IF NOT EXISTS opp_traction (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  prototype_id  INTEGER NOT NULL,                 -- FK to opp_prototypes
  date          TEXT NOT NULL,                    -- Date (YYYY-MM-DD)

  -- Engagement metrics
  page_views    INTEGER DEFAULT 0,
  signups       INTEGER DEFAULT 0,
  github_stars  INTEGER DEFAULT 0,
  mentions      INTEGER DEFAULT 0,               -- Social mentions found by scanners
  revenue_cents INTEGER DEFAULT 0,               -- Stripe revenue in cents

  -- Computed
  traction_score REAL DEFAULT 0,                  -- Weighted composite of above

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (prototype_id) REFERENCES opp_prototypes(id),
  UNIQUE(prototype_id, date)
);

-- ==============================================================================
-- OPP_SCANNER_STATE — Cursor/pagination state per scanner
-- ==============================================================================
CREATE TABLE IF NOT EXISTS opp_scanner_state (
  scanner_name  TEXT PRIMARY KEY,                 -- 'reddit','hn','ph','github', etc.
  last_cursor   TEXT,                             -- Pagination cursor / after token
  last_run_at   TEXT,                             -- When scanner last completed
  items_found_total INTEGER DEFAULT 0,            -- Lifetime signals found
  items_found_last_run INTEGER DEFAULT 0,         -- Signals found in last run
  errors_last_run INTEGER DEFAULT 0,              -- Errors in last run
  enabled       INTEGER NOT NULL DEFAULT 1        -- 1 = active, 0 = disabled
);

-- ==============================================================================
-- INDEXES — Performance optimization
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_opp_signals_source ON opp_signals(source);
CREATE INDEX IF NOT EXISTS idx_opp_signals_cluster ON opp_signals(cluster_id);
CREATE INDEX IF NOT EXISTS idx_opp_signals_content_hash ON opp_signals(content_hash);
CREATE INDEX IF NOT EXISTS idx_opp_signals_classification ON opp_signals(classification);
CREATE INDEX IF NOT EXISTS idx_opp_signals_scraped ON opp_signals(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_opp_signals_url ON opp_signals(url);

CREATE INDEX IF NOT EXISTS idx_opp_clusters_status ON opp_clusters(status);
CREATE INDEX IF NOT EXISTS idx_opp_clusters_composite ON opp_clusters(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_opp_clusters_signal_count ON opp_clusters(signal_count DESC);

CREATE INDEX IF NOT EXISTS idx_opp_prototypes_cluster ON opp_prototypes(cluster_id);
CREATE INDEX IF NOT EXISTS idx_opp_prototypes_status ON opp_prototypes(status);
CREATE INDEX IF NOT EXISTS idx_opp_prototypes_kill_date ON opp_prototypes(kill_date);

CREATE INDEX IF NOT EXISTS idx_opp_traction_prototype ON opp_traction(prototype_id);
CREATE INDEX IF NOT EXISTS idx_opp_traction_date ON opp_traction(date DESC);

-- ==============================================================================
-- SEED scanner state for all 10 sources
-- ==============================================================================
INSERT OR IGNORE INTO opp_scanner_state (scanner_name, enabled) VALUES
  ('reddit', 1),
  ('hn', 1),
  ('ph', 1),
  ('github', 1),
  ('twitter', 0),
  ('forum', 0),
  ('trends', 1),
  ('stackoverflow', 1),
  ('indeed', 0),
  ('indiehackers', 0);

-- Playwright-based scanners (twitter, forum, indeed, indiehackers) disabled by default
-- Enable after confirming Playwright pool is stable on the target machine

SELECT 'Migration 034 complete: Opportunity Engine tables created' AS status;
