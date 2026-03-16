CREATE TABLE IF NOT EXISTS engagement_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  lead_table TEXT NOT NULL DEFAULT 'cfo_leads',
  sequence_id INTEGER DEFAULT NULL,
  event_type TEXT NOT NULL,
  email_subject TEXT DEFAULT NULL,
  link_url TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
