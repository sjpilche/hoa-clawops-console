# Agent Memory Instructions
*Operational rules for reading, writing, and compressing memory. Loaded by agents before any memory operation. Last updated: 2026-03-13.*

---

## WHEN TO STORE MEMORIES

Store a memory entry when any of these triggers fire. Do not store on every run — only when there is something worth knowing next time.

| Trigger | Where to Write | Type |
|---------|---------------|------|
| Run produces >= 1 new lead | `memory/daily_logs/YYYY-MM-DD.md` | observation |
| Run produces a reply or conversion event | `memory/agent_learnings/` (new entry) | learning |
| Same task fails 2x in a row | `memory/agent_learnings/failure_log.md` | failure |
| New market signal discovered (ICE >= 5) | `memory/business_ideas/` (new idea file) | idea |
| Pipeline milestone crossed (lead → enriched → outreach → reply → meeting) | `memory/project_memory/(project).md` | milestone |
| Steve approves or rejects an output | `brain.recordFeedback()` — Layer 2 DB | feedback |
| Meeting booked | `brain.recordEpisode()` with score 1.0 — Layer 3 DB | episode |
| Outreach reply received | `brain.recordEpisode()` with appropriate score — Layer 3 DB | episode |
| Agent discovers a repeating pattern (3+ instances) | `memory/agent_learnings/` (new entry) | learning |
| A project decision is made (strategy change, pivot, kill) | `memory/project_memory/(project).md` | decision |

**When in doubt:** write to `daily_logs/` first. It's the lowest commitment, lowest risk place. Todd will promote it if it matters.

---

## HOW TO RETRIEVE MEMORIES

Follow this priority order. Stop when you have enough context to act. Never load all layers at once.

