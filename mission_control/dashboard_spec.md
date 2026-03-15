# Mission Control Dashboard — Design Specification
*ClawOps Console — Internal Design Document*
*Written: 2026-03-13 | Author: Steve Pilcher + AI*
*Status: SPEC — Not yet built. See IMPLEMENTATION ROADMAP for phases.*

---

## SECTION 1: PURPOSE

### What Mission Control Is

Mission Control is the nerve center of Steve's autonomous business. It is the single screen he opens every morning to understand, in under 30 seconds, whether the machine is working.

It is not a report. It is not a summary page. It is a live control panel — the difference between a CEO reading a memo and a pilot reading instruments.

The existing ClawOps Dashboard at `/` is a chat-centric agent interface. Mission Control is a separate page at `/mission-control` that answers one question: **Is the business moving?**

If the answer is yes, Steve can skip the dashboard entirely and let agents run. If the answer is no, Mission Control shows him exactly where to apply pressure.

### Design Philosophy

**Dark theme** — matches the existing ClawOps aesthetic (`bg-bg-base`, `text-text-primary`). No light mode needed for an ops console.

**Dense but not cluttered** — data-forward layout. Every pixel earns its place. No decorative elements. Numbers, trends, status badges.

**Real-time** — Socket.io is already live in the codebase. The activity feed updates live. Pipeline counts refresh every 30 seconds via polling as a fallback.

**No scrolling on the main view** — everything the founder needs fits above the fold at 1440x900. Design for that viewport first.

**Mobile-aware, desktop-primary** — panels stack on mobile. No functionality is lost; density is reduced.

**One-click actions** — the most common founder actions (run Todd, run Scout, add idea) are in the header. No hunting through the sidebar.

### What It Is Not

- Not a replacement for the agent chat (`/`) — deep agent interaction still lives there
- Not a reporting tool — no date pickers, no CSV exports
- Not a management dashboard for a team — this is a solo-founder instrument
- Not static — mocked data is Phase 1 only; everything must wire to real data by Phase 2

---

## SECTION 2: LAYOUT SPEC

### Grid System

12-column CSS Grid. Gap: `gap-3` (12px). Padding: `p-4`. Full viewport height minus the sidebar nav.

Row definitions (5 rows total):
- Row 1: Header bar — fixed height `h-14`
- Row 2: Four pipeline/stats panels — `h-48` (192px)
- Row 3: Divider label row (optional, can be removed) — `h-4`
- Row 4: Activity feed + right column panels — `flex-1` (fills remaining height)
- The right column stacks Top 3 Today over Memory Pulse vertically

### ASCII Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MISSION CONTROL HEADER                                         h-14         │
│  "Day 22 of building" | Cost today: $0.12 | 8 running | [Run Todd] [Scout]  │
├──────────────┬──────────────┬──────────────┬─────────────────────────────────┤
│  JAKE        │  HOA         │  CONTENT     │  REVENUE EXPERIMENTS            │
│  PIPELINE    │  PIPELINE    │  ENGINE      │  (opportunity tracker)          │
│  cols 1-3    │  cols 4-6    │  cols 7-9    │  cols 10-12                     │
│  h-48        │  h-48        │  h-48        │  h-48                           │
├──────────────┴──────────────┴──────────────┼─────────────────────────────────┤
│  AGENT ACTIVITY FEED                        │  TOP 3 TODAY                   │
│  Live stream of agent runs                  │  (from reverse prompt engine)  │
│  cols 1-7                                   │  cols 8-12                     │
│  flex-1 (fills remaining height)            │  ~40% of right column height   │
│                                             ├─────────────────────────────────┤
│                                             │  MEMORY PULSE                  │
│                                             │  (brain stats + idea count)    │
│                                             │  cols 8-12                     │
│                                             │  ~60% of right column height   │
└─────────────────────────────────────────────┴─────────────────────────────────┘
```

### Grid Class Map (Tailwind)

```
Outer container:    grid grid-cols-12 grid-rows-[auto_auto_1fr] gap-3 h-screen p-4
Header:             col-span-12
Jake Panel:         col-span-3
HOA Panel:          col-span-3
Content Panel:      col-span-3
Opportunities Panel: col-span-3
Activity Feed:      col-span-7 row-span-1
Right Column:       col-span-5 flex flex-col gap-3
  Top 3 Today:      flex-[2]
  Memory Pulse:     flex-[3]
