/**
 * @file jakeLeadRotation.js
 * @description National market rotation for jake-lead-scout.
 *
 * Breaks the US into 60 metro/region targets across all 50 states.
 * Each daily run gets 1 target — the next one in rotation that hasn't
 * been scouted in the last 60 days (full cycle = ~2 months).
 *
 * Rotation state is stored in the DB (agent_kv table).
 * Falls back to index-based rotation if DB unavailable.
 */

'use strict';

const { get, run } = require('../db/connection');

// ═══════════════════════════════════════════════════════════════════════════
// NATIONAL MARKET ROTATION — 60 targets across all 50 states
// ═══════════════════════════════════════════════════════════════════════════

const MARKETS = [
  // ── Florida (high priority — DBPR already covers these, LLM scout finds contacts) ──
  { region: 'Tampa Bay, FL', trade: 'GC', priority: 1 },
  { region: 'Miami, FL', trade: 'GC', priority: 1 },
  { region: 'Orlando, FL', trade: 'GC', priority: 1 },
  { region: 'Jacksonville, FL', trade: 'GC', priority: 1 },

  // ── Texas ──
  { region: 'Dallas-Fort Worth, TX', trade: 'GC', priority: 1 },
  { region: 'Houston, TX', trade: 'GC', priority: 1 },
  { region: 'San Antonio, TX', trade: 'GC', priority: 2 },
  { region: 'Austin, TX', trade: 'GC', priority: 2 },

  // ── Southeast ──
  { region: 'Atlanta, GA', trade: 'GC', priority: 1 },
  { region: 'Charlotte, NC', trade: 'GC', priority: 1 },
  { region: 'Nashville, TN', trade: 'GC', priority: 1 },
  { region: 'Raleigh, NC', trade: 'GC', priority: 2 },
  { region: 'Birmingham, AL', trade: 'GC', priority: 2 },
  { region: 'Memphis, TN', trade: 'GC', priority: 2 },
  { region: 'Columbia, SC', trade: 'GC', priority: 2 },

  // ── Mid-Atlantic ──
  { region: 'Philadelphia, PA', trade: 'GC', priority: 1 },
  { region: 'Washington DC area', trade: 'GC', priority: 1 },
  { region: 'Baltimore, MD', trade: 'GC', priority: 2 },
  { region: 'Richmond, VA', trade: 'GC', priority: 2 },
  { region: 'Pittsburgh, PA', trade: 'GC', priority: 2 },

  // ── Northeast ──
  { region: 'New York metro area', trade: 'GC', priority: 1 },
  { region: 'Boston, MA', trade: 'GC', priority: 1 },
  { region: 'Hartford, CT', trade: 'GC', priority: 2 },
  { region: 'Providence, RI', trade: 'GC', priority: 3 },
  { region: 'Albany, NY', trade: 'GC', priority: 3 },

  // ── Midwest ──
  { region: 'Chicago, IL', trade: 'GC', priority: 1 },
  { region: 'Minneapolis, MN', trade: 'GC', priority: 1 },
  { region: 'Columbus, OH', trade: 'GC', priority: 1 },
  { region: 'Cleveland, OH', trade: 'GC', priority: 2 },
  { region: 'Cincinnati, OH', trade: 'GC', priority: 2 },
  { region: 'Indianapolis, IN', trade: 'GC', priority: 2 },
  { region: 'Detroit, MI', trade: 'GC', priority: 2 },
  { region: 'Kansas City, MO', trade: 'GC', priority: 2 },
  { region: 'St. Louis, MO', trade: 'GC', priority: 2 },
  { region: 'Milwaukee, WI', trade: 'GC', priority: 3 },

  // ── Mountain/Southwest ──
  { region: 'Denver, CO', trade: 'GC', priority: 1 },
  { region: 'Phoenix, AZ', trade: 'GC', priority: 1 },
  { region: 'Salt Lake City, UT', trade: 'GC', priority: 1 },
  { region: 'Las Vegas, NV', trade: 'GC', priority: 2 },
  { region: 'Albuquerque, NM', trade: 'GC', priority: 2 },
  { region: 'Tucson, AZ', trade: 'GC', priority: 3 },
  { region: 'Colorado Springs, CO', trade: 'GC', priority: 3 },
  { region: 'Boise, ID', trade: 'GC', priority: 2 },

  // ── Pacific Northwest ──
  { region: 'Seattle, WA', trade: 'GC', priority: 1 },
  { region: 'Portland, OR', trade: 'GC', priority: 1 },
  { region: 'Spokane, WA', trade: 'GC', priority: 3 },

  // ── California ──
  { region: 'Los Angeles, CA', trade: 'GC', priority: 1 },
  { region: 'San Diego, CA', trade: 'GC', priority: 1 },
  { region: 'San Francisco Bay Area, CA', trade: 'GC', priority: 1 },
  { region: 'Sacramento, CA', trade: 'GC', priority: 2 },
  { region: 'Fresno, CA', trade: 'GC', priority: 3 },

  // ── South-Central ──
  { region: 'New Orleans, LA', trade: 'GC', priority: 2 },
  { region: 'Oklahoma City, OK', trade: 'GC', priority: 2 },
  { region: 'Tulsa, OK', trade: 'GC', priority: 3 },
  { region: 'Little Rock, AR', trade: 'GC', priority: 3 },

  // ── Plains ──
  { region: 'Omaha, NE', trade: 'GC', priority: 2 },
  { region: 'Des Moines, IA', trade: 'GC', priority: 3 },
  { region: 'Sioux Falls, SD', trade: 'GC', priority: 3 },
  { region: 'Fargo, ND', trade: 'GC', priority: 3 },
];

