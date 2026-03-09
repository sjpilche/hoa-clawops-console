/**
 * @file playwrightPool.js
 * @description Singleton Playwright browser pool for all ClawOps scraping services.
 *
 * Features:
 *  - Persistent browser — launched lazily, reused across services
 *  - Auto-restart every 20 pages (memory leak prevention)
 *  - Per-domain circuit breaker (3 fails / 5 min → 10 min pause)
 *  - fetch() with 45s timeout, human delays, stealth launch args
 *  - safeClose(page) with 3s timeout + force context close
 *  - Discord alerts on circuit open/close + browser crash
 *  - Metrics upserted to playwright_browser_restarts / playwright_circuit_events / playwright_page_metrics
 *
 * Usage:
 *   const pool = require('./playwrightPool');
 *   const page = await pool.getPage();
 *   try {
 *     const html = await pool.fetch(page, 'https://example.com');
 *   } finally {
 *     await pool.safeClose(page);
 *   }
 */

const { chromium }       = require('playwright');
const { run: dbRun, get: dbGet } = require('../db/connection');
const discord            = require('./discordNotifier');

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PAGES_BEFORE_RESTART = 20;   // browser restarts after this many pages
const CIRCUIT_FAIL_THRESHOLD   = 3;    // failures before opening circuit
const CIRCUIT_FAIL_WINDOW_MS   = 5 * 60 * 1000;   // 5 minutes
const CIRCUIT_OPEN_DURATION_MS = 10 * 60 * 1000;  // 10 minutes
const DEFAULT_FETCH_TIMEOUT_MS = 45_000;
const PAGE_CLOSE_TIMEOUT_MS    = 3_000;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
];

const STEALTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Circuit Breaker State ─────────────────────────────────────────────────────
// Map<domain, { failures: [{ts}], openedAt: number|null }>

class CircuitBreakerState {
  constructor() {
    this._map = new Map();
  }

  _ensure(domain) {
    if (!this._map.has(domain)) {
      this._map.set(domain, { failures: [], openedAt: null });
    }
    return this._map.get(domain);
  }

  /**
   * Check if circuit is open for domain.
   * Auto-closes after CIRCUIT_OPEN_DURATION_MS.
   * @returns {boolean} true if paused (do not attempt)
   */
  isOpen(domain) {
    const s = this._ensure(domain);
    if (s.openedAt === null) return false;
    if (Date.now() - s.openedAt >= CIRCUIT_OPEN_DURATION_MS) {
      // Auto-close
      s.openedAt = null;
      s.failures = [];
      return false;
    }
    return true;
  }

  /**
   * Record a failure for domain.
   * @returns {{ opened: boolean }} whether circuit just opened
   */
  recordFailure(domain) {
    const s = this._ensure(domain);
    const now = Date.now();
    // Prune failures outside window
    s.failures = s.failures.filter(f => now - f.ts < CIRCUIT_FAIL_WINDOW_MS);
    s.failures.push({ ts: now });

    if (s.openedAt === null && s.failures.length >= CIRCUIT_FAIL_THRESHOLD) {
      s.openedAt = now;
      return { opened: true, failCount: s.failures.length };
    }
    return { opened: false, failCount: s.failures.length };
  }

  /**
   * Record a success — prune old failures (circuit stays closed unless already open).
   */
  recordSuccess(domain) {
    const s = this._ensure(domain);
    const now = Date.now();
    s.failures = s.failures.filter(f => now - f.ts < CIRCUIT_FAIL_WINDOW_MS);
  }

  /** Return all circuit states for health endpoint. */
  snapshot() {
    const out = {};
    for (const [domain, s] of this._map) {
      out[domain] = {
        open: s.openedAt !== null,
        openedAt: s.openedAt ? new Date(s.openedAt).toISOString() : null,
        recentFailures: s.failures.length,
        autoCloseAt: s.openedAt ? new Date(s.openedAt + CIRCUIT_OPEN_DURATION_MS).toISOString() : null,
      };
    }
    return out;
  }
}

// ── PlaywrightPool ────────────────────────────────────────────────────────────

class PlaywrightPool {
  constructor() {
    this._browser    = null;
    this._launching  = false;
    this._pagesServed = 0;
    this._restartsToday = 0;
    this._pagesInUse  = 0;
    this._circuit    = new CircuitBreakerState();
    this._lastRestartDate = null;
  }