```

---

## SECTION 3: PANEL SPECIFICATIONS

---

### HEADER BAR
**Position:** col-span-12, row 1
**Height:** h-14 (56px)
**Background:** bg-bg-surface border-b border-border-subtle

#### Left Side — Founder Identity
- **"Day X of building"** — computed from hardcoded project start date: `2026-02-20`
  - Formula: `Math.floor((Date.now() - new Date('2026-02-20').getTime()) / 86400000)`
  - Display: `"Day 22 of building"` in `text-text-muted text-sm`
  - Purpose: grounds the founder in the timeline. Every day the number goes up is a day the machine ran.

#### Center — Live Metrics Strip
Three small stat chips, separated by dividers:

| Chip | Data Source | Refresh |
|------|-------------|---------|
| `$0.12 today` | `SUM(cost_usd) FROM runs WHERE DATE(created_at) = date('now')` | 30s |
| `8 agents running` | `COUNT(*) FROM agents WHERE status = 'running'` | real-time via Socket.io |
| `41 schedules active` | `COUNT(*) FROM schedules WHERE enabled = 1` — static on load | on-load |
| Ollama status | `GET /api/openclaw/ollama/status` | 60s |
| Backup status | `GET /api/openclaw/backup/status` → `last_backup_at` | on-load |

Ollama: green dot if available, red dot if not. No text — just the dot + "Ollama" label.
Backup: green if `last_backup_at` < 24h ago, yellow if 24-48h, red if >48h.

#### Right Side — Quick Actions
Three buttons, compact:
- `[Run Todd]` → POST to create run for `daily-debrief` agent (manual trigger)
- `[Run Scout]` → POST to create run for `jake-construction-discovery` agent
- `[+ Idea]` → opens a modal to POST new row to `opportunities` table (see Section 4)

Button style: `btn-sm bg-bg-elevated hover:bg-accent-primary/20 text-text-secondary`

---

### JAKE PIPELINE PANEL
**Position:** cols 1-3, row 2
**Height:** h-48
**Background:** bg-bg-surface rounded-lg border border-border-subtle
**Refresh:** 30s polling + Socket.io `run:completed` trigger
**Data Source:** `GET /api/dashboard/summary` → `jake` object

#### Metrics Shown

| Metric | DB Source | Display |
|--------|-----------|---------|
| Total leads | `COUNT(*) FROM cfo_leads WHERE source_agent IN ('jake','maps')` | Large number |
| With email | `COUNT(*) WHERE enrichment_status = 'enriched'` | Number + `%` of total |
| In outreach | `COUNT(*) WHERE status = 'contacted'` | Number |
| Replied | `COUNT(*) WHERE status = 'replied'` | Number |
| HOT leads | `COUNT(*) WHERE urgency_score > 70` | Number + orange badge |
| Meetings booked | `COUNT(*) WHERE status = 'meeting_booked'` | Number |
| Last lead added | `MAX(created_at) FROM cfo_leads` | "X min ago" / "X hrs ago" |

#### Mini Funnel Visualization
Horizontal bar showing discovery → enriched → outreach → reply → meeting.
Each stage is a segment with its count. Widths are proportional to counts.
Stage colors: `bg-accent-info` (discovery) → `bg-accent-primary` (enriched) → `bg-accent-warning` (outreach) → `bg-accent-success` (reply) → `bg-green-400` (meeting)

Rendered by `<FunnelBar>` component (see Section 8).

#### Panel Header
"Jake Pipeline" in `text-xs font-semibold text-text-muted uppercase tracking-wider`
Status dot: green if a run completed in last 2 hours, yellow if 2-8 hours, red if >8 hours (staleness indicator).

---

### HOA PIPELINE PANEL
**Position:** cols 4-6, row 2
**Height:** h-48
**Background:** bg-bg-surface rounded-lg border border-border-subtle
**Refresh:** 30s polling
**Data Source:** `GET /api/dashboard/summary` → `hoa` object

#### Metrics Shown

| Metric | DB Source | Display |
|--------|-----------|---------|
| Communities discovered | `COUNT(*) FROM lg_engagement_queue` | Large number |
| HOT tier | `COUNT(*) WHERE relevance_score >= 80` | Number + red badge |
| WARM tier | `COUNT(*) WHERE relevance_score BETWEEN 60 AND 79` | Number |
| In outreach | `COUNT(*) WHERE status = 'posted'` | Number |
| Pending review | `COUNT(*) WHERE status = 'pending_review'` | Number + yellow badge if > 10 |
| Last discovery run | `MAX(created_at) FROM lg_engagement_queue` | "X hrs ago" |
| Geo-targets active | Hardcoded 19 (from config) or query schedules for hoa_discovery | Number |

#### Mini Funnel Visualization
discovery → hot_tier → outreach → posted → engaged
Numbers: 568 → HOT count → outreach count → posted count → replies count

---

### CONTENT ENGINE PANEL
**Position:** cols 7-9, row 2
**Height:** h-48
**Background:** bg-bg-surface rounded-lg border border-border-subtle
**Refresh:** 30s polling
**Data Source:** `GET /api/dashboard/summary` → `content` object

#### Metrics Shown

| Metric | DB Source | Display |
|--------|-----------|---------|
| Posts this week | `COUNT(*) FROM cfo_content_pieces WHERE DATE(created_at) >= date('now','-7 days')` | Large number |
| Posts published | `COUNT(*) WHERE status = 'published'` | Number |
| Posts drafted | `COUNT(*) WHERE status = 'draft'` | Number + yellow badge |
| Last published | `MAX(published_at) FROM cfo_content_pieces WHERE status = 'published'` | "X days ago" + title (truncated 30 chars) |
| Channels active | Derived: count distinct `channel` values from last 7 days | Pill badges: Blog / LinkedIn / Facebook / Email |
| Social posts scheduled | `COUNT(*) WHERE status = 'scheduled'` | Number |

#### Channel Badge Display
Small pill badges for each active channel:
- Blog: `bg-blue-500/20 text-blue-400`
- LinkedIn: `bg-blue-700/20 text-blue-300`
- Facebook: `bg-indigo-500/20 text-indigo-400`
- Email: `bg-green-500/20 text-green-400`

---

### REVENUE EXPERIMENTS PANEL
**Position:** cols 10-12, row 2
**Height:** h-48
**Background:** bg-bg-surface rounded-lg border border-border-subtle
**Refresh:** on-load + on `opportunity:created` Socket.io event (future)
**Data Source:** `GET /api/opportunities` (new endpoint — see Section 4)

#### Metrics Shown

| Metric | Source | Display |
|--------|--------|---------|
| Active experiments | `COUNT(*) FROM opportunities WHERE status = 'active'` | Large number |
| Top opportunity | `SELECT name, ice_score FROM opportunities ORDER BY ice_score DESC LIMIT 1` | Name + score badge |
| Days since last new idea | `(now - MAX(created_at)) / 86400` from opportunities | Number + "days" |
| Converted | `COUNT(*) WHERE status = 'converted'` | Number |
| Ideas in queue | `COUNT(*) WHERE status = 'evaluating'` | Number |

#### ICE Score Badge
The top opportunity's ICE score displayed as a colored badge:
- Score >= 70: `bg-green-500/20 text-green-300` + "Execute Now"
- Score 50-69: `bg-yellow-500/20 text-yellow-300` + "This Week"
- Score < 50: `bg-gray-500/20 text-gray-400` + "Backlog"

#### Add Idea Button
Small `+` button in panel header → opens AddOpportunityModal (inline modal, 3 fields: name, one-line hypothesis, estimated ICE score). Connects to `POST /api/opportunities`.

#### DB Table Recommendation
This panel requires an `opportunities` table (see Section 4 for full schema).
The existing `systems/opportunity_log.md` is a flat markdown file — it should be migrated into this table as seed data.

---

### AGENT ACTIVITY FEED
**Position:** cols 1-7, row 3 (fills remaining height)
**Background:** bg-bg-surface rounded-lg border border-border-subtle overflow-hidden
**Refresh:** Real-time via Socket.io `run:completed` + `run:log` + `run:failed`
**Data Source:** `GET /api/runs?limit=25` on load, then Socket.io stream

#### Layout

Header row: "Live Activity" label + "Last 25 runs" count + green pulsing dot (if any agent running)

Scrollable list of run entries. Each entry is one row (h-10 / 40px):

```
[status dot] [agent name]     [task summary, truncated]     [cost]  [time ago]
  ●green      jake-enricher   23/30 enriched — Tampa Bay    $0.00   2m ago
  ●red        jake-scout      Agent timed out after 300s    $0.02   5m ago
  ●blue       hoa-discovery   Running...                    —       now
  ●yellow     daily-debrief   Pending confirmation          —       8m ago
