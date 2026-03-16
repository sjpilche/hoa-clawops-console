-- Migration 036: Content Calendar
-- Gives content writers a target keyword + topic each week instead of random generation.
-- Tracks publish status and links to content pieces.

CREATE TABLE IF NOT EXISTS content_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_date TEXT NOT NULL,            -- ISO date (2026-03-17)
  product TEXT NOT NULL DEFAULT 'hoa',     -- 'hoa' | 'jake'
  channel TEXT NOT NULL DEFAULT 'blog',    -- 'blog' | 'linkedin' | 'social'
  pillar TEXT DEFAULT NULL,                -- 'cash_flow' | 'cost_control' | 'pilot_proof' | 'trust_envelope' | 'reserve_fund' | 'special_assessment'
  topic TEXT NOT NULL,                     -- "How to Fund a $500K Roof Replacement Without a Special Assessment"
  target_keyword TEXT DEFAULT NULL,        -- "hoa roof replacement funding"
  secondary_keywords TEXT DEFAULT NULL,    -- JSON array: ["hoa reserve fund", "special assessment alternatives"]
  search_intent TEXT DEFAULT 'informational', -- 'informational' | 'commercial' | 'transactional'
  notes TEXT DEFAULT NULL,                 -- Editorial notes for the writer
  status TEXT DEFAULT 'planned',           -- 'planned' | 'assigned' | 'drafted' | 'published' | 'skipped'
  content_piece_id INTEGER DEFAULT NULL,   -- FK to cfo_content_pieces when published
  assigned_agent TEXT DEFAULT NULL,        -- 'hoa-content-writer' | 'jake-content-engine'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_calendar_status ON content_calendar(status);
CREATE INDEX IF NOT EXISTS idx_calendar_product ON content_calendar(product);
CREATE INDEX IF NOT EXISTS idx_calendar_keyword ON content_calendar(target_keyword);
