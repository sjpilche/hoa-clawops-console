-- Migration 014: Google Reviews Signal Monitor
-- Agent 5: Monitors Google Maps reviews for capital need signals
-- Cost: $0/month (public web scraping, no API)

-- Create hoa_reviews table
CREATE TABLE IF NOT EXISTS hoa_reviews (
  id TEXT PRIMARY KEY,
  hoa_id INTEGER NOT NULL,
  google_review_id TEXT,
  reviewer_name TEXT,
  star_rating INTEGER CHECK(star_rating BETWEEN 1 AND 5),
  review_text TEXT,
  review_date TEXT,
  scraped_at TEXT DEFAULT (datetime('now')),

  -- Scoring fields
  raw_score REAL DEFAULT 0,
  weighted_score REAL DEFAULT 0,
  tier1_hits TEXT DEFAULT '[]',
  tier2_hits TEXT DEFAULT '[]',
  tier3_hits TEXT DEFAULT '[]',
  negative_hits TEXT DEFAULT '[]',
  is_signal INTEGER DEFAULT 0,
  signal_strength TEXT,

  FOREIGN KEY (hoa_id) REFERENCES hoa_communities(id),
  UNIQUE(hoa_id, google_review_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_hoa ON hoa_reviews(hoa_id);
CREATE INDEX IF NOT EXISTS idx_reviews_signal ON hoa_reviews(is_signal, weighted_score DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON hoa_reviews(review_date DESC);

-- Add Google Reviews columns to hoa_communities
-- (Using ALTER TABLE since table already exists)
-- Note: SQLite doesn't support multiple ADD COLUMN in one statement

-- Check if columns already exist before adding
-- SQLite will error if column exists, so we'll handle this in the migration runner