```

#### Status Color Coding

| Status | Dot Color | Row background |
|--------|-----------|----------------|
| completed | `bg-accent-success` | transparent |
| failed | `bg-accent-danger` | `bg-accent-danger/5` |
| running | `bg-accent-info animate-pulse` | `bg-accent-info/5` |
| pending | `bg-accent-warning` | transparent |
| cancelled | `bg-text-muted` | transparent |

#### Interaction
- Click any row → opens run detail in a side panel or modal (reuse existing run detail pattern from MonitorPage)
- Agent name is a hyperlink → navigate to `/agents?id={agent_id}`
- Cost shown in gray if $0.00, orange if > $0.10

#### Real-time Behavior
On `run:log` event: if run is already in list (matched by runId), update its summary text with the log line.
On `run:completed`: move run from "running" to "completed" state, set final cost.
On `run:failed`: move to failed state, show error_msg as the summary.
New runs are prepended to the top. List never exceeds 50 entries (remove from bottom).

---

### TOP 3 TODAY PANEL
**Position:** cols 8-12, row 3 top portion (flex-[2])
**Background:** bg-bg-surface rounded-lg border border-border-subtle
**Refresh:** on-load, refreshes when Todd completes a run
**Data Source:** `GET /api/dashboard/summary` → `top_tasks` array (populated by Todd's daily run)

#### Layout

Header: "Today's Priorities" + "Generated by Todd at {time}" in muted text.

If tasks exist (Todd has run today):
Three task cards, stacked vertically:

```
┌────────────────────────────────────────────────┐
│  #1  EXECUTE NOW          Score: 87        [Run]│
│  Send outreach to 13 enriched Jake leads        │
│  Agent: jake-outreach-agent  |  Est: $0.03      │
│  Revenue impact: First meeting opportunity      │
└────────────────────────────────────────────────┘
```

Each card:
- Priority badge: `#1 EXECUTE NOW` (green) / `#2 THIS WEEK` (yellow) / `#3 BACKLOG` (gray)
- Task title (max 60 chars, truncate with ellipsis)
- Assigned agent name (clickable → agent detail)
- Estimated cost for the run
- Revenue impact (one line — why this matters)
- `[Run Now]` button → creates a pending run for that agent with the suggested message