  // ── Singleton ──────────────────────────────────────────────────────────────

  static getInstance() {
    if (!PlaywrightPool._instance) {
      PlaywrightPool._instance = new PlaywrightPool();
    }
    return PlaywrightPool._instance;
  }

  // ── Browser lifecycle ──────────────────────────────────────────────────────

  async _launchBrowser() {
    console.log('[PlaywrightPool] Launching browser...');
    this._browser = await chromium.launch({
      headless: true,
      args: LAUNCH_ARGS,
    });
    this._browser.on('disconnected', () => {
      console.warn('[PlaywrightPool] Browser disconnected unexpectedly — will re-launch on next getPage()');
      this._browser = null;
    });
    this._pagesServed = 0;
    console.log('[PlaywrightPool] Browser ready.');
  }

  /**
   * Explicit browser restart. Records reason to metrics table.
   * @param {'page_limit'|'crash'|'manual_reset'} reason
   */
  async resetBrowser(reason = 'manual_reset') {
    const pagesServed = this._pagesServed;
    console.log(`[PlaywrightPool] Restarting browser — reason: ${reason}, pages served: ${pagesServed}`);

    if (this._browser) {
      try { await this._browser.close(); } catch {}
      this._browser = null;
    }

    // Record in DB (fire-and-forget)
    try {
      dbRun(
        `INSERT INTO playwright_browser_restarts (reason, pages_served) VALUES (?, ?)`,
        [reason, pagesServed]
      );
      this._upsertDailyMetric('pages_opened', 0); // update timestamp
    } catch {}

    // Track daily restarts
    const today = new Date().toISOString().slice(0, 10);
    if (this._lastRestartDate !== today) {
      this._restartsToday = 0;
      this._lastRestartDate = today;
    }
    this._restartsToday++;

    // Discord alert if crash
    if (reason === 'crash') {
      this._discordAlert(`🔁 Playwright browser restarted (crash) after ${pagesServed} pages.`, 0xffa500);
    }

    await this._launchBrowser();
  }

  // ── getPage ────────────────────────────────────────────────────────────────

  /**
   * Returns a fresh Playwright page from a persistent browser context.
   * Restarts browser automatically every MAX_PAGES_BEFORE_RESTART pages.
   * @returns {Promise<import('playwright').Page>}
   */
  async getPage() {
    // Auto-restart on page limit
    if (this._browser && this._pagesServed >= MAX_PAGES_BEFORE_RESTART) {
      await this.resetBrowser('page_limit');
    }

    // Launch if not running
    if (!this._browser) {
      if (this._launching) {
        // Wait for concurrent launch to finish
        await new Promise(r => setTimeout(r, 2000));
      } else {
        this._launching = true;
        try {
          await this._launchBrowser();
        } finally {
          this._launching = false;
        }
      }
    }

    const context = await this._browser.newContext({
      userAgent: STEALTH_UA,
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    // Evade common bot detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    this._pagesServed++;
    this._pagesInUse++;
    this._upsertDailyMetric('pages_opened', 1);

    return page;
  }

  // ── safeClose ─────────────────────────────────────────────────────────────

  /**
   * Safely close a page (and its context) within 3s.
   * Force-closes context if page.close() hangs.
   * @param {import('playwright').Page} page
   */
  async safeClose(page) {
    if (!page) return;
    try {
      await Promise.race([
        page.close(),
        new Promise(r => setTimeout(r, PAGE_CLOSE_TIMEOUT_MS)),
      ]);
    } catch {}
    // Force-close context regardless
    try {
      const ctx = page.context();
      if (ctx) await ctx.close().catch(() => {});
    } catch {}
    this._pagesInUse = Math.max(0, this._pagesInUse - 1);
  }

  // ── fetch ──────────────────────────────────────────────────────────────────

  /**
   * Navigate to URL and return page HTML with timeout + human delay.
   * Checks circuit breaker before attempting.
   *
   * @param {import('playwright').Page} page - Page from getPage()
   * @param {string} url
   * @param {object} opts
   * @param {number} [opts.timeoutMs=45000]
   * @param {boolean} [opts.humanDelay=true]  random 1-4s delay after load
   * @param {string}  [opts.waitUntil='domcontentloaded']
   * @returns {Promise<string>} page HTML
   * @throws if circuit is open or navigation fails
   */
  async fetch(page, url, opts = {}) {
    const {
      timeoutMs  = DEFAULT_FETCH_TIMEOUT_MS,
      humanDelay = true,
      waitUntil  = 'domcontentloaded',
    } = opts;

    const domain = this._extractDomain(url);

    // Circuit breaker check
    if (this.circuitBreaker(domain)) {
      this._upsertDailyMetric('circuit_trips', 1);
      throw new Error(`[CircuitBreaker] ${domain} is paused — too many recent failures`);
    }

    try {
      await Promise.race([
        page.goto(url, { waitUntil, timeout: timeoutMs }),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`Navigation timeout after ${timeoutMs}ms: ${url}`)), timeoutMs + 1000)),
      ]);

