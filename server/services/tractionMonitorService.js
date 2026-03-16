/**
 * @file tractionMonitorService.js
 * @description Real metric fetching for deployed prototypes.
 *
 * Pulls data from:
 *   - GitHub API: stars, forks, open issues
 *   - Vercel Analytics API: page views, unique visitors
 *   - Stripe API: revenue, customer count
 *
 * Computes a traction_score (0-100) from weighted signals.
 * Updates opp_traction table with real numbers.
 *
 * Handler: traction_monitor (in runs.js)
 * Cost: $0/run (all free-tier APIs)
 */

'use strict';

const { get, run, all } = require('../db/connection');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API = 'https://api.github.com';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// ── GitHub Metrics ──────────────────────────────────────────────────────────

async function fetchGitHubMetrics(repoFullName) {
  if (!GITHUB_TOKEN || !repoFullName) return { stars: 0, forks: 0, issues: 0 };

  try {
    const resp = await fetch(`${GITHUB_API}/repos/${repoFullName}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return { stars: 0, forks: 0, issues: 0 };

    const data = await resp.json();
    return {
      stars: data.stargazers_count || 0,
      forks: data.forks_count || 0,
      issues: data.open_issues_count || 0,
    };
  } catch {
    return { stars: 0, forks: 0, issues: 0 };
  }
}

// ── Vercel Analytics ────────────────────────────────────────────────────────

async function fetchVercelAnalytics(projectName) {
  if (!VERCEL_TOKEN || !projectName) return { pageViews: 0, visitors: 0 };

  const teamParam = VERCEL_TEAM_ID ? `&teamId=${VERCEL_TEAM_ID}` : '';

  // Get last 24 hours of analytics
  const from = new Date(Date.now() - 86400000).toISOString();
  const to = new Date().toISOString();

  try {
    // Page views endpoint
    const resp = await fetch(
      `https://api.vercel.com/v1/web/insights/stats?projectId=${projectName}&from=${from}&to=${to}&type=pageview${teamParam}`,
      {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!resp.ok) return { pageViews: 0, visitors: 0 };

    const data = await resp.json();
    return {
      pageViews: data.totalPageViews || data.total || 0,
      visitors: data.totalVisitors || data.uniqueVisitors || 0,
    };
  } catch {
    return { pageViews: 0, visitors: 0 };
  }
}

// ── Stripe Revenue ──────────────────────────────────────────────────────────

async function fetchStripeRevenue(productId) {
  if (!STRIPE_SECRET_KEY || !productId) return { revenueCents: 0, customers: 0 };

  try {
    // Fetch charges for this product in last 30 days
    const since = Math.floor((Date.now() - 30 * 86400000) / 1000);
    const resp = await fetch(
      `https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}`,
      {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!resp.ok) return { revenueCents: 0, customers: 0 };

    const data = await resp.json();
    const charges = data.data || [];

    // Sum paid charges (filter by product if possible via metadata)
    let revenueCents = 0;
    const customerSet = new Set();
    for (const charge of charges) {
      if (charge.paid && !charge.refunded) {
        // If we can match product, filter; otherwise count all
        if (!productId || charge.metadata?.product_id === productId || charges.length <= 10) {
          revenueCents += charge.amount;
          if (charge.customer) customerSet.add(charge.customer);
        }
      }
    }

    return { revenueCents, customers: customerSet.size };
  } catch {
    return { revenueCents: 0, customers: 0 };
  }
}

// ── Traction Score ──────────────────────────────────────────────────────────

/**
 * Compute weighted traction score (0-100).
 *
 * Weights:
 *   Revenue: 40 pts (any revenue = instant 40)
 *   Page views: 25 pts (100+ views/day = full marks)
 *   GitHub stars: 15 pts (10+ stars = full marks)
 *   Signups/visitors: 20 pts (50+ unique visitors = full marks)
 */
function computeTractionScore({ pageViews, visitors, stars, revenueCents }) {
  let score = 0;

  // Revenue (most important — any revenue = success signal)
  if (revenueCents > 0) score += 40;

  // Page views (capped at 25 pts)
  score += Math.min(25, Math.round((pageViews / 100) * 25));

  // GitHub stars (capped at 15 pts)
  score += Math.min(15, stars * 1.5);

  // Unique visitors (capped at 20 pts)
  score += Math.min(20, Math.round((visitors / 50) * 20));

  return Math.min(100, Math.round(score));
}

// ── Main: Fetch All Metrics for a Prototype ─────────────────────────────────

/**
 * Fetch real metrics for a single prototype and update opp_traction.
 */
async function fetchAndRecordMetrics(proto) {
  const today = new Date().toISOString().slice(0, 10);

  // Fetch from all sources in parallel
  const [github, vercel, stripe] = await Promise.all([
    fetchGitHubMetrics(proto.github_repo),
    fetchVercelAnalytics(proto.name?.replace(/[^a-zA-Z0-9-]/g, '-')),
    fetchStripeRevenue(proto.stripe_product_id),
  ]);

  const tractionScore = computeTractionScore({
    pageViews: vercel.pageViews,
    visitors: vercel.visitors,
    stars: github.stars,
    revenueCents: stripe.revenueCents,
  });

  // Upsert today's traction entry
  const existing = get(
    "SELECT id FROM opp_traction WHERE prototype_id = ? AND date = ?",
    [proto.id, today]
  );

  if (existing) {
    run(`UPDATE opp_traction SET
      page_views = ?, signups = ?, github_stars = ?, revenue_cents = ?, traction_score = ?
      WHERE id = ?`,
      [vercel.pageViews, vercel.visitors, github.stars, stripe.revenueCents, tractionScore, existing.id]
    );
  } else {
    run(`INSERT INTO opp_traction (prototype_id, date, page_views, signups, github_stars, mentions, revenue_cents, traction_score)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [proto.id, today, vercel.pageViews, vercel.visitors, github.stars, stripe.revenueCents, tractionScore]
    );
  }

  return {
    name: proto.product_name || proto.name || proto.id,
    github: { stars: github.stars, forks: github.forks },
    vercel: { pageViews: vercel.pageViews, visitors: vercel.visitors },
    stripe: { revenueCents: stripe.revenueCents, customers: stripe.customers },
    tractionScore,
  };
}

module.exports = {
  fetchGitHubMetrics,
  fetchVercelAnalytics,
  fetchStripeRevenue,
  computeTractionScore,
  fetchAndRecordMetrics,
};
