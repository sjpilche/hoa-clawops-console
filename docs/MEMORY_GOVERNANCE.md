# Memory & Logging Governance Model
**Date:** 2026-03-14
**Scope:** All memory layers (0-4), all logging surfaces, all 48 active agents
**Principle:** Preserve what works. Compact what's noisy. Gate what gets injected.

---

## 1. Current Memory Patterns

The system has a **5-layer memory architecture** — well-designed, well-documented, but unevenly implemented.

### What Exists

| Layer | Storage | Write Mechanism | Read Mechanism | Status |
|-------|---------|-----------------|----------------|--------|
| **0: File Memory** | `/memory/` directory tree | Manual by agents during runs | Loaded into context by SOUL instructions | TEMPLATED but EMPTY — zero daily logs, zero learnings, zero ideas created yet |
| **1: Observations** | `brain_observations` (SQLite fallback → Azure) | `brain.observe()` in 12+ handlers | `getObservationsPromptBlock()` in `buildAgentContext()` | LIVE — 32 call sites across 8 files |
| **2: Feedback** | `brain_feedback` (SQLite → Azure) | `brain.recordFeedback()` in reply-classifier | `getFeedbackPromptBlock()` in `buildAgentContext()` | LIVE — fires on every reply classification |
| **3: Episodes** | `brain_episodes` (SQLite → Azure) | `brain.recordEpisode()` in reply-classifier + meeting-booker | `getEpisodesPromptBlock()` in `buildAgentContext()` | LIVE — fires on reply outcomes + meeting bookings |
| **4: Knowledge Base** | `brain_kb` (Azure) | `brain.runDistillation()` nightly at 2AM | `getKnowledgePromptBlock()` in `buildAgentContext()` | LIVE — distills high-score episodes to KB |
| **Audit Log** | `audit_log` (SQLite) | 15+ call sites after hardening | Read via `/api/audit` route | LIVE — output validation, enricher quality, lead scout quality, pipeline dispatch, discovery, contact finder, SOUL modification |
| **Chroma** | ChromaDB (optional) | `chromaBrain.js` for semantic search | `brainCouncilSummary()` nightly at 2:30AM | OPTIONAL — vector store for semantic KB retrieval |

### What's Actually Generating Data

