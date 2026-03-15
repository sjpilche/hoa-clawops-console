# Mission Control — API Contract Specification
*ClawOps Console — Server-Side Design Document*
*Written: 2026-03-13*
*Status: SPEC — Not yet implemented. See dashboard_spec.md Phase 2 for build order.*

---

## Overview

Two new endpoint groups are needed to power Mission Control:

1. `GET /api/dashboard/summary` — single aggregated call for all pipeline metrics
2. `GET/POST /api/opportunities` — CRUD for the revenue experiments tracker

Both require authentication via the existing `authenticate` middleware.

---

## ENDPOINT 1: `GET /api/dashboard/summary`

### Route Registration (add to `server/index.js`)

```javascript
// Top of file (with other requires)
const dashboardRoutes = require('./routes/dashboard');

// Inside startServer(), with other app.use() calls
app.use('/api/dashboard', dashboardRoutes);
```

### File Location
`server/routes/dashboard.js`

### Auth
```javascript
router.use(authenticate);
```

### Performance Target
< 50ms. This is 100% SQLite reads — no LLM calls, no external HTTP. All queries run synchronously via the existing `get()` / `all()` helpers.

### Response Shape

```json
{
  "meta": {
    "generated_at": "2026-03-13T14:23:01.000Z",
    "cost_today_usd": 0.1243,
    "cost_this_week_usd": 0.8910,
    "agents_running": 2,
    "agents_total": 53,
    "schedules_active": 41,
    "agent_success_rate": 0.92,
    "reply_rate": 0.0,
    "days_since_revenue": 22
  },

  "jake": {
    "total": 54,
    "with_email": 13,
    "email_pct": 24.07,
    "in_outreach": 4,
    "replied": 0,
    "hot": 3,
    "meetings": 0,
    "nurture": 0,
    "unsubscribed": 0,
    "bounced": 0,
    "last_lead_at": "2026-03-12T18:45:22.000Z",
    "last_lead_hours_ago": 19.6,
    "funnel": {
      "discovered": 54,
      "enriched": 13,
      "outreach": 4,
      "replied": 0,
      "meeting": 0
    }
  },

  "hoa": {
    "total": 568,
    "hot": 12,
    "warm": 47,
    "watch": 189,
    "cold": 320,
    "posted": 8,
    "pending_review": 23,
    "approved": 5,
    "rejected": 2,
    "last_discovery_at": "2026-03-10T09:12:44.000Z",
    "last_discovery_hours_ago": 53.2,
    "geo_targets_active": 19,
    "funnel": {
      "discovered": 568,
      "hot_warm": 59,
      "outreach_drafted": 31,
      "posted": 8,
      "engaged": 0
    }
  },

  "content": {
    "this_week": 4,
    "published": 2,
    "drafted": 2,
    "scheduled": 1,
    "social_posts_week": 6,
    "last_published_at": "2026-03-10T10:30:00.000Z",
    "last_published_title": "Why Construction CFOs Lose Sleep Over...",
    "channels_active": ["blog", "linkedin", "facebook"]
  },

  "opportunities": {
    "active": 5,
    "evaluating": 3,
    "converted": 0,
    "killed": 0,
    "top_opportunity": {
      "id": 3,
      "name": "ClawOps as SaaS for small operators",
      "ice_score": 63,
      "status": "evaluating"
    },
    "days_since_new_idea": 2,
    "ideas_above_60": 2
  },

  "brain": {
    "observations_7d": 47,
    "observations_total": 203,
    "kb_total": 18,
    "kb_total_uses": 94,
    "feedback_approved": 12,
    "feedback_rejected": 3,
    "feedback_total": 15,
    "episodes_total": 31,
    "episodes_avg_score": 0.41,
    "last_distillation_at": "2026-03-13T02:00:14.000Z",
    "health": "STABLE"
  },

  "top_tasks": [
    {
      "rank": 1,
      "priority": "EXECUTE NOW",
      "title": "Send outreach to 13 enriched Jake leads",
      "agent": "jake-outreach-agent",
      "agent_slug": "jake-outreach-agent",
      "estimated_cost_usd": 0.03,
      "revenue_impact": "First meeting opportunity — direct pipeline to $5K+ engagement",
      "score": 87,
      "message": "{\"limit\": 13, \"status_filter\": \"enriched\"}"
    },
    {
      "rank": 2,
      "priority": "THIS WEEK",
      "title": "Run HOA discovery on Phoenix geo-target",
      "agent": "hoa-discovery",
      "agent_slug": "hoa-discovery",
      "estimated_cost_usd": 0.0,
      "revenue_impact": "Expand HOA pipeline — 50-150 new communities expected",
      "score": 64,
      "message": "{\"geo_target_id\": \"phoenix-az\"}"
    },
    {
      "rank": 3,
      "priority": "THIS WEEK",
      "title": "Distill brain knowledge base (7-day backlog)",
      "agent": "brain-distillation",
      "agent_slug": "brain-distillation",
      "estimated_cost_usd": 0.0,
      "revenue_impact": "Keep outreach personalization sharp — distillation improves email quality",
      "score": 58,
      "message": "{}"
    }
  ]
}
```

