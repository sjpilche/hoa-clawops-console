# Collective Brain — Cross-Agent Learning System

The Collective Brain is the intelligence layer that makes ClawOps smarter over time. Every agent run feeds into it. Every future run reads from it. Agents don't just execute in isolation — they share what they've learned.

---

## The Four Layers

```
Layer 1: OBSERVATIONS  ← agents write signals during runs
Layer 2: FEEDBACK      ← human approve/reject in UI
Layer 3: EPISODES      ← outcome snapshots when something happens
Layer 4: KNOWLEDGE BASE ← nightly distillation of what works
```

### Layer 1 — Observations (`brain_observations`)

Written by agents during any run. Real-time signals from the field.

**Examples:**
- Jake construction discovery: `"Tampa Bay: 23 GC companies found, 4 with 10+ employees"`
- Contact enricher: `"Mitchell Construction — email found via LinkedIn. Name: John Mitchell."`
- HOA discovery: `"South Florida: 568 HOAs, 162 Google Maps queries, top category: condo"`

**Written by:** `brain.observe(sessionId, agentName, signalType, { subject, content, confidence, metadata })`

**Signal types:** `market_insight`, `lead_signal`, `contact_found`, `content_gap`, `competitor_signal`

---

### Layer 2 — Feedback (`brain_feedback`)

Written when a human approves or rejects an agent output in the UI, or when the reply classifier signals an outcome.

**Examples:**
- User approves outreach draft → `approved` signal for `jake-outreach-agent`
- User rejects a blog post → `rejected` signal for `jake-content-engine`
- Reply classifier: lead replies INTERESTED → `converted` signal
- Reply classifier: lead bounces → `bounced` signal

**Written by:** `brain.recordFeedback(agentName, outputType, outputId, signal, { notes, market, metadata })`

**Signal values:** `approved`, `rejected`, `converted`, `bounced`

---

### Layer 3 — Episodes (`brain_episodes`)

Written when a meaningful outcome occurs. Full context snapshot: what market, what ERP system, what action, what happened, how long it took, outcome score.

**Examples:**
- Lead replied INTERESTED after 7 days → score 0.9
- Meeting booked → score 1.0
- Lead marked NOT_NOW → score 0.3
- Lead bounced → score 0.0

**Written by:** `brain.recordEpisode(agentName, { market, erpContext, contactTitle, actionTaken, outcome, outcomeType, outcomeScore, daysToOutcome, leadId })`

**Outcome scores:**
| Outcome | Score |
|---------|-------|
| Meeting booked | 1.0 |
| INTERESTED reply | 0.9 |
| NEUTRAL reply | 0.5 |
| NOT_NOW reply | 0.3 |
| WRONG_PERSON | 0.2 |
| UNSUBSCRIBE | 0.1 |
| BOUNCED | 0.0 |

---

### Layer 4 — Knowledge Base (`brain_knowledge_base`)

Nightly distillation at 2 AM. Episodes with `outcome_score >= 0.8` and `outcome_type IN ('replied','booked','converted')` are promoted to Layer 4 as structured best-practice entries.

**Example KB entry:**
```
tag: erp=QuickBooks, market=FL, tone=direct
content: "Direct tone with QuickBooks pain framing converts at 73% in FL market.
          Avg time to reply: 6.3 days. Best subject: data-specific, not generic."
uses: 14
```

KB entries are retrieved by outreach agents at run time and prepended as context.

---

## How It Flows End-to-End

```
Monday 6 AM  — jake-construction-discovery runs
               → Layer 1: "Tampa Bay: 23 companies, 4 have 10+ employees"

Monday 8 AM  — jake-contact-enricher runs
               → Layer 1: "ABC Construction — email: jsmith@abcco.com (linkedin)"

Monday 9 AM  — jake-outreach-agent runs (scheduled)
               → scheduleRunner injects brain context from all 4 layers
               → Agent sees: "QB users in FL: direct tone works (73% conversion)"
               → Writes personalized cold email with QB-specific pain framing

User clicks Approve in UI
               → Layer 2: "approved" feedback for jake-outreach-agent

Email sent via SendGrid. 7 days later, lead replies "Interested, let's talk"

jake-reply-classifier runs (on-demand)
               → Layer 2: "converted" feedback for jake-outreach-agent
               → Layer 3: Episode recorded — score 0.9, daysToOutcome=7, erp=QB, market=FL

2 AM nightly — brain.runDistillation()
               → Episode (score 0.9, type=replied) → promoted to Layer 4 KB
               → KB entry created: "QB + FL + direct tone → 0.9 score in 7 days"

Next Monday — next outreach run reads this KB entry automatically
               → Even better emails going forward
```

---

## Storage

**Primary:** Azure SQL (`cfoinsight` database, `brain` schema)
- Tables: `brain.observations`, `brain.feedback`, `brain.episodes`, `brain.knowledge_base`

**Fallback:** SQLite (`data/clawops.db`)
- Tables: `brain_observations`, `brain_feedback`, `brain_episodes`, `brain_knowledge_base`
- Used when Azure SQL is unreachable
- `drainFallback()` syncs SQLite → Azure on next successful connection

**Initialization:** `collectiveBrain.js` calls `ensureSchema()` at server startup (non-fatal if Azure is down).

---

## Schedule

| Time | Action |
|------|--------|
| Every scheduled LLM run | Brain context injected by `scheduleRunner.js` |
| On INTERESTED/UNSUBSCRIBE/BOUNCED reply | Layer 2 + 3 written by `jake_reply_classifier` handler |
| On meeting booked | Layer 3 written by `jake_meeting_booker` handler |
| Daily 2 AM | `brain.runDistillation()` — Layer 3 → Layer 4 |
| Every server start | Brain stats logged to console |

---

## Key File

`server/services/collectiveBrain.js`

Main methods:
- `observe(sessionId, agentName, signalType, data)` — write Layer 1
- `recordFeedback(agentName, outputType, outputId, signal, meta)` — write Layer 2
- `recordEpisode(agentName, episodeData)` — write Layer 3
- `buildAgentContext(agentName)` — read all 4 layers → string for LLM prompt
- `runDistillation()` — nightly Layer 3 → Layer 4 promotion
- `getStats()` — returns counts for all 4 layers
- `drainFallback()` — sync SQLite → Azure

---

## Checking Brain Health

```bash
# Via API
GET /api/brain/stats

# Via console (check server logs on startup)
[Brain] Stats: 142 observations, 67 feedback, 29 episodes, 12 KB entries
```