| Source | Volume | Quality |
|--------|--------|---------|
| `brain.observe()` — lead_signal, market_insight, contact_found, outreach_drafted, content_drafted, pipeline_dispatched, follow_up_queued, meeting_booked, lead_quality_alert, lead_rejected | HIGH — fires on every pipeline run | GOOD — structured, confidence-scored, metadata-tagged |
| `brain.recordFeedback()` — reply classifications | MEDIUM — fires on each reply | GOOD — maps directly to outreach outcomes |
| `brain.recordEpisode()` — reply + meeting outcomes | LOW (pipeline hasn't sent outreach yet) | GOOD when it fires — outcome-scored 0.0-1.0 |
| `audit_log` — output_validation, enricher_quality, lead_scout_quality, pipeline_dispatch, discovery_quality, contact_finder_quality, soul_modified | HIGH — fires on every run | GOOD — structured JSON in details column |
| Layer 0 file memory | **ZERO** — all templates exist but no agent has written a single daily log, learning, or idea | N/A |

---

## 2. Memory Anti-Patterns

### Anti-Pattern 1: Layer 0 Is Designed but Unused
The file-based memory system (`/memory/`) has 13 template files, 3 project memory files, a compression guide, a scoring rubric, and detailed agent instructions. **Zero actual runtime data has been written.** No daily logs, no agent learnings, no business idea files. The templates are excellent but the write triggers in agent handlers never fire because:
- Special handlers write to `brain.observe()` (Layer 1), not to files
- LLM agents run via OpenClaw bridge which doesn't have file-write permission (tool policy denies `write`)
- The `AGENT_MEMORY_INSTRUCTIONS.md` assumes agents can write files — they can't

**Risk:** Layer 0 becomes shelfware. The project memory files (`jake_pipeline.md`, `hoa_pipeline.md`, `data_rehab.md`) will go stale because no automated process updates them.

### Anti-Pattern 2: Brain Context Injection Has No Size Cap
`buildAgentContext()` assembles 4 blocks (observations, feedback, episodes, KB) and injects them into every LLM prompt. There is no token budget enforcement — if the brain accumulates thousands of observations, the context block grows unbounded. The MEMORY_ARCHITECTURE.md says "max 2000 tokens for memory context" but this limit is not enforced in code.

**Risk:** As the pipeline generates more data, Brain context will consume an increasing share of the LLM's context window, degrading output quality and increasing cost.

### Anti-Pattern 3: Observations Never Expire
`brain.observe()` writes to `brain_observations` with no TTL. Old observations from 6 months ago will be returned alongside today's data if they match the session/type filter. There's no staleness check.

**Risk:** Stale observations pollute context. A "market_insight" from February about Tampa has no relevance to a March Denver run.

### Anti-Pattern 4: Audit Log Grows Unbounded
The hardening work added 15+ audit_log write sites. Every run now generates 1-3 audit entries. At 20 runs/day, that's 60+ rows/day, 1,800/month. The `data_retention_days` setting (90 days) exists but no purge job runs against `audit_log`.

**Risk:** `audit_log` table grows indefinitely. SQLite performance degrades on large tables without VACUUM.

### Anti-Pattern 5: No Feedback Loop from Layer 4 KB Back to Layer 0
Brain KB entries are distilled from high-score episodes and stored in Azure. But project memory files (`jake_pipeline.md`) are never updated with KB insights. The two memory systems operate in parallel with no cross-pollination.

### Anti-Pattern 6: Discord Notifications Are Memory-Adjacent but Unstructured
25+ handlers post to Discord via webhook. These messages contain operational data (lead counts, hit rates, QA scores) that's valuable but not captured in any queryable format. Discord is a write-only notification channel — useful for Steve's awareness but not for agent learning.

---

## 3. Recommended Portfolio Memory Standard

### What Belongs Where

| Data Type | Permanent Memory (Layer 4 KB) | Working Memory (Layer 1-3) | File Memory (Layer 0) | Audit Log | Nowhere |
|-----------|:---:|:---:|:---:|:---:|:---:|
| "Tampa construction companies use QB more than Vista" | YES | Source | — | — | — |
| "Lead #42 replied INTERESTED on day 5" | Distilled | YES (episode) | — | — | — |
| "Enricher hit rate was 24% today" | — | YES (observation) | — | YES | — |
| "We decided to save partial leads on 2026-02-25" | — | — | YES (project_memory) | — | — |
| "Data Rehab offer is undefined — Steve needs to decide" | — | — | YES (project_memory) | — | — |
| "Agent run #abc123 completed in 4.2s" | — | — | — | YES | — |
| "ParseMessageParams failed on malformed input" | — | — | — | — | Console log only |
| "Routine run with zero output" | — | — | — | — | Discard |
| QA score for specific outreach draft | — | Stored on row | — | — | — |
| Self-evaluation scorecard from LLM | — | Stored in qa_notes | — | — | — |

### Context Injection Rules

| What | Inject Into LLM Prompt? | How |
|------|:---:|-----|
| Brain Layer 1 observations (same session) | YES | `getObservationsPromptBlock()` — max 10 entries |
| Brain Layer 2 feedback (last 6 for this agent) | YES | `getFeedbackPromptBlock()` — max 6 entries |
| Brain Layer 3 episodes (same market/ERP, top 3) | YES | `getEpisodesPromptBlock()` — max 3 entries |
| Brain Layer 4 KB (matching content type) | YES | `getKnowledgePromptBlock()` — max 5 entries |
| Audit log entries | NEVER | Internal metrics only — no agent needs to see its own quality scores |
| File memory (project state) | SELECTIVE | Only when explicitly relevant to the task type (outreach → jake_pipeline.md) |
| Stale observations (>14 days) | NEVER | Expire from context injection; keep in DB for trending |
| Full daily logs | NEVER | Too verbose — use compressed weekly summaries |
| Business idea scoring rubric | ONLY for opportunity evaluation tasks | 12.8KB file is too large for routine context |

---

## 4. What to Preserve (Do Not Touch)

| Component | Why |
|-----------|-----|
| Brain Layer 1-4 architecture | Well-designed, live, producing value. The observe → feedback → episode → KB pipeline is the system's institutional memory. |
| `buildAgentContext()` 4-block assembly | Correct pattern — assembles context from all layers. Just needs size enforcement. |
| MEMORY_ARCHITECTURE.md specification | Excellent design doc. The 5-layer model, priority rules, and compression timeline are sound. |
| COMPRESSION_GUIDE.md | The keep/discard rules and compression templates are well-thought-out. |
| SCORING_RUBRIC.md (ICE/RPS/ALS) | 12.8KB but high-value. Used for opportunity evaluation. Don't compact. |
| Project memory files (3 active) | `jake_pipeline.md`, `hoa_pipeline.md`, `data_rehab.md` are the strategic narrative layer. Keep them current. |
| Audit log write pattern | The 15+ audit sites we added are the observability backbone. Don't reduce write frequency. |

---

## 5. What to Compact

| What | Current Size | Problem | Compact To |
|------|-------------|---------|-----------|
| Brain observations (Layer 1) | Unbounded growth | No TTL, no expiry | Add 14-day TTL for context injection; keep in DB forever for trending |
| `buildAgentContext()` output | No size cap | Can exceed 2000-token budget | Enforce max 2000 tokens (truncate oldest entries first) |
| Audit log | ~60 rows/day, unbounded | No purge job | Add 90-day retention purge to brain-distillation nightly job |
| Brain feedback (Layer 2) | 6 most recent per agent | Currently fine | Keep as-is — 6 is a good window |
| Brain episodes (Layer 3) | 3 per query | Currently fine | Keep as-is |
| Brain KB (Layer 4) | Growing via distillation | No quality review | Add monthly review flag (ask Steve to approve/archive KB entries) |

---

## 6. What to Archive

| What | When | Archive To |
|------|------|-----------|
| Brain observations older than 90 days | Monthly (add to distillation job) | Delete from active table after distillation considers them |
| Audit log entries older than 90 days | Monthly | Keep summary counts, delete individual rows |
| Daily log files older than 7 days | Weekly (when compression runs) | `memory/daily_logs/_archive/` |
| Weekly summaries older than 28 days | Monthly | `memory/daily_logs/_archive/` |
| Project memory for killed projects | On project kill | `memory/project_memory/_archive/` |
| Business ideas with ICE < 30 after 60 days | Quarterly | `memory/business_ideas/_archive/` |

---

## 7. Lowest-Risk Implementation Sequence

### Step 1: Enforce Brain context token budget (LOW RISK)
**File:** `server/services/collectiveBrain.js`
**Change:** In `buildAgentContext()`, after assembling all 4 blocks, enforce a hard token cap. Truncate oldest entries first if over budget.

### Step 2: Add observation TTL for context injection (LOW RISK)
**File:** `server/services/collectiveBrain.js`
**Change:** In `getObservationsPromptBlock()`, add `WHERE created_at > datetime('now', '-14 days')` to the query so stale observations don't pollute LLM context. Keep all observations in DB for trending — just don't inject old ones.

### Step 3: Add audit log purge to nightly distillation (LOW RISK)
**File:** `server/routes/runs.js` (brain_distillation handler)
**Change:** After distillation completes, run `DELETE FROM audit_log WHERE timestamp < datetime('now', '-90 days')`. Log count deleted.

### Step 4: Add observation purge for old Layer 1 data (LOW RISK)
**File:** `server/routes/runs.js` (brain_distillation handler)
**Change:** After audit purge, delete observations older than 90 days from SQLite fallback tables. Azure retention handled separately.

### Step 5: Auto-update project memory files from pipeline stats (MEDIUM RISK)
**File:** `server/routes/runs.js` (morning_digest or pipeline_director handler)
**Change:** After computing daily stats, update the "Current Pipeline State" section of `jake_pipeline.md` and `hoa_pipeline.md` with fresh numbers. This bridges the Layer 0 ↔ Layer 1-4 gap.

### Step 6: Add daily log auto-creation (MEDIUM RISK)
**File:** `server/services/scheduleRunner.js` or new service
**Change:** On first run of each day, create `memory/daily_logs/YYYY-MM-DD.md` from the template. Append entries as handlers fire throughout the day. This activates the currently-empty Layer 0.

### Step 7: Add weekly compression job (MEDIUM RISK)
**File:** New handler `weekly_compression` in runs.js
**Change:** Every Sunday at 3AM, compress the past 7 daily logs into `memory/daily_logs/weekly/YYYY-WNN.md` using the compression guide rules. Archive originals to `_archive/`.