### Field Definitions

#### `meta` Object

| Field | Type | Nullable | Source Query |
|-------|------|----------|-------------|
| `generated_at` | ISO timestamp | No | `new Date().toISOString()` — server time |
| `cost_today_usd` | float | No | `SELECT COALESCE(SUM(cost_usd),0) FROM runs WHERE DATE(created_at)=date('now') AND status='completed'` |
| `cost_this_week_usd` | float | No | Same but `>= date('now','-7 days')` |
| `agents_running` | int | No | `SELECT COUNT(*) FROM agents WHERE status='running'` |
| `agents_total` | int | No | `SELECT COUNT(*) FROM agents` |
| `schedules_active` | int | No | `SELECT COUNT(*) FROM schedules WHERE enabled=1` |
| `agent_success_rate` | float (0-1) | No | `SELECT CAST(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS REAL)/COUNT(*) FROM runs WHERE created_at >= datetime('now','-7 days')` |
| `reply_rate` | float (0-1) | No | `SELECT CAST(replied AS REAL)/NULLIF(sent,0) FROM (SELECT COUNT(*) replied, (SELECT COUNT(*) FROM cfo_outreach_sequences WHERE status='sent') sent FROM cfo_outreach_sequences WHERE status='replied')` |
| `days_since_revenue` | int | Yes | `SELECT CAST((julianday('now') - julianday(converted_at)) AS INT) FROM opportunities WHERE converted_at IS NOT NULL ORDER BY converted_at DESC LIMIT 1` — null if no conversions |

#### `jake` Object