// KV table key for rotation state
const KV_KEY = 'jake_lead_scout_rotation';

// ═══════════════════════════════════════════════════════════════════════════
// ROTATION STATE — stored in DB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure the agent_kv table exists (created lazily).
 */
function ensureKvTable() {
  try {
    run(`
      CREATE TABLE IF NOT EXISTS agent_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
  } catch (err) {
    // Table may already exist — ignore
  }
}

function getRotationState() {
  ensureKvTable();
  const row = get('SELECT value FROM agent_kv WHERE key = ?', [KV_KEY]);
  if (!row) return { index: 0, last_scouted: {} };
  try {
    return JSON.parse(row.value);
  } catch {
    return { index: 0, last_scouted: {} };
  }
}

function saveRotationState(state) {
  ensureKvTable();
  run(
    `INSERT INTO agent_kv (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [KV_KEY, JSON.stringify(state)]
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROTATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the next market to scout.
 *
 * Selection order:
 * 1. Priority 1 markets that haven't been scouted in 30+ days
 * 2. Priority 2 markets that haven't been scouted in 45+ days
 * 3. Priority 3 markets that haven't been scouted in 60+ days
 * 4. Fallback: next market in index order
 *
 * @returns {{ region: string, trade: string, priority: number, index: number }}
 */
function getNextMarket() {
  const state = getRotationState();
  const now = Date.now();

  // Check priority-ordered eligibility
  const PRIORITY_COOLDOWN = { 1: 30, 2: 45, 3: 60 }; // days

  for (const priority of [1, 2, 3]) {
    const cooldownMs = PRIORITY_COOLDOWN[priority] * 24 * 60 * 60 * 1000;
    const eligible = MARKETS.filter((m, i) => {
      if (m.priority !== priority) return false;
      const lastScouted = state.last_scouted[i];
      if (!lastScouted) return true; // Never scouted
      return now - new Date(lastScouted).getTime() >= cooldownMs;
    });

    if (eligible.length > 0) {
      // Pick the one that was scouted longest ago (or never)
      eligible.sort((a, b) => {
        const idxA = MARKETS.indexOf(a);
        const idxB = MARKETS.indexOf(b);
        const lastA = state.last_scouted[idxA] ? new Date(state.last_scouted[idxA]).getTime() : 0;
        const lastB = state.last_scouted[idxB] ? new Date(state.last_scouted[idxB]).getTime() : 0;
        return lastA - lastB; // Oldest first
      });
      const chosen = eligible[0];
      return { ...chosen, index: MARKETS.indexOf(chosen) };
    }
  }

  // Fallback: round-robin by index
  const idx = state.index % MARKETS.length;
  return { ...MARKETS[idx], index: idx };
}

/**
 * Mark a market as scouted (call after successful run).
 */
function markMarketScouted(marketIndex) {
  const state = getRotationState();
  state.last_scouted[marketIndex] = new Date().toISOString();
  state.index = (marketIndex + 1) % MARKETS.length;
  saveRotationState(state);
}

/**
 * Get the message JSON for the next market run.
 * Passed directly to the jake-lead-scout OpenClaw agent.
 */
function getNextRunMessage(overrides = {}) {
  const market = getNextMarket();
  return {
    region: market.region,
    trade: overrides.trade || market.trade,
    limit: overrides.limit || 8,  // 8 leads per run — quality over quantity
    pain_focus: overrides.pain_focus || null,
    _market_index: market.index,  // Internal — used to mark scouted after run
  };
}

/**
 * Get a status summary of all markets and their last scouted dates.
 */
function getRotationStatus() {
  const state = getRotationState();
  return MARKETS.map((m, i) => ({
    index: i,
    region: m.region,
    priority: m.priority,
    last_scouted: state.last_scouted[i] || null,
    days_since: state.last_scouted[i]
      ? Math.floor((Date.now() - new Date(state.last_scouted[i]).getTime()) / (1000 * 60 * 60 * 24))
      : null,
  }));
}

module.exports = {
  MARKETS,
  getNextMarket,
  markMarketScouted,
  getNextRunMessage,
  getRotationStatus,
};
