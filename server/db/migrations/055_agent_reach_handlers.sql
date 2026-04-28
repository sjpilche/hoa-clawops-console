-- 055: Agent-Reach powered handlers — RSS, YouTube, Exa competitor intel.
-- These agents use upstream tools installed by Agent-Reach (mcporter/Exa, yt-dlp, feedparser).
-- All $0/run — no API costs.

-- ── Agent-Reach Agents ──

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'ar-rss-digest-001',
  'rss-feed-digest',
  'Polls Construction Dive, ENR, DatacenterDynamics, Utility Dive, CAI feeds. Scores articles by keyword relevance, sends Discord digest. $0/run.',
  '{"special_handler":"rss_feed_digest"}',
  'idle',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'ar-youtube-intel-001',
  'youtube-intel-scan',
  'Mines YouTube transcripts from DC Intel / construction channels via yt-dlp. Extracts auto-generated subtitles, scores for relevance, posts intel notes. $0/run.',
  '{"special_handler":"youtube_intel_scan"}',
  'idle',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO agents (id, name, description, config, status, created_at, updated_at)
VALUES (
  'ar-exa-competitor-001',
  'exa-competitor-intel',
  'Semantic search for competitive signals across HOA lending, construction CFO software, and DC site selection. Uses Exa AI — finds thematic matches keyword search misses. $0/run.',
  '{"special_handler":"exa_competitor_intel"}',
  'idle',
  datetime('now'),
  datetime('now')
);

-- ── Schedules ──

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-rss-daily',
  'Daily RSS Digest',
  'Poll all RSS feeds at 9am daily, score and send Discord digest.',
  'ar-rss-digest-001',
  'rss-feed-digest',
  '0 9 * * *',
  '{"minScore":0.3}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-youtube-weekly',
  'Weekly YouTube Intel',
  'Mine YouTube transcripts for DC Intel signals every Monday at 8am.',
  'ar-youtube-intel-001',
  'youtube-intel-scan',
  '0 8 * * 1',
  '{"type":"dc_intel","maxVideos":3,"minScore":0.3}',
  1,
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO schedules (id, name, description, agent_id, agent_name, cron_expression, message, enabled, created_at, updated_at)
VALUES (
  'sched-exa-competitor-weekly',
  'Weekly Competitor Intel',
  'Semantic competitor scan every Wednesday at 10am across all business lines.',
  'ar-exa-competitor-001',
  'exa-competitor-intel',
  '0 10 * * 3',
  '{"focus":"all"}',
  1,
  datetime('now'),
  datetime('now')
);