| Field | Type | Nullable | Source |
|-------|------|----------|--------|
| `total` | int | No | `SELECT COUNT(*) FROM cfo_leads` |
| `with_email` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE enrichment_status='enriched'` |
| `email_pct` | float | No | Derived: `with_email / total * 100`, rounded to 2 decimal places |
| `in_outreach` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE status='contacted'` |
| `replied` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE status='replied'` |
| `hot` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE urgency_score > 70` |
| `meetings` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE status='meeting_booked'` |
| `nurture` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE status='nurture'` |
| `unsubscribed` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE status='unsubscribed'` |
| `bounced` | int | No | `SELECT COUNT(*) FROM cfo_leads WHERE status='bounced'` |
| `last_lead_at` | ISO timestamp | Yes | `SELECT MAX(created_at) FROM cfo_leads` |
| `last_lead_hours_ago` | float | Yes | Derived from `last_lead_at` |
| `funnel` | object | No | See funnel sub-object definition below |

**`jake.funnel` sub-object:**

| Field | Value |
|-------|-------|
| `discovered` | Same as `total` |
| `enriched` | Same as `with_email` |
| `outreach` | Same as `in_outreach` |
| `replied` | Same as `replied` |
| `meeting` | Same as `meetings` |

#### `hoa` Object

| Field | Type | Nullable | Source |
|-------|------|----------|--------|
| `total` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue` |
| `hot` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE relevance_score >= 80` |
| `warm` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE relevance_score BETWEEN 60 AND 79` |
| `watch` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE relevance_score BETWEEN 30 AND 59` |
| `cold` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE relevance_score < 30 OR relevance_score IS NULL` |
| `posted` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE status='posted'` |
| `pending_review` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE status='pending_review'` |
| `approved` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE status='approved'` |
| `rejected` | int | No | `SELECT COUNT(*) FROM lg_engagement_queue WHERE status='rejected'` |
| `last_discovery_at` | ISO timestamp | Yes | `SELECT MAX(created_at) FROM lg_engagement_queue` |
| `last_discovery_hours_ago` | float | Yes | Derived from `last_discovery_at` |
| `geo_targets_active` | int | No | Hardcode 19 for Phase 2; add schedule query in Phase 3 |
| `funnel` | object | No | See funnel sub-object |

**`hoa.funnel` sub-object:**

| Field | Value |
|-------|-------|
| `discovered` | Same as `total` |
| `hot_warm` | `hot + warm` |
| `outreach_drafted` | `SELECT COUNT(*) WHERE status IN ('approved','pending_review')` |
| `posted` | Same as `posted` |
| `engaged` | `SELECT COUNT(*) WHERE engagement_likes > 0 OR engagement_replies > 0` |

#### `content` Object

| Field | Type | Nullable | Source |
|-------|------|----------|--------|
| `this_week` | int | No | `SELECT COUNT(*) FROM cfo_content_pieces WHERE created_at >= datetime('now','-7 days')` |
| `published` | int | No | `SELECT COUNT(*) FROM cfo_content_pieces WHERE status='published'` |
| `drafted` | int | No | `SELECT COUNT(*) FROM cfo_content_pieces WHERE status='draft'` |
| `scheduled` | int | No | `SELECT COUNT(*) FROM cfo_content_pieces WHERE status='scheduled'` |
| `social_posts_week` | int | No | `SELECT COUNT(*) FROM cfo_content_pieces WHERE channel IN ('linkedin','facebook','twitter') AND created_at >= datetime('now','-7 days')` |
| `last_published_at` | ISO timestamp | Yes | `SELECT MAX(published_at) FROM cfo_content_pieces WHERE status='published'` |
| `last_published_title` | string | Yes | `SELECT title FROM cfo_content_pieces WHERE status='published' ORDER BY published_at DESC LIMIT 1` |
| `channels_active` | string[] | No | `SELECT DISTINCT channel FROM cfo_content_pieces WHERE created_at >= datetime('now','-7 days')` — returns array |

#### `opportunities` Object

| Field | Type | Nullable | Source |
|-------|------|----------|--------|
| `active` | int | No | `SELECT COUNT(*) FROM opportunities WHERE status='active'` |
| `evaluating` | int | No | `SELECT COUNT(*) FROM opportunities WHERE status='evaluating'` |
| `converted` | int | No | `SELECT COUNT(*) FROM opportunities WHERE status='converted'` |
| `killed` | int | No | `SELECT COUNT(*) FROM opportunities WHERE status='killed'` |
| `top_opportunity` | object | Yes | `SELECT id, name, ice_score, status FROM opportunities WHERE status IN ('active','evaluating') ORDER BY ice_score DESC LIMIT 1` |
| `days_since_new_idea` | int | No | `CAST((julianday('now') - julianday(MAX(created_at))) AS INT) FROM opportunities` |
| `ideas_above_60` | int | No | `SELECT COUNT(*) FROM opportunities WHERE ice_score > 60 AND status IN ('active','evaluating')` |

Note: If the `opportunities` table doesn't exist yet (Phase 1), return hardcoded defaults from the markdown file.

#### `brain` Object

| Field | Type | Nullable | Source |
|-------|------|----------|--------|
| `observations_7d` | int | No | `SELECT COUNT(*) FROM brain_observations WHERE created_at >= datetime('now','-7 days')` — returns 0 if table doesn't exist |
| `observations_total` | int | No | As above, no date filter |
| `kb_total` | int | No | `SELECT COUNT(*) FROM brain_knowledge_base` |
| `kb_total_uses` | int | No | `SELECT COALESCE(SUM(use_count),0) FROM brain_knowledge_base` |
| `feedback_approved` | int | No | `SELECT COUNT(*) FROM brain_feedback WHERE outcome='approved'` |
| `feedback_rejected` | int | No | `SELECT COUNT(*) FROM brain_feedback WHERE outcome='rejected'` |
| `feedback_total` | int | No | `SELECT COUNT(*) FROM brain_feedback` |
| `episodes_total` | int | No | `SELECT COUNT(*) FROM brain_episodes` |
| `episodes_avg_score` | float | Yes | `SELECT AVG(outcome_score) FROM brain_episodes WHERE outcome_score IS NOT NULL` |
| `last_distillation_at` | ISO timestamp | Yes | `SELECT MAX(created_at) FROM brain_knowledge_base` |
| `health` | enum: LEARNING / STABLE / STALE | No | Derived (see logic below) |

**`brain.health` derivation:**
```javascript
function deriveBrainHealth(stats) {
  const avgScore = stats.episodes_avg_score ?? 0;
  const obs7d = stats.observations_7d ?? 0;
  if (avgScore > 0.6 && obs7d > 10) return 'LEARNING';
  if (avgScore < 0.4 || obs7d === 0) return 'STALE';
  return 'STABLE';
}
```

**Brain query safety:** All brain queries should be wrapped in try/catch — tables may not exist if `026_brain_fallback.sql` migration hasn't run. Return zeroed defaults on error:
```javascript
const brainDefaults = { observations_7d: 0, observations_total: 0, kb_total: 0, kb_total_uses: 0, feedback_approved: 0, feedback_rejected: 0, feedback_total: 0, episodes_total: 0, episodes_avg_score: null, last_distillation_at: null, health: 'STALE' };
```

#### `top_tasks` Array

- Populated from the most recent `daily-debrief` run's `result_data` JSON, created today
- If no debrief run today: return empty array `[]`
- Parse logic: `JSON.parse(run.result_data)?.top_tasks` OR an empty array
- Max 3 items, sorted by `rank` ascending
- Each item is nullable — if parsing fails, return `[]` gracefully

```javascript
// Parse top_tasks from today's debrief run
const debriefRun = get(
  `SELECT result_data FROM runs
   JOIN agents ON runs.agent_id = agents.id
   WHERE agents.name = 'daily-debrief'
   AND DATE(runs.created_at) = date('now')
   AND runs.status = 'completed'
   ORDER BY runs.completed_at DESC LIMIT 1`
);
let topTasks = [];
if (debriefRun) {
  try {
    const rd = JSON.parse(debriefRun.result_data || '{}');
    topTasks = rd.top_tasks || [];
  } catch { /* ignore — return [] */ }
}
```

### Implementation Template

```javascript
// server/routes/dashboard.js

