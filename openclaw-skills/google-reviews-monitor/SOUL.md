# Google Reviews Signal Monitor (Agent 5)

**Agent ID:** `google-reviews-monitor`
**Purpose:** Monitor Google Maps reviews for HOA capital need signals in real-time
**Cost:** $0/month (public web scraping, no API)
**Priority:** 🔴 CRITICAL - Highest ROI agent

---

## Mission

Continuously monitor Google Maps reviews for HOA communities, scoring each based on keyword signals that indicate **capital need, financial distress, or deferred maintenance.** A review mentioning "special assessment," "roof replacement," or "reserve fund shortfall" is a near-perfect buying signal - the HOA needs money RIGHT NOW.

This agent finds leads at the exact moment of need, not before.

---

## Why This Is FREE

- ✅ Google Maps is public (no authentication)
- ✅ Playwright web scraping (no API keys)
- ✅ Keyword scoring (deterministic, no LLM)
- ✅ No rate limits (human-like browsing)
- ✅ **Total Cost: $0/month**

---

## Input Parameters

```json
{
  "limit": 10,
  "tier": "HOT"
}
```

**Defaults:**
- `limit`: 10 HOAs per run
- `tier`: null (monitors all HOAs, prioritizes least recently reviewed)

---

## Keyword Scoring System

### Tier 1: Capital Need Signals (+15 points each)
- special assessment
- reserve fund shortage
- deferred maintenance
- capital improvement
- roof replacement
- repaving / parking lot
- elevator repair
- pipe replacement
- plumbing replacement
- loan / borrowing
- assessment coming
- project funding

### Tier 2: Distress Signals (+10 points each)
- falling apart
- needs repair
- crumbling / cracked / broken
- safety hazard / dangerous
- board not listening
- fees going up
- underfunded / poorly funded
- neglected
- terrible condition
- lawsuit / litigation

### Tier 3: Awareness Signals (+5 points each)
- renovation / remodel
- construction / upgrade
- budget meeting
- new management
- reserve study
- old building / aging
- pool closed / gym closed

### Negative Modifiers
- just completed: -10
- already fixed: -10
- well maintained: -8
- reserves healthy: -15
- fully funded: -15

---

## Scoring Calculation

**Per-Review Score:**
```
raw_score = (tier1_hits × 15) + (tier2_hits × 10) + (tier3_hits × 5) - negative_hits
raw_score = raw_score × star_multiplier  // 1-star = 1.5x, 5-star = 0.5x
weighted_score = raw_score × recency_multiplier  // <30 days = 2.0x, >1 year = 0.3x
```

**Community Aggregate Score:**
```
community_score = SUM(weighted_score for all reviews)
+ convergence_bonus  // +10 if 3+ reviews mention same project
Cap at 100
```

**Tier Assignment:**
- 75-100: 🔴 HOT (immediate outreach)
- 50-74: 🟠 WARM (weekly nurture)
- 25-49: 🟡 MONITOR (re-check in 30 days)
- 0-24: ⚪ COLD (re-check in 90 days)

---

## Process Flow

1. **Select HOAs:** Prioritize oldest `google_last_reviewed_at` (never reviewed first)
2. **Scrape Reviews:** Playwright automation
   - Navigate to Google Maps
   - Open Reviews tab
   - Sort by "Newest"
   - Scroll and expand "More" buttons
   - Extract: reviewer, stars, text, date
3. **Score Reviews:** Keyword matching + multipliers
4. **Save to Database:** `hoa_reviews` table
5. **Update HOA:** `google_signal_score`, `google_signal_tier`, keywords
6. **Fire Alerts:** If tier changes to HOT/WARM

---

## Output Example

**Successful Monitoring:**
```
🔍 Waterfront HOA, Sarasota, FL

  Reviews: 23 total
  Signals: 5 reviews with keywords
  Score: 82 / 100
  Tier: 🔴 HOT

  Top Keywords: special assessment, roof replacement, falling apart

  TIER CHANGE: COLD → HOT 🔥

  ✅ Saved 23 reviews to database
```

---

## Integration with Existing Pipeline

**Current 4-Agent Pipeline:**
```
Agent 1 (Discovery) → Agent 2 (Minutes) → Agent 3 (Enricher) → Agent 4 (Outreach)
```

**NEW with Agent 5:**
```
Agent 1 (Discovery) → Agent 5 (Google Reviews) → Agent 3 (Enricher) → Agent 4 (Outreach)
                   ↘ Agent 2 (Minutes)         ↗
```

**Parallel Scoring:**
- Agent 2 scores from meeting minutes
- Agent 5 scores from Google reviews
- Combine: `total_score = minutes_score + google_score`
- Different sources validate each other

---

## Success Metrics

**Expected Results (per 10 HOAs monitored):**
- 30% have Google reviews with signals
- ~3 HOT leads (score ≥75)
- ~5 WARM leads (score 50-74)

**ROI:**
- 5 HOT leads/month from Google reviews
- 10% response rate (vs 5% for minutes - real-time advantage!)
- ~0.4 deals/year = $2K additional revenue
- At $0 cost = **INFINITE ROI**

---

## Special Handler

This agent uses a **special handler** (Node.js + Playwright):

**File:** `server/services/googleReviewsMonitor.js`
**Function:** `monitorMultipleHOAs(params)`

**Why special handler:**
- Playwright scraping (deterministic, no LLM)
- Keyword scoring (regex, no LLM)
- Faster and cheaper than full OpenClaw run
- **Cost: $0** (public data scraping)

---

## Testing

```bash
# Monitor 5 HOAs
node scripts/run-google-reviews-monitor.js --limit=5

# Monitor HOT tier only (check frequently)
node scripts/run-google-reviews-monitor.js --limit=10 --tier=HOT

# View results in database
node -e "const initSqlJs = require('sql.js'); const fs = require('fs'); (async () => { const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync('hoa_leads.sqlite')); const stmt = db.prepare('SELECT name, city, state, google_signal_score, google_signal_tier, signal_review_count FROM hoa_communities WHERE google_signal_score > 0 ORDER BY google_signal_score DESC LIMIT 10'); while (stmt.step()) { const r = stmt.getAsObject(); console.log(r.name + ', ' + r.city + ' - Score: ' + r.google_signal_score + ' (' + r.google_signal_tier + ') - ' + r.signal_review_count + ' signal reviews'); } stmt.free(); db.close(); })();"
```

---

## Database Tables

### hoa_reviews (new)
- Review data, scores, keyword hits
- Links to hoa_communities via hoa_id

### hoa_communities (updated)
- google_signal_score
- google_signal_tier
- google_signal_keywords (top 5)
- total_google_reviews
- signal_review_count
- google_last_reviewed_at

---

Last updated: February 17, 2026
Agent Status: ✅ Operational
Cost: $0/month (completely FREE!)
ROI: INFINITE (no cost, pure profit)
