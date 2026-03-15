# Memory Architecture — ClawOps Console
*Master spec for the 5-layer memory system. Agent-readable. Last updated: 2026-03-13.*

---

## Overview

ClawOps runs a 5-layer memory system. Layers 1-4 are database-backed (Collective Brain, already live). Layer 0 is this file-based `/memory/` directory — it stores what the DB cannot: strategy, narrative, project context, and business opportunities too large or too unstructured for tabular storage.

**The rule:** If it fits in a row, it goes in the DB. If it requires reading to understand, it goes in `/memory/`.

Both layers are always in play. Agents should treat them as complementary, not competing.

---

## The 5-Layer Model

| Layer | Name | Storage | What Lives Here | Implemented |
|-------|------|---------|-----------------|-------------|
| 0 | File Memory | `/memory/` directory | Strategy, project state, learnings, ideas, daily logs | This system |
| 1 | Observations | `brain_observations` table | Real-time signals per agent run | LIVE |
| 2 | Feedback | `brain_feedback` table | Approved/rejected outputs from Steve | LIVE |
| 3 | Episodes | `brain_episodes` table | Full outcome-scored run records | LIVE |
| 4 | Knowledge Base | `brain_kb` table | Distilled high-score learnings | LIVE |

Layer 0 is written by agents and by Todd. Layers 1-4 are written programmatically by the Collective Brain service (`server/services/collectiveBrain.js`). Every layer can be read by any agent. Layer 0 is the only layer that supports free-form narrative.

---

## Memory Type Definitions

| Type | What It Stores | TTL | Primary Writer | Primary Reader | Location |
|------|---------------|-----|----------------|----------------|----------|
| Short-term task | Current run context, in-progress state, what happened today | 7 days raw, then weekly summary | Any agent | Same agent, Todd | `memory/daily_logs/` |
| Long-term knowledge | Proven tactics, market intel, what messaging converts, what fails | Forever (compressed monthly) | Ralph (brain-distillation), any agent post-learning | All agents | `memory/agent_learnings/` + Layer 4 KB |
| Project memory | Pipeline state, lead counts, decisions made, current blockers | Per-project lifetime (compressed when inactive 30 days) | Todd, pipeline agents | All agents | `memory/project_memory/` |
| Idea memory | Opportunities, hypotheses, early-stage experiments | 90 days unscored, then CONVERT or KILL | Scout agents, Reverse Prompt Engine, any agent | Todd, Steve | `memory/business_ideas/` |
| Business opportunity | Scored, validated opportunities with ICE + RPS + ALS | Until CONVERTED or KILLED | Reverse Prompt Engine, Todd | Todd, Steve | `memory/business_ideas/` + `opportunity_log.md` |

### Layer 0 Subdirectory Map

```
memory/
  MEMORY_ARCHITECTURE.md          ← this file (load for system changes)
  AGENT_MEMORY_INSTRUCTIONS.md    ← how agents read/write/compress (load before any memory op)
  daily_logs/
    LOG_TEMPLATE.md               ← fill-in-the-blank for each day's log
    COMPRESSION_GUIDE.md          ← when and how to compress logs
    YYYY-MM-DD.md                 ← daily log files (created by agents each day)
  project_memory/
    PROJECT_TEMPLATE.md           ← fill-in-the-blank for any project
    jake_pipeline.md              ← Jake construction GC pipeline
    hoa_pipeline.md               ← HOA project funding pipeline
    data_rehab.md                 ← Data Rehab opportunity
  business_ideas/
    IDEA_TEMPLATE.md              ← fill-in-the-blank for new ideas
    SCORING_RUBRIC.md             ← ICE/RPS/ALS scoring guide with examples
    opportunity_log.md            ← master list of all scored opportunities
  agent_learnings/
    LEARNING_TEMPLATE.md          ← fill-in-the-blank for post-run learnings
    FAILURE_LOG_TEMPLATE.md       ← fill-in-the-blank for failure patterns
  documents/
    DOCUMENT_INDEX.md             ← master index of all important files in the repo
```

---

## Memory Priority Rules

Agent context windows are finite. Load in this order, stop when you have enough to act:

1. **Agent's own SOUL.md** — always, no exceptions. Never start without it.
2. **Founder mandate** (`founder/agent_mandate.md`) — always. Grounds every action in revenue.
3. **Relevant project memory** — if the task belongs to a known project (jake, hoa, data_rehab), load that file.
4. **Recent agent learnings for this task type** — last 3 entries only. Don't load the full file.
5. **Current daily log** — today's entries only. Not yesterday, not the week summary.
6. **Idea memory** — only if the task involves opportunity evaluation or scoring.

**Hard rule: Never load more than 3 memory files simultaneously.** If you need more context than 3 files provide, ask Todd to pre-summarize.

### Load Decision Tree

```
New run starting →
  What task type?
    Lead discovery / enrichment → load project_memory/(jake or hoa)_pipeline.md
    Outreach / follow-up         → load project_memory/(jake or hoa)_pipeline.md + today's daily log
    Content creation             → load agent SOUL.md + founder/founder_profile.md
    Opportunity evaluation       → load business_ideas/SCORING_RUBRIC.md + opportunity_log.md
    System change / debug        → load documents/DOCUMENT_INDEX.md + MEMORY_ARCHITECTURE.md
    Unknown                      → load founder/agent_mandate.md + today's daily log, then ask Todd
```

---

## Context Overflow Prevention

These are hard limits. No exceptions.

- **Max 3 memory files loaded per agent run** (not counting SOUL.md)
- **Max token budget for memory context: 2000 tokens** (rough: 1 token ≈ 4 characters, so ~8000 chars)
- **Daily logs compress after 7 days** → 7 daily logs become 1 weekly summary
- **Weekly summaries compress after 4 weeks** → 4 weekly summaries become 1 monthly summary
- **Monthly summaries archive after 12 months** → move to `_archive/` subfolder
- **Any single memory file > 5000 tokens** → split or compress immediately before next read
- **Stale project memory (no update in 30 days)** → auto-archive, flag Todd

When loading a file that exceeds budget: summarize it in working memory (don't write the summary), note the key 3-5 points, discard the rest. Do not try to hold the full file.

---

## Memory Integrity Rules

1. **Never overwrite** — always append new entries or create new dated files. Old entries are immutable.
2. **Every write must include**: timestamp, agent name, run ID (if applicable), confidence score (0.0-1.0).
3. **Contradictory entries**: do not delete either. Flag with `[CONFLICT]` tag and note the contradiction. Let Todd resolve.
4. **Compression never deletes originals** — move to `_archive/` subfolder, never `rm`.
5. **Confidence scoring guide**:
   - 1.0 — directly observed, confirmed outcome (meeting booked, email replied)
   - 0.9 — high-confidence inference from strong signal
   - 0.7 — reasonable inference from partial data
   - 0.5 — hypothesis, needs validation
   - 0.3 — weak signal, speculative
   - 0.1 — noise, flagging for awareness only

---

## Relationship Between Layer 0 and Layers 1-4

Layer 0 (files) and Layers 1-4 (DB) are not redundant. They solve different problems.

| Use Layer 0 when... | Use Layers 1-4 when... |
|---------------------|------------------------|
| You need narrative context ("why did we try this?") | You need structured signals ("what worked statistically?") |
| Project state spans multiple runs | A single run produced a discrete observation |
| A decision was made that agents should remember | An outcome was scored and needs distillation |
| An idea needs evaluation over days/weeks | A feedback signal needs to influence the next run immediately |
| A document or strategic context needs to persist | A lead status or episode needs to be queryable |

In practice: use `brain.observe()` / `brain.recordFeedback()` / `brain.recordEpisode()` for all programmatic signals. Use `/memory/` files for everything that requires a human to write or read to understand.

---

## Maintenance Schedule

| Action | Frequency | Who |
|--------|-----------|-----|
| Create daily log | Daily (auto, on first run) | Any agent |
| Update project_memory/ | After each pipeline milestone | Pipeline agents, Todd |
| Compress daily logs → weekly | Every 7 days | brain-distillation agent |
| Compress weekly → monthly | Every 28 days | brain-distillation agent |
| Score and triage business_ideas/ | Weekly (Friday) | Todd + Steve |
| Archive stale project_memory | When project inactive 30 days | Todd |
| Audit DOCUMENT_INDEX.md | Monthly | Todd |
