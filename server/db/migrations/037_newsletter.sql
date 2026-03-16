-- Migration 037: Newsletter Subscribers
-- Separate from cfo_leads because newsletter subscribers may not be leads yet.
-- They become leads when they submit a full contact form or download a lead magnet.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT NULL,
  product TEXT DEFAULT 'hoa',              -- 'hoa' | 'jake' | 'both'
  source TEXT DEFAULT 'website',           -- 'website' | 'blog' | 'lead_magnet' | 'social' | 'manual'
  source_detail TEXT DEFAULT NULL,         -- page URL, magnet name, etc.
  status TEXT DEFAULT 'active',            -- 'active' | 'unsubscribed' | 'bounced'
  lead_id INTEGER DEFAULT NULL,            -- FK to cfo_leads if they become a lead
  -- Welcome sequence tracking
  welcome_step INTEGER DEFAULT 0,          -- 0=none, 1=welcome sent, 2=intro sent, 3=case study, 4=cta
  welcome_next_at TEXT DEFAULT NULL,       -- when to send next welcome email
  -- Engagement
  total_opens INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  last_open_at TEXT DEFAULT NULL,
  -- Timestamps
  subscribed_at TEXT DEFAULT (datetime('now')),
  unsubscribed_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_welcome ON newsletter_subscribers(welcome_step, welcome_next_at);

-- Track which blog posts have been broadcast to the newsletter
CREATE TABLE IF NOT EXISTS newsletter_broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_piece_id INTEGER DEFAULT NULL,   -- FK to cfo_content_pieces
  blog_slug TEXT DEFAULT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT DEFAULT NULL,
  recipient_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',           -- 'pending' | 'sending' | 'sent' | 'failed'
  sent_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