If no tasks yet (Todd hasn't run today):
```
┌────────────────────────────────────────────────┐
│  No priorities generated yet today.            │
│  [Run Todd Now →]                              │
└────────────────────────────────────────────────┘
```

#### Data Storage
Todd's output (the daily brief) is already stored as a run result in `result_data`. The `top_tasks` field should be a parsed array extracted from that result.

Suggested: add a `daily_tasks` table (see Section 4) OR parse the most recent `daily-debrief` run's `result_data` on load and extract the top 3 tasks from the JSON.

Near-term implementation: parse `result_data` from the most recent `daily-debrief` run created today.

---

### MEMORY PULSE PANEL
**Position:** cols 8-12, row 3 bottom portion (flex-[3])
**Background:** bg-bg-surface rounded-lg border border-border-subtle
**Refresh:** 5 minutes
**Data Source:** `GET /api/brain/stats` (new endpoint) OR direct DB queries via `/api/dashboard/summary`

#### Metrics Shown

| Metric | DB Source | Display |
|--------|-----------|---------|
| Observations this week | `COUNT(*) FROM brain_observations WHERE DATE(created_at) >= date('now','-7 days')` | Number + sparkline (optional) |
| Knowledge base entries | `COUNT(*) FROM brain_knowledge_base` | Number |
| Feedback signals | `COUNT(*) FROM brain_feedback` split by `outcome` | `X approved / Y rejected` |
| Episode avg score | `AVG(outcome_score) FROM brain_episodes` | Percentage + color (green if > 60%) |
| Last distillation | `MAX(created_at) FROM brain_knowledge_base` | "X hours ago" |
| Active ideas | `COUNT(*) FROM opportunities WHERE status IN ('evaluating','active')` | Number |

#### Visual Treatment
Two-column layout within the panel:
- Left column: brain stats (observations, KB entries, episodes)
- Right column: feedback ratio (horizontal bar: green = approved / red = rejected), last distillation badge

#### Brain Health Indicator
Single status badge at top of panel:
- If avg episode score > 0.6 AND observations this week > 10: "LEARNING" (green)
- If avg episode score 0.4-0.6 OR observations low: "STABLE" (yellow)
- If avg episode score < 0.4 OR no observations in 7 days: "STALE" (red)

This tells Steve at a glance whether the brain is accumulating useful signal.

---

## SECTION 4: DATA SOURCES

### Complete Metric-to-Source Mapping

#### Header Bar

| Metric | Source | Endpoint / Query |
|--------|--------|-----------------|
| Day X of building | Computed client-side | `Math.floor((Date.now() - Date('2026-02-20')) / 86400000)` |
| Cost today | DB query | `GET /api/dashboard/summary` → `meta.cost_today_usd` |
| Agents running | DB query | `GET /api/dashboard/summary` → `meta.agents_running` |
| Schedules active | DB query | `GET /api/dashboard/summary` → `meta.schedules_active` |
| Ollama status | API | `GET /api/openclaw/ollama/status` → `{available: bool}` |
| Backup status | API | `GET /api/openclaw/backup/status` → `{last_backup_at: ISO}` |

#### Jake Pipeline Panel

All fields from `GET /api/dashboard/summary` → `jake` object:

| Field | SQL |
|-------|-----|
| `total` | `SELECT COUNT(*) FROM cfo_leads WHERE source_agent IN ('jake','maps') OR source_agent IS NULL` |
| `with_email` | `SELECT COUNT(*) FROM cfo_leads WHERE enrichment_status = 'enriched'` |
| `in_outreach` | `SELECT COUNT(*) FROM cfo_leads WHERE status = 'contacted'` |
| `replied` | `SELECT COUNT(*) FROM cfo_leads WHERE status = 'replied'` |
| `hot` | `SELECT COUNT(*) FROM cfo_leads WHERE urgency_score > 70` |
| `meetings` | `SELECT COUNT(*) FROM cfo_leads WHERE status = 'meeting_booked'` |
| `last_lead_at` | `SELECT MAX(created_at) FROM cfo_leads` |
| `email_pct` | Derived: `with_email / total * 100` |
| `funnel` | Object: `{discovered, enriched, outreach, replied, meeting}` — parallel counts |

#### HOA Pipeline Panel

All fields from `GET /api/dashboard/summary` → `hoa` object:

| Field | SQL |
|-------|-----|
| `total` | `SELECT COUNT(*) FROM lg_engagement_queue` |
| `hot` | `SELECT COUNT(*) FROM lg_engagement_queue WHERE relevance_score >= 80` |
| `warm` | `SELECT COUNT(*) FROM lg_engagement_queue WHERE relevance_score BETWEEN 60 AND 79` |
| `posted` | `SELECT COUNT(*) FROM lg_engagement_queue WHERE status = 'posted'` |
| `pending_review` | `SELECT COUNT(*) FROM lg_engagement_queue WHERE status = 'pending_review'` |
| `last_discovery_at` | `SELECT MAX(created_at) FROM lg_engagement_queue` |
| `geo_targets` | `SELECT COUNT(DISTINCT default_params) FROM agents WHERE name LIKE 'hoa%'` — or hardcode 19 |

#### Content Engine Panel

All fields from `GET /api/dashboard/summary` → `content` object:

| Field | SQL |
|-------|-----|
| `this_week` | `SELECT COUNT(*) FROM cfo_content_pieces WHERE DATE(created_at) >= date('now','-7 days')` |
| `published` | `SELECT COUNT(*) FROM cfo_content_pieces WHERE status = 'published'` |
| `drafted` | `SELECT COUNT(*) FROM cfo_content_pieces WHERE status = 'draft'` |
| `scheduled` | `SELECT COUNT(*) FROM cfo_content_pieces WHERE status = 'scheduled'` |
| `last_published_at` | `SELECT MAX(published_at) FROM cfo_content_pieces WHERE status = 'published'` |
| `last_published_title` | `SELECT title FROM cfo_content_pieces WHERE status = 'published' ORDER BY published_at DESC LIMIT 1` |
| `channels` | `SELECT DISTINCT channel FROM cfo_content_pieces WHERE DATE(created_at) >= date('now','-7 days')` |

#### Revenue Experiments Panel

Source: `GET /api/opportunities` — NEW endpoint.

**Proposed `opportunities` Table Schema:**

```sql
CREATE TABLE IF NOT EXISTS opportunities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,                    -- Short name: "ClawOps as SaaS"
  hypothesis    TEXT NOT NULL,                    -- One sentence: what do we believe?
  impact_score  INTEGER DEFAULT 0,                -- I in ICE (1-10)
  confidence_score INTEGER DEFAULT 0,             -- C in ICE (1-10)
  ease_score    INTEGER DEFAULT 0,                -- E in ICE (1-10)
  ice_score     INTEGER GENERATED ALWAYS AS       -- Computed: avg of I+C+E * 10
                  ((impact_score + confidence_score + ease_score) / 3 * 10) VIRTUAL,
  status        TEXT DEFAULT 'evaluating',        -- 'evaluating', 'active', 'paused', 'converted', 'killed'
  revenue_potential TEXT,                         -- "$5K-$50K per engagement" — free text
  next_action   TEXT,                             -- What to do next
  owner_agent   TEXT,                             -- Which agent owns validation
  source        TEXT DEFAULT 'founder',           -- 'founder', 'todd', 'agent'
  notes         TEXT,                             -- Longer context
  converted_at  TEXT,                             -- When it became real revenue
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Seed Data from `systems/opportunity_log.md`:**
The existing markdown file tracks 5 experiments in a table. These should be manually migrated as seed rows when the table is created. Add migration `033_opportunities.sql`.

#### Brain / Memory Pulse Panel

Source: `GET /api/brain/stats` — new endpoint (or included in `/api/dashboard/summary` → `brain` object).

| Field | SQL |
|-------|-----|
| `observations_7d` | `SELECT COUNT(*) FROM brain_observations WHERE DATE(created_at) >= date('now','-7 days')` |
| `observations_total` | `SELECT COUNT(*) FROM brain_observations` |
| `kb_total` | `SELECT COUNT(*) FROM brain_knowledge_base` |
| `feedback_approved` | `SELECT COUNT(*) FROM brain_feedback WHERE outcome = 'approved'` |
| `feedback_rejected` | `SELECT COUNT(*) FROM brain_feedback WHERE outcome = 'rejected'` |
| `episodes_total` | `SELECT COUNT(*) FROM brain_episodes` |
| `episodes_avg_score` | `SELECT AVG(outcome_score) FROM brain_episodes WHERE outcome_score IS NOT NULL` |
| `last_distillation_at` | `SELECT MAX(created_at) FROM brain_knowledge_base` |

Note: brain tables may be `brain_observations`, `brain_feedback`, `brain_episodes`, `brain_knowledge_base` — verify against the actual migration `026_brain_fallback.sql` before wiring.

### Existing Endpoints to Reuse

| Endpoint | Used By | Notes |
|----------|---------|-------|
| `GET /api/runs?limit=25` | Activity Feed | Initial load |
| `GET /api/openclaw/backup/status` | Header | On-load only |
| `GET /api/openclaw/ollama/status` | Header | 60s polling |
| `GET /api/settings` | Potential — cost thresholds | On-load |
| `GET /api/agents` | Header agent count | Could use summary instead |

### New Endpoints Required

#### `GET /api/dashboard/summary`
Single endpoint that aggregates all pipeline metrics in one round-trip. Returns all panel data in one JSON object. Should complete in < 50ms (pure SQLite reads).

See `dashboard_api_spec.md` for full contract.

#### `GET /api/opportunities` + `POST /api/opportunities`
CRUD for revenue experiments panel. New route file: `server/routes/opportunities.js`.
Register in `server/index.js`:
```javascript
const opportunitiesRoutes = require('./routes/opportunities');
app.use('/api/opportunities', opportunitiesRoutes);
```

#### `GET /api/brain/stats`
Aggregated brain health metrics. Could be added to the existing brain route or included in `/api/dashboard/summary`.

---

## SECTION 5: REAL-TIME EVENTS

The dashboard subscribes to these Socket.io events on mount and unsubscribes on unmount.

### Events to Subscribe

| Event | Handler | Dashboard Effect |
|-------|---------|-----------------|
| `run:completed` | `handleRunCompleted(data)` | 1. Update activity feed entry status to completed. 2. Increment panel counters if agent is Jake/HOA/Content agent. 3. Update `agents running` count in header. |
| `run:log` | `handleRunLog(data)` | Update activity feed entry's summary text with latest log line (for running agents). |
| `run:failed` | `handleRunFailed(data)` | Mark activity feed entry as failed (red). Increment failure counter. Show toast notification. |
| `agent:status` | `handleAgentStatus(data)` | Update header "X agents running" count. |

### Suggested New Events (not yet emitted — add to server)

| Event | Emit When | Payload |
|-------|-----------|---------|
| `pipeline:update` | A lead changes status in cfo_leads | `{ product: 'jake'|'hoa', stage: string, count: number }` |
| `opportunity:created` | New row in opportunities table | `{ id, name, ice_score }` |
| `brain:distillation_complete` | brain_distillation handler completes | `{ inserted: number, kb_total: number }` |

### Connection Management

```javascript
// On page mount
const socket = io(API_BASE_URL);
socket.on('connect', () => console.log('[MissionControl] Socket connected'));
socket.on('disconnect', () => console.log('[MissionControl] Socket disconnected'));

// On page unmount
return () => socket.disconnect();
```

The socket should display a red "Disconnected" indicator in the header if the connection drops.

---

## SECTION 6: METRICS THAT MATTER (The 10 KPIs)

These are Steve's success indicators. Each one is tracked in the header or a panel. Green = on track. Yellow = needs attention. Red = action required today.

| # | KPI | Source Field | Target | Green | Yellow | Red |
|---|-----|-------------|--------|-------|--------|-----|
| 1 | Email rate (email / total leads) | `jake.email_pct` | > 25% | > 25% | 15-25% | < 15% |
| 2 | Outreach coverage (outreach / email leads) | derived | > 80% | > 80% | 50-80% | < 50% |
| 3 | Reply rate (replies / sent) | `meta.reply_rate` | > 5% | > 5% | 2-5% | < 2% |
| 4 | Meeting rate (meetings / replies) | derived | > 30% | > 30% | 15-30% | < 15% |
| 5 | Days since last new lead | derived from `jake.last_lead_at` | < 2 days | < 2 | 2-4 | > 4 |
| 6 | Daily LLM cost | `meta.cost_today_usd` | < $1.00 | < $1.00 | $1-3 | > $3 |
| 7 | Agent success rate (last 50 runs) | `meta.agent_success_rate` | > 90% | > 90% | 75-90% | < 75% |
| 8 | Content pieces this week | `content.this_week` | >= 3 | >= 3 | 1-2 | 0 |
| 9 | Active experiments scored > 60 | `opportunities.active_high_score` | >= 3 | >= 3 | 1-2 | 0 |
| 10 | Days since last revenue event | `meta.days_since_revenue` | < 7 days | < 7 | 7-30 | > 30 |

**KPI #10 is the most important number.** It drives existential urgency. Even when everything else is green, a red KPI #10 means the machine is running but not closing. Track it. Display it prominently.

Display: A compact KPI strip between the header and the main panels. Each KPI is a small `<KPIBadge>` component (number + label + color).

### `<KPIBadge>` Component Behavior
```
current value | label | color threshold
   24%         email rate   green
   47 days     last revenue  RED  ← this needs a visual alarm
```

If KPI #10 (days since revenue) exceeds 30, show a pulsing red border on the header bar. Not disruptive — just visible.

---

## SECTION 7: IMPLEMENTATION ROADMAP

### Phase 1 — Static Layout (Today, ~2 hours)
**Goal:** The page exists, loads, and shows the correct layout with mocked data.

Tasks:
- [ ] Create `src/pages/MissionControlPage.jsx` from the scaffold file
- [ ] Add nav entry to `src/lib/constants.js`: `{ path: '/mission-control', label: 'Mission Control', icon: 'Crosshair' }`
- [ ] Add route to `src/App.jsx` or the router config
- [ ] Create stub components in `src/components/mission-control/`:
  - `MissionHeader.jsx` — mocked data
  - `PipelinePanel.jsx` — mocked Jake data
  - `ActivityFeed.jsx` — mocked 5 run entries
  - `FunnelBar.jsx` — hardcoded funnel numbers
  - `KPIBadge.jsx` — hardcoded values
- [ ] Verify layout renders at 1440px without overflow
- [ ] Verify panels stack correctly on mobile (< 768px)

Mocked data to use in Phase 1:
```javascript
const MOCK_DATA = {
  meta: { day: 22, cost_today_usd: 0.12, agents_running: 2, schedules_active: 41 },
  jake: { total: 54, with_email: 13, in_outreach: 4, replied: 0, hot: 3, meetings: 0 },
  hoa: { total: 568, hot: 12, warm: 47, posted: 8, pending_review: 23 },
  content: { this_week: 4, published: 2, drafted: 2, scheduled: 1 },
  opportunities: { active: 5, top_name: 'ClawOps as SaaS', top_score: 63, converted: 0 },
};
```

### Phase 2 — Real API Data (This Week, ~4 hours)
**Goal:** All panels show live data. Activity feed is real-time.

Tasks:
- [ ] Build `GET /api/dashboard/summary` endpoint (new route file `server/routes/dashboard.js`)
- [ ] Register route in `server/index.js`
- [ ] Build `GET /api/opportunities` + `POST /api/opportunities` endpoints
- [ ] Create `server/db/migrations/033_opportunities.sql` with table + seed from `systems/opportunity_log.md`
- [ ] Wire `useDashboardData()` hook to real API calls
- [ ] Wire Activity Feed to `GET /api/runs?limit=25` on load
- [ ] Wire Socket.io events: `run:completed`, `run:log`, `run:failed`
- [ ] Test all panels with live data

### Phase 3 — Real-time + Brain Wiring (Next Week, ~3 hours)
**Goal:** Everything updates live. Brain panel is real. KPI strip is live.

Tasks:
- [ ] Add `brain` section to `/api/dashboard/summary` (query brain tables)
- [ ] Wire Memory Pulse panel to real brain stats
- [ ] Add KPI strip between header and main panels
- [ ] Implement `<KPIBadge>` with threshold coloring
- [ ] Add `pipeline:update` Socket.io event to `server/routes/runs.js` SPECIAL_HANDLERS
- [ ] Add revenue event tracking field to opportunities table (migration 033b)
- [ ] Test KPI #10 (days since revenue) tracking

### Phase 4 — Todd Integration + Full Autonomy (Later, ~2 hours)
**Goal:** Top 3 Today panel populated by Todd automatically. Mission Control is self-maintaining.

Tasks:
- [ ] Parse Top 3 from Todd's `daily-debrief` run result_data (or add structured `top_tasks` JSON to Todd's output)
- [ ] Wire Top 3 panel to latest `daily-debrief` run from today
- [ ] Add `[Run Now]` button functionality in Top 3 panel (POST to create pending run)
- [ ] Add `brain:distillation_complete` Socket.io event
- [ ] Add pulsing red alarm on KPI #10 when > 30 days
- [ ] Add `[+ Idea]` modal wired to `POST /api/opportunities`

---

## SECTION 8: COMPONENT MAP

All new components live in `src/components/mission-control/`. The page itself is `src/pages/MissionControlPage.jsx`.

### Page Component

**`src/pages/MissionControlPage.jsx`**
- Root page component
- Owns `useDashboardData()` hook
- Owns Socket.io connection
- Passes data down to panels via props
- See `MissionControlPage.jsx.scaffold` for full skeleton

### Panel Components

**`src/components/mission-control/MissionHeader.jsx`**
- Props: `{ dayNumber, costToday, agentsRunning, schedulesActive, ollamaAvailable, lastBackupAt }`
- Renders header bar with metric chips and quick action buttons
- Quick action buttons emit POST requests directly (no confirmation gate for Run Scout — it creates a pending run that still needs confirmation in the normal flow)

**`src/components/mission-control/PipelinePanel.jsx`**
- Props: `{ title, data, color, lastRunAt, funnelStages }`
- Reusable for both Jake and HOA pipeline panels
- `funnelStages`: array of `{ label, count, color }` objects
- Contains `<FunnelBar>` internally

**`src/components/mission-control/ContentPanel.jsx`**
- Props: `{ data }` where data matches `content` object from summary
- Renders channel badges, post counts, last published info
- Not reusing PipelinePanel — content metrics are different enough

**`src/components/mission-control/OpportunityPanel.jsx`**
- Props: `{ data }` where data matches `opportunities` object from summary
- Contains the "Add Idea" button with modal
- ICE score badge rendering

**`src/components/mission-control/ActivityFeed.jsx`**
- Props: `{ initialRuns }` — hydrated from API on load
- Manages its own internal `runs` state (Socket.io updates)
- Each run entry: `<RunEntry runId, agentName, summary, status, costUsd, createdAt />`
- Click handler navigates to run detail

**`src/components/mission-control/TopThreePanel.jsx`**
- Props: `{ tasks, generatedAt }` — from Todd's latest run
- Renders 3 task cards with priority badges and `[Run Now]` buttons
- Empty state when no tasks for today

**`src/components/mission-control/MemoryPulse.jsx`**
- Props: `{ brainStats }` — from `/api/dashboard/summary` → `brain` field
- Renders brain health indicator badge
- Two-column internal layout (brain stats / feedback ratio)

### Utility Components

**`src/components/mission-control/FunnelBar.jsx`**
- Props: `{ stages: Array<{ label, count, color }> }`
- Horizontal proportional bar — each stage width = `count / total * 100%`
- Hover tooltip shows stage name + count
- Minimum segment width: 4px (so even 0-count stages are visible as a sliver)
- Used inside PipelinePanel for both Jake and HOA

**`src/components/mission-control/KPIBadge.jsx`**
- Props: `{ label, value, unit, target, greenAbove, yellowAbove, higherIsBetter }`
- Returns colored chip: green / yellow / red based on thresholds
- `higherIsBetter: false` inverts the threshold logic (for "days since X" metrics)
- Used in KPI strip below the header

### Hook

**`src/hooks/useDashboardData.js`** (or `useDashboardData.jsx`)
- Encapsulates all API calls for the Mission Control page
- Returns `{ data, loading, error, refresh }`
- Polls every 30 seconds
- Exposes `refresh()` for manual trigger (used by quick action buttons after Run commands)
- See scaffold for full stub

---

*End of Mission Control Dashboard Specification*
*Next file: dashboard_api_spec.md*