const { Router } = require('express');
const { get, all } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

function hoursAgo(isoString) {
  if (!isoString) return null;
  return Math.round((Date.now() - new Date(isoString).getTime()) / 3600000 * 10) / 10;
}

router.get('/summary', async (req, res, next) => {
  try {
    // ── META ──────────────────────────────────────────────────────────────
    const costToday   = get(`SELECT COALESCE(SUM(cost_usd),0) c FROM runs WHERE DATE(created_at)=date('now') AND status='completed'`)?.c || 0;
    const costWeek    = get(`SELECT COALESCE(SUM(cost_usd),0) c FROM runs WHERE created_at >= datetime('now','-7 days') AND status='completed'`)?.c || 0;
    const agentsRunning = get(`SELECT COUNT(*) c FROM agents WHERE status='running'`)?.c || 0;
    const agentsTotal   = get(`SELECT COUNT(*) c FROM agents`)?.c || 0;
    const schedulesActive = get(`SELECT COUNT(*) c FROM schedules WHERE enabled=1`)?.c || 0;

    const recentRuns = get(`SELECT COUNT(*) total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) success FROM runs WHERE created_at >= datetime('now','-7 days')`);
    const agentSuccessRate = recentRuns?.total > 0 ? (recentRuns.success / recentRuns.total) : 1.0;

    const sentCount    = get(`SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='sent'`)?.c || 0;
    const repliedCount = get(`SELECT COUNT(*) c FROM cfo_outreach_sequences WHERE status='replied'`)?.c || 0;
    const replyRate = sentCount > 0 ? repliedCount / sentCount : 0;

    // days_since_revenue: try opportunities table, fallback to null
    let daysSinceRevenue = null;
    try {
      const rev = get(`SELECT converted_at FROM opportunities WHERE converted_at IS NOT NULL ORDER BY converted_at DESC LIMIT 1`);
      if (rev?.converted_at) daysSinceRevenue = Math.floor((Date.now() - new Date(rev.converted_at).getTime()) / 86400000);
    } catch { /* opportunities table may not exist yet */ }

    // ── JAKE ──────────────────────────────────────────────────────────────
    const jakeTotal      = get(`SELECT COUNT(*) c FROM cfo_leads`)?.c || 0;
    const jakeEmail      = get(`SELECT COUNT(*) c FROM cfo_leads WHERE enrichment_status='enriched'`)?.c || 0;
    const jakeOutreach   = get(`SELECT COUNT(*) c FROM cfo_leads WHERE status='contacted'`)?.c || 0;
    const jakeReplied    = get(`SELECT COUNT(*) c FROM cfo_leads WHERE status='replied'`)?.c || 0;
    const jakeHot        = get(`SELECT COUNT(*) c FROM cfo_leads WHERE urgency_score > 70`)?.c || 0;
    const jakeMeetings   = get(`SELECT COUNT(*) c FROM cfo_leads WHERE status='meeting_booked'`)?.c || 0;
    const jakeNurture    = get(`SELECT COUNT(*) c FROM cfo_leads WHERE status='nurture'`)?.c || 0;
    const jakeUnsub      = get(`SELECT COUNT(*) c FROM cfo_leads WHERE status='unsubscribed'`)?.c || 0;
    const jakeBounced    = get(`SELECT COUNT(*) c FROM cfo_leads WHERE status='bounced'`)?.c || 0;
    const jakeLastAt     = get(`SELECT MAX(created_at) t FROM cfo_leads`)?.t || null;

    // ── HOA ───────────────────────────────────────────────────────────────
    const hoaTotal       = get(`SELECT COUNT(*) c FROM lg_engagement_queue`)?.c || 0;
    const hoaHot         = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE relevance_score >= 80`)?.c || 0;
    const hoaWarm        = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE relevance_score BETWEEN 60 AND 79`)?.c || 0;
    const hoaWatch       = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE relevance_score BETWEEN 30 AND 59`)?.c || 0;
    const hoaPosted      = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE status='posted'`)?.c || 0;
    const hoaPending     = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE status='pending_review'`)?.c || 0;
    const hoaApproved    = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE status='approved'`)?.c || 0;
    const hoaRejected    = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE status='rejected'`)?.c || 0;
    const hoaLastAt      = get(`SELECT MAX(created_at) t FROM lg_engagement_queue`)?.t || null;
    const hoaEngaged     = get(`SELECT COUNT(*) c FROM lg_engagement_queue WHERE engagement_likes > 0 OR engagement_replies > 0`)?.c || 0;
    const hoaCold        = Math.max(0, hoaTotal - hoaHot - hoaWarm - hoaWatch);

    // ── CONTENT ───────────────────────────────────────────────────────────
    const contentWeek    = get(`SELECT COUNT(*) c FROM cfo_content_pieces WHERE created_at >= datetime('now','-7 days')`)?.c || 0;
    const contentPub     = get(`SELECT COUNT(*) c FROM cfo_content_pieces WHERE status='published'`)?.c || 0;
    const contentDraft   = get(`SELECT COUNT(*) c FROM cfo_content_pieces WHERE status='draft'`)?.c || 0;
    const contentSched   = get(`SELECT COUNT(*) c FROM cfo_content_pieces WHERE status='scheduled'`)?.c || 0;
    const socialWeek     = get(`SELECT COUNT(*) c FROM cfo_content_pieces WHERE channel IN ('linkedin','facebook','twitter') AND created_at >= datetime('now','-7 days')`)?.c || 0;
    const lastPubRow     = get(`SELECT published_at, title FROM cfo_content_pieces WHERE status='published' ORDER BY published_at DESC LIMIT 1`);
    const channelRows    = all(`SELECT DISTINCT channel FROM cfo_content_pieces WHERE created_at >= datetime('now','-7 days') AND channel IS NOT NULL`);
    const channelsActive = channelRows.map(r => r.channel);

    // ── OPPORTUNITIES ─────────────────────────────────────────────────────
    let opportunitiesData = { active: 0, evaluating: 0, converted: 0, killed: 0, top_opportunity: null, days_since_new_idea: 0, ideas_above_60: 0 };
    try {
      const oppActive   = get(`SELECT COUNT(*) c FROM opportunities WHERE status='active'`)?.c || 0;
      const oppEval     = get(`SELECT COUNT(*) c FROM opportunities WHERE status='evaluating'`)?.c || 0;
      const oppConverted = get(`SELECT COUNT(*) c FROM opportunities WHERE status='converted'`)?.c || 0;
      const oppKilled   = get(`SELECT COUNT(*) c FROM opportunities WHERE status='killed'`)?.c || 0;
      const oppTop      = get(`SELECT id, name, ice_score, status FROM opportunities WHERE status IN ('active','evaluating') ORDER BY ice_score DESC LIMIT 1`);
      const oppLastAt   = get(`SELECT MAX(created_at) t FROM opportunities`)?.t;
      const oppAbove60  = get(`SELECT COUNT(*) c FROM opportunities WHERE ice_score > 60 AND status IN ('active','evaluating')`)?.c || 0;
      const daysSinceIdea = oppLastAt ? Math.floor((Date.now() - new Date(oppLastAt).getTime()) / 86400000) : 0;
      opportunitiesData = { active: oppActive, evaluating: oppEval, converted: oppConverted, killed: oppKilled, top_opportunity: oppTop || null, days_since_new_idea: daysSinceIdea, ideas_above_60: oppAbove60 };
    } catch { /* table not yet created — use defaults */ }

    // ── BRAIN ─────────────────────────────────────────────────────────────
    const brainDefaults = { observations_7d: 0, observations_total: 0, kb_total: 0, kb_total_uses: 0, feedback_approved: 0, feedback_rejected: 0, feedback_total: 0, episodes_total: 0, episodes_avg_score: null, last_distillation_at: null, health: 'STALE' };
    let brainData = { ...brainDefaults };
    try {
      const obs7d      = get(`SELECT COUNT(*) c FROM brain_observations WHERE created_at >= datetime('now','-7 days')`)?.c || 0;
      const obsTotal   = get(`SELECT COUNT(*) c FROM brain_observations`)?.c || 0;
      const kbTotal    = get(`SELECT COUNT(*) c FROM brain_knowledge_base`)?.c || 0;
      const kbUses     = get(`SELECT COALESCE(SUM(use_count),0) c FROM brain_knowledge_base`)?.c || 0;
      const fbApproved = get(`SELECT COUNT(*) c FROM brain_feedback WHERE outcome='approved'`)?.c || 0;
      const fbRejected = get(`SELECT COUNT(*) c FROM brain_feedback WHERE outcome='rejected'`)?.c || 0;
      const fbTotal    = get(`SELECT COUNT(*) c FROM brain_feedback`)?.c || 0;
      const epTotal    = get(`SELECT COUNT(*) c FROM brain_episodes`)?.c || 0;
      const epAvg      = get(`SELECT AVG(outcome_score) s FROM brain_episodes WHERE outcome_score IS NOT NULL`)?.s ?? null;
      const lastDistil = get(`SELECT MAX(created_at) t FROM brain_knowledge_base`)?.t || null;
      const health = (epAvg > 0.6 && obs7d > 10) ? 'LEARNING' : (epAvg < 0.4 || obs7d === 0) ? 'STALE' : 'STABLE';
      brainData = { observations_7d: obs7d, observations_total: obsTotal, kb_total: kbTotal, kb_total_uses: kbUses, feedback_approved: fbApproved, feedback_rejected: fbRejected, feedback_total: fbTotal, episodes_total: epTotal, episodes_avg_score: epAvg, last_distillation_at: lastDistil, health };
    } catch { /* brain tables not yet initialized — return defaults */ }

    // ── TOP TASKS from Todd ───────────────────────────────────────────────
    let topTasks = [];
    try {
      const debriefRun = get(`SELECT result_data FROM runs JOIN agents ON runs.agent_id = agents.id WHERE agents.name = 'daily-debrief' AND DATE(runs.created_at) = date('now') AND runs.status = 'completed' ORDER BY runs.completed_at DESC LIMIT 1`);
      if (debriefRun?.result_data) {
        const rd = JSON.parse(debriefRun.result_data);
        topTasks = Array.isArray(rd.top_tasks) ? rd.top_tasks.slice(0, 3) : [];
      }
    } catch { /* no debrief today or parse error */ }

    // ── BUILD RESPONSE ────────────────────────────────────────────────────
    res.json({
      meta: {
        generated_at: new Date().toISOString(),
        cost_today_usd: Math.round(costToday * 10000) / 10000,
        cost_this_week_usd: Math.round(costWeek * 10000) / 10000,
        agents_running: agentsRunning,
        agents_total: agentsTotal,
        schedules_active: schedulesActive,
        agent_success_rate: Math.round(agentSuccessRate * 1000) / 1000,
        reply_rate: Math.round(replyRate * 10000) / 10000,
        days_since_revenue: daysSinceRevenue,
      },
      jake: {
        total: jakeTotal,
        with_email: jakeEmail,
        email_pct: jakeTotal > 0 ? Math.round(jakeEmail / jakeTotal * 10000) / 100 : 0,
        in_outreach: jakeOutreach,
        replied: jakeReplied,
        hot: jakeHot,
        meetings: jakeMeetings,
        nurture: jakeNurture,
        unsubscribed: jakeUnsub,
        bounced: jakeBounced,
        last_lead_at: jakeLastAt,
        last_lead_hours_ago: hoursAgo(jakeLastAt),
        funnel: { discovered: jakeTotal, enriched: jakeEmail, outreach: jakeOutreach, replied: jakeReplied, meeting: jakeMeetings },
      },
      hoa: {
        total: hoaTotal,
        hot: hoaHot,
        warm: hoaWarm,
        watch: hoaWatch,
        cold: hoaCold,
        posted: hoaPosted,
        pending_review: hoaPending,
        approved: hoaApproved,
        rejected: hoaRejected,
        last_discovery_at: hoaLastAt,
        last_discovery_hours_ago: hoursAgo(hoaLastAt),
        geo_targets_active: 19,
        funnel: { discovered: hoaTotal, hot_warm: hoaHot + hoaWarm, outreach_drafted: hoaApproved + hoaPending, posted: hoaPosted, engaged: hoaEngaged },
      },
      content: {
        this_week: contentWeek,
        published: contentPub,
        drafted: contentDraft,
        scheduled: contentSched,
        social_posts_week: socialWeek,
        last_published_at: lastPubRow?.published_at || null,
        last_published_title: lastPubRow?.title || null,
        channels_active: channelsActive,
      },
      opportunities: opportunitiesData,
      brain: brainData,
      top_tasks: topTasks,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

---

## ENDPOINT 2: `GET /api/opportunities`

### Response

```json
{
  "opportunities": [
    {
      "id": 1,
      "name": "ClawOps as SaaS for small operators",
      "hypothesis": "Small construction operators need a turnkey agent platform but can't build it themselves",
      "impact_score": 8,
      "confidence_score": 6,
      "ease_score": 5,
      "ice_score": 63,
      "status": "evaluating",
      "revenue_potential": "$49-299/month SaaS, 100 customers = $60K ARR",
      "next_action": "Validate demand with 5 conversations from Jake pipeline",
      "owner_agent": "jake-lead-scout",
      "source": "founder",
      "notes": null,
      "converted_at": null,
      "created_at": "2026-03-11T10:00:00.000Z",
      "updated_at": "2026-03-11T10:00:00.000Z"
    }
  ],
  "total": 5
}
```

## ENDPOINT 3: `POST /api/opportunities`

### Request Body

```json
{
  "name": "AI micro-SaaS for construction job cost reporting",
  "hypothesis": "Construction CFOs waste 4 hours/week on job cost reports that could be automated",
  "impact_score": 7,
  "confidence_score": 5,
  "ease_score": 8,
  "status": "evaluating",
  "revenue_potential": "$99/month per company",
  "next_action": "Build MVP in ClawOps, test with first 3 Jake pipeline contacts",
  "owner_agent": null,
  "source": "founder",
  "notes": null
}
```

### Response

```json
{
  "success": true,
  "opportunity": { "id": 6, "ice_score": 67, "...": "all fields" }
}
```

---

## DB MIGRATION: `033_opportunities.sql`

**File location:** `server/db/migrations/033_opportunities.sql`

```sql
-- Migration 033: opportunities table for revenue experiment tracking
-- Referenced by: Mission Control → Revenue Experiments Panel
-- API: GET/POST /api/opportunities