      // Human-like delay (1–4s random)
      if (humanDelay) {
        const delay = 1000 + Math.floor(Math.random() * 3000);
        await new Promise(r => setTimeout(r, delay));
      }

      const html = await page.content();
      this._circuit.recordSuccess(domain);
      this._upsertDailyMetric('pages_ok', 1);
      return html;

    } catch (err) {
      const isTimeout = err.message.includes('timeout') || err.message.includes('Timeout');
      if (isTimeout) this._upsertDailyMetric('timeouts', 1);
      this._upsertDailyMetric('pages_failed', 1);

      const { opened, failCount } = this._circuit.recordFailure(domain);
      if (opened) {
        this._upsertDailyMetric('circuit_trips', 1);
        this._recordCircuitEvent(domain, 'open', failCount);
        this._discordAlert(
          `⚡ Circuit OPEN for \`${domain}\` — ${failCount} failures in 5 min. Pausing for 10 min.`,
          0xff4444
        );
      }

      throw err;
    }
  }

  // ── circuitBreaker ─────────────────────────────────────────────────────────

  /**
   * Returns true if the domain's circuit is open (paused).
   * Auto-closes after CIRCUIT_OPEN_DURATION_MS.
   * @param {string} domain
   * @returns {boolean}
   */
  circuitBreaker(domain) {
    const wasOpen = this._circuit.isOpen(domain);
    if (!wasOpen) return false;

    // Check if it just auto-closed (isOpen mutates state)
    const stillOpen = this._circuit.isOpen(domain);
    if (wasOpen && !stillOpen) {
      // Circuit just auto-closed
      this._recordCircuitEvent(domain, 'close', 0);
      this._discordAlert(
        `✅ Circuit CLOSED for \`${domain}\` — auto-recovered after 10 min pause.`,
        0x00cc44
      );
    }
    return stillOpen;
  }

  // ── Health snapshot ────────────────────────────────────────────────────────

  /**
   * Returns current pool state for the health endpoint.
   */
  healthSnapshot() {
    return {
      browserActive: this._browser !== null && this._browser.isConnected(),
      pagesServed: this._pagesServed,
      pagesInUse: this._pagesInUse,
      browserRestartsToday: this._restartsToday,
      maxPagesBeforeRestart: MAX_PAGES_BEFORE_RESTART,
      circuits: this._circuit.snapshot(),
    };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  _upsertDailyMetric(field, increment) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      dbRun(
        `INSERT INTO playwright_page_metrics (metric_date, ${field})
         VALUES (?, ?)
         ON CONFLICT(metric_date) DO UPDATE SET
           ${field} = ${field} + excluded.${field},
           updated_at = datetime('now')`,
        [today, increment]
      );
    } catch { /* non-critical */ }
  }

  _recordCircuitEvent(domain, event, failCount) {
    try {
      dbRun(
        `INSERT INTO playwright_circuit_events (domain, event, fail_count) VALUES (?, ?, ?)`,
        [domain, event, failCount]
      );
    } catch {}
  }

  _discordAlert(text, color = 0x5865f2) {
    try {
      discord.postWebhook({
        embeds: [{
          description: text,
          color,
          timestamp: new Date().toISOString(),
          footer: { text: 'PlaywrightPool · ClawOps' },
        }],
      }).catch(() => {});
    } catch {}
  }
}

// ── Singleton static ──────────────────────────────────────────────────────────
PlaywrightPool._instance = null;

// ── Module export ─────────────────────────────────────────────────────────────
module.exports = PlaywrightPool.getInstance();