**Step 1 — Check today's daily log**
Path: `memory/daily_logs/YYYY-MM-DD.md` (today's date)
Why: Most recent context. Avoids repeating work already done this session.
If file doesn't exist: proceed to step 2, create it at end of run.

**Step 2 — Check relevant project memory**
Path: `memory/project_memory/jake_pipeline.md` or `hoa_pipeline.md` or `data_rehab.md`
When: Any task that belongs to a known active pipeline.
Load only the sections relevant to your task type. Don't load the full file if you only need pipeline state.

**Step 3 — Check agent_learnings/ for past runs of same task type**
Path: `memory/agent_learnings/`
Load: Last 3 entries matching your task type or agent name. Not the full log.
Why: Past failure patterns and proven tactics for this specific task.

**Step 4 — Check Collective Brain KB (Layer 4)**
Method: Query `GET /api/brain/context-preview?q=<topic>`
When: Task involves outreach, lead scoring, or market-specific patterns.
What comes back: Distilled learnings from high-score episodes. Most reliable signal in the system.

**Step 5 — Check business_ideas/ (conditional)**
Path: `memory/business_ideas/`
When: Only if this run involves evaluating, scoring, or advancing a business opportunity.
Do not load this for operational pipeline tasks.

---

## HOW TO WRITE A MEMORY ENTRY

Every entry must use this exact format. No exceptions. Agents and Todd must be able to parse these consistently.

```
---
date: YYYY-MM-DD
time: HH:MM MT
agent: [agent-name-slug]
run_id: [uuid or null if no associated run]
type: [observation | learning | failure | idea | milestone | decision | opportunity]
confidence: [0.0-1.0]
tags: [comma-separated: pipeline name, geo, task type, agent name, etc.]
---

[Content — max 500 words. Plain markdown.]
[Lead with the finding, not the context.]
[Bad: "I ran the enricher today and found that..."]
[Good: "Email hit rate on Maps leads: 24% (13/54). Pattern: domain guessing fails when company name contains common words (Construction, Building, Contractors). Fix: require 3+ unique words before attempting domain guess."]
```

### Content Rules

- Lead with the finding. The "what" before the "how."
- Quantify when possible. "6 leads" not "several leads." "$8K-$15K" not "significant revenue."
- Include the specific next action if one is clear. "Run enricher on remaining 8" not "more work needed."
- Flag contradictions with `[CONFLICT with entry YYYY-MM-DD]`
- Tag `evergreen: true` if the learning is likely to hold across markets and time (not session-specific)
- Tag `compressed: true` on any summary entry that replaced multiple originals

### Where to Append

- `daily_logs/` — create new file per day: `YYYY-MM-DD.md`. Append entries chronologically.
- `agent_learnings/` — append to bottom of `learnings.md` or create named file for large learning sets
- `agent_learnings/failure_log.md` — append only, never overwrite
- `project_memory/(project).md` — update the relevant section (Pipeline State, Key Decisions, etc.)
- `business_ideas/` — create new file per idea: `IDEA-[slug].md`

---

## HOW TO COMPRESS MEMORIES

Compression is not deletion. It is distillation. Run this algorithm when TTL thresholds are hit.

**Step 1: Identify entries past TTL**
- Daily logs: entries older than 7 days
- Weekly summaries: older than 28 days
- Learning entries tagged `compressed: false` and older than 90 days with no `evergreen: true`

**Step 2: Group by signal type**
Group entries by tag or project before compressing. Don't mix jake pipeline learnings with HOA learnings into one blob.

**Step 3: Extract what matters**
Keep:
- Specific numbers (hit rates, costs, lead counts)
- Decisions and their rationale
- Confirmed failure modes with root causes
- Patterns that repeated 3+ times
- Outcomes: meetings booked, leads converted, campaigns killed

Discard:
- Process narration ("first I did X, then Y")
- Failed attempts that produced no learning (unless the failure itself is the learning)
- Duplicate signals (same market, same outcome, no new info)
- Entries with confidence < 0.3

**Step 4: Write the compressed summary**
Use the standard entry format with `type: compressed` and `compressed: true` tag.
Include: date range covered, number of entries compressed, key findings (bullet list), decisions made, outcomes confirmed.

**Step 5: Archive originals**
Move the original entries to `_archive/` subfolder in the same directory.
Do not delete. If you can't move (permissions), add `[ARCHIVED]` header to each original entry.

**Step 6: Log the compression**
Write a one-line entry in today's daily log:
```
[HH:MM] Compressed [N] entries from [date range] → [file]. Key finding retained: [one sentence].
```

---

## CONTEXT OVERFLOW RULES

These are enforced limits, not guidelines.

**Before loading any memory file:**
1. Estimate token count: file size in bytes / 4 ≈ token count
2. Check running total against 2000-token memory budget
3. If loading the file would exceed budget: summarize key sections in working memory instead of loading full file

**If a task requires > 3 memory files:**
Do not attempt to load all of them. Write to daily log: "Task [type] requires > 3 memory files. Flagging for Todd to pre-summarize context before next run." Then proceed with the 3 highest-priority files.

**Stale entries (> 30 days, no `evergreen: true` tag):**
Do not load. Flag the entry as compression candidate in your daily log entry. Don't hold it in context.

**Emergency overflow rule:**
If you are mid-run and context is overflowing, write current working state to daily log immediately before truncating. A partial record is better than a lost one.

---

## AGENT-SPECIFIC MEMORY RESPONSIBILITIES

| Agent | Writes To | Reads From |
|-------|-----------|------------|
| jake-construction-discovery | daily_logs/, project_memory/jake_pipeline.md | jake_pipeline.md, SCORING_RUBRIC.md |
| jake-contact-enricher | daily_logs/, agent_learnings/failure_log.md | jake_pipeline.md, agent_learnings/ |
| jake-outreach-agent | daily_logs/, project_memory/jake_pipeline.md | jake_pipeline.md, Layer 4 KB |
| jake-lead-scout | daily_logs/, business_ideas/ (if new market) | jake_pipeline.md, Layer 4 KB |
| hoa-discovery | daily_logs/, project_memory/hoa_pipeline.md | hoa_pipeline.md |
| hoa-outreach-drafter | daily_logs/, project_memory/hoa_pipeline.md | hoa_pipeline.md, Layer 4 KB |
| pipeline-director | project_memory/(all), daily_logs/ | All project files, daily log |
| brain-distillation | Compresses all layer 0 files | All memory files |
| daily-debrief | daily_logs/ (summary entry) | Today's daily log, all project files |
| morning-digest | daily_logs/ (morning entry) | Yesterday's daily log |
| todd (main) | All files | All files |