CREATE TABLE IF NOT EXISTS opportunities (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  hypothesis       TEXT NOT NULL,
  impact_score     INTEGER DEFAULT 5 CHECK(impact_score BETWEEN 1 AND 10),
  confidence_score INTEGER DEFAULT 5 CHECK(confidence_score BETWEEN 1 AND 10),
  ease_score       INTEGER DEFAULT 5 CHECK(ease_score BETWEEN 1 AND 10),
  status           TEXT NOT NULL DEFAULT 'evaluating'
                     CHECK(status IN ('evaluating','active','paused','converted','killed')),
  revenue_potential TEXT,
  next_action      TEXT,
  owner_agent      TEXT,
  source           TEXT DEFAULT 'founder'
                     CHECK(source IN ('founder','todd','agent')),
  notes            TEXT,
  converted_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ICE score is computed in application layer (SQLite doesn't support stored generated columns cleanly)
-- Formula: ROUND((impact_score + confidence_score + ease_score) / 3.0 * 10)

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_created ON opportunities(created_at DESC);

-- Seed from systems/opportunity_log.md
INSERT OR IGNORE INTO opportunities (id, name, hypothesis, impact_score, confidence_score, ease_score, status, revenue_potential, next_action, source) VALUES
  (1, 'AI micro-SaaS for construction job cost reporting', 'Construction CFOs waste hours weekly on job cost reports that AI could automate', 8, 5, 7, 'evaluating', 'TBD', 'Validate with Jake pipeline contacts', 'founder'),
  (2, 'HOA capital funding referral network', 'HOA managers need financing introductions and will pay referral fees for warm intros', 7, 6, 6, 'evaluating', 'Referral fees per closed deal', 'Complete HOA pipeline first contact run', 'founder'),
  (3, 'ClawOps as SaaS for small operators', 'Small construction operators need turnkey agent automation without building it themselves', 8, 6, 5, 'evaluating', '$49-299/month, 100 customers = $60K ARR', 'Validate demand with 5 interviews', 'founder'),
  (4, 'Permit data → construction lead signal', 'New permit applications are the earliest signal of a GC actively spending — reach them before competitors', 6, 7, 8, 'active', 'Improves Jake pipeline quality', 'Deploy jake-permit-scanner', 'founder'),
  (5, 'Bid result scraper → Jake pipeline', 'Awarded bids mean active cash flow — GCs with recent awards are ideal ERP buyers', 7, 7, 6, 'active', 'Improves Jake pipeline quality', 'Complete jake-bid-scraper service', 'founder');

SELECT 'Migration 033 complete: opportunities table created with 5 seed rows' AS status;
```

---

## ROUTE FILE STUBS

### `server/routes/dashboard.js`
Full implementation template provided above in the `GET /api/dashboard/summary` section.

### `server/routes/opportunities.js`

```javascript
// server/routes/opportunities.js
// GET /api/opportunities        — list all
// GET /api/opportunities/:id    — single
// POST /api/opportunities       — create new
// PATCH /api/opportunities/:id  — update status, next_action, notes

const { Router } = require('express');
const { all, get, run } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

function computeIce(impact, confidence, ease) {
  return Math.round((impact + confidence + ease) / 3.0 * 10);
}

router.get('/', (req, res, next) => {
  try {
    const opps = all(`SELECT * FROM opportunities ORDER BY
      CASE status WHEN 'active' THEN 0 WHEN 'evaluating' THEN 1 WHEN 'paused' THEN 2 WHEN 'converted' THEN 3 ELSE 4 END,
      (impact_score + confidence_score + ease_score) DESC`);
    const withIce = opps.map(o => ({ ...o, ice_score: computeIce(o.impact_score, o.confidence_score, o.ease_score) }));
    res.json({ opportunities: withIce, total: opps.length });
  } catch (error) { next(error); }
});

router.get('/:id', (req, res, next) => {
  try {
    const opp = get('SELECT * FROM opportunities WHERE id = ?', [req.params.id]);
    if (!opp) return res.status(404).json({ error: 'Not found' });
    res.json({ opportunity: { ...opp, ice_score: computeIce(opp.impact_score, opp.confidence_score, opp.ease_score) } });
  } catch (error) { next(error); }
});

router.post('/', (req, res, next) => {
  try {
    const { name, hypothesis, impact_score = 5, confidence_score = 5, ease_score = 5, status = 'evaluating', revenue_potential, next_action, owner_agent, source = 'founder', notes } = req.body;
    if (!name || !hypothesis) return res.status(400).json({ error: 'name and hypothesis required' });
    const result = run(
      `INSERT INTO opportunities (name, hypothesis, impact_score, confidence_score, ease_score, status, revenue_potential, next_action, owner_agent, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, hypothesis, impact_score, confidence_score, ease_score, status, revenue_potential || null, next_action || null, owner_agent || null, source, notes || null]
    );
    const created = get('SELECT * FROM opportunities WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json({ success: true, opportunity: { ...created, ice_score: computeIce(created.impact_score, created.confidence_score, created.ease_score) } });
  } catch (error) { next(error); }
});

router.patch('/:id', (req, res, next) => {
  try {
    const { status, next_action, notes, impact_score, confidence_score, ease_score, converted_at } = req.body;
    const fields = [];
    const vals   = [];
    if (status !== undefined)           { fields.push('status=?');           vals.push(status); }
    if (next_action !== undefined)      { fields.push('next_action=?');      vals.push(next_action); }
    if (notes !== undefined)            { fields.push('notes=?');            vals.push(notes); }
    if (impact_score !== undefined)     { fields.push('impact_score=?');     vals.push(impact_score); }
    if (confidence_score !== undefined) { fields.push('confidence_score=?'); vals.push(confidence_score); }
    if (ease_score !== undefined)       { fields.push('ease_score=?');       vals.push(ease_score); }
    if (converted_at !== undefined)     { fields.push('converted_at=?');     vals.push(converted_at); }
    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
    fields.push("updated_at=datetime('now')");
    vals.push(req.params.id);
    run(`UPDATE opportunities SET ${fields.join(',')} WHERE id=?`, vals);
    const updated = get('SELECT * FROM opportunities WHERE id = ?', [req.params.id]);
    res.json({ success: true, opportunity: { ...updated, ice_score: computeIce(updated.impact_score, updated.confidence_score, updated.ease_score) } });
  } catch (error) { next(error); }
});

module.exports = router;
```

### Registration in `server/index.js`

```javascript
// Add with other requires (top of file):
const dashboardRoutes    = require('./routes/dashboard');
const opportunitiesRoutes = require('./routes/opportunities');

// Add inside startServer() with other app.use() calls:
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
```

---

## ERROR HANDLING

All endpoints follow the existing pattern — errors passed to `next(error)` for the `errorHandler` middleware. No custom error formats.

For the `summary` endpoint specifically: partial failures in brain queries or opportunities queries should NOT fail the entire response. Use try/catch per section and return defaults. The dashboard must always load, even if some data is unavailable.

---

*End of API Specification*
*Next file: MissionControlPage.jsx.scaffold*
