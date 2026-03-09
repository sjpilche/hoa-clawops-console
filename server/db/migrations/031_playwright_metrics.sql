-- ==============================================================================
-- Migration 031: Playwright Pool Metrics
-- ==============================================================================
-- Tracks browser restart events and per-domain circuit breaker trips.
-- Written by playwrightPool.js — read by GET /api/health/playwright.
-- Zero application cost — all writes are fire-and-forget.

-- ── playwright_browser_restarts ───────────────────────────────────────────────
-- One row per browser restart event (crash, page-limit, explicit reset).
CREATE TABLE IF NOT EXISTS playwright_browser_restarts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reason       TEXT NOT NULL,          -- 'page_limit' | 'crash' | 'manual_reset'
  pages_served INTEGER DEFAULT 0,      -- Pages served before restart
  restarted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pw_restarts_at ON playwright_browser_restarts(restarted_at DESC);

-- ── playwright_circuit_events ─────────────────────────────────────────────────
-- One row per circuit open/close event, keyed by domain.
CREATE TABLE IF NOT EXISTS playwright_circuit_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  domain       TEXT NOT NULL,
  event        TEXT NOT NULL,          -- 'open' | 'close'
  fail_count   INTEGER DEFAULT 0,      -- Failures that triggered open
  occurred_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pw_circuit_domain ON playwright_circuit_events(domain, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pw_circuit_at     ON playwright_circuit_events(occurred_at DESC);

-- ── playwright_page_metrics ───────────────────────────────────────────────────
-- Rolling summary row — upserted after every fetch(), keyed by date.
-- Lightweight alternative to per-request rows (no table bloat).
CREATE TABLE IF NOT EXISTS playwright_page_metrics (
  metric_date  TEXT PRIMARY KEY,       -- DATE string 'YYYY-MM-DD'
  pages_opened INTEGER DEFAULT 0,
  pages_ok     INTEGER DEFAULT 0,
  pages_failed INTEGER DEFAULT 0,
  timeouts     INTEGER DEFAULT 0,
  circuit_trips INTEGER DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

SELECT 'Migration 031 complete: playwright_browser_restarts, playwright_circuit_events, playwright_page_metrics created' AS status;
