# Daily Log Compression Guide
*How and when to compress daily logs into weekly and monthly summaries. Last updated: 2026-03-13.*

---

## When to Compress

| Source | Compress When | Compress Into |
|--------|--------------|---------------|
| Daily logs (7 files) | After 7 days have passed | `weekly/YYYY-WNN.md` |
| Weekly summaries (4 files) | After 28 days have passed | `monthly/YYYY-MM.md` |
| Monthly summaries | After 12 months | `_archive/YYYY-MM.md` |

The `brain-distillation` agent runs nightly and handles log compression as part of its cycle. Any agent can trigger compression if it detects the threshold has been crossed.

---

## What to Keep vs. Discard

### Always Keep
- Lead counts with source breakdown (maps vs. scout vs. manual)
- Email hit rates (% enriched per source)
- Reply rates and classifications (INTERESTED, NOT_NOW, BOUNCED)
- Meetings booked (the scoreboard)
- Total cost per week
- Confirmed failure modes with root cause identified
- Decisions made and their rationale
- Anything tagged `evergreen: true`

### Discard During Compression
- Runs that completed with zero output ("agent ran, nothing found")
- Failed runs with no learning (pure infrastructure failures, network timeouts)
- Duplicate pipeline state entries (keep only the latest state, not every intermediate step)
- Process narration without outcome ("ran enricher, it did its thing")
- Identical leads reported twice (dedup before writing the weekly)
- Opportunities with ICE < 3 that were not actioned (they didn't matter)

---

## Weekly Summary Template

File path: `memory/daily_logs/weekly/YYYY-WNN.md`
(W01 = first week of year, using ISO week numbering)

```markdown
# Weekly Summary — [YYYY] Week [NN] ([Mon date] – [Sun date])

*Compressed from [N] daily logs on [compression date] by [agent-name]*
*Original logs archived at: memory/daily_logs/_archive/*

---

## Pipeline Metrics (Week Total)

| Metric | Jake | HOA | Total |
|--------|------|-----|-------|
| Leads added | N | N | N |
| Leads enriched | N | N | N |
| Emails with contact | N | N | N |
| Outreach sent | N | N | N |
| Replies received | N | N | N |
| Meetings booked | N | N | N |
| Cost ($) | $0.00 | $0.00 | $0.00 |

## Key Events This Week
- [Date]: [What happened — milestone, conversion, notable failure]
- [Date]: [What happened]

## What Worked
- [Specific finding with numbers]

## What Didn't Work
- [Specific failure with root cause]

## Decisions Made
- [Date]: [Decision] — [Rationale]

## Opportunities Surfaced
- [Idea slug]: ICE [N] — [one-line description] — Status: [filed / scored / presented / killed]

## Agents That Produced Zero Output
- [agent-name]: [N] runs, 0 leads / 0 content — [flag for review or expected]

## Next Week's Priorities (carried forward)
1. [task]
2. [task]
3. [task]

---
*Compression confidence: [0.0-1.0] — [note if any entries were ambiguous or conflicting]*
```

---

## Monthly Summary Template

File path: `memory/daily_logs/monthly/YYYY-MM.md`

```markdown
# Monthly Summary — [YYYY-MM] ([Month Name Year])

*Compressed from [N] weekly summaries on [compression date] by [agent-name]*
*Weekly summaries archived at: memory/daily_logs/_archive/weekly/*

---

## Month-Level Pipeline Metrics

| Metric | Jake | HOA | Total |
|--------|------|-----|-------|
| Total leads added | N | N | N |
| Email hit rate | NN% | NN% | NN% |
| Outreach sent | N | N | N |
| Reply rate | NN% | NN% | NN% |
| Meetings booked | N | N | N |
| Pilots started | N | N | N |
| Total cost ($) | $0.00 | $0.00 | $0.00 |
| Cost per lead ($) | $0.00 | $0.00 | $0.00 |

## Best-Performing Tactic This Month
[Specific tactic with supporting numbers]

## Worst-Performing Tactic This Month
[Specific failure with supporting numbers — includes what was done about it]

## Pivot or Strategic Decision
[If a major direction change occurred, note it here with rationale]

## Revenue Events
- Meetings booked: [N] — [company names if applicable]
- Pilots started: [N]
- Revenue closed: $[N] (if any)

## Agent Performance
| Agent | Runs | Leads | Cost | Status |
|-------|------|-------|------|--------|
| jake-construction-discovery | N | N | $0 | healthy / degraded / broken |
| jake-contact-enricher | N | N | $0 | |
| [etc.] | | | | |

## Opportunities in Evaluation
| Idea | ICE | Status | Decision |
|------|-----|--------|---------|
| [slug] | [score] | [evaluating / approved / killed] | [decision date + who] |

---
*Month closed: [date]*
```

---

## Side-by-Side Example: Verbose vs. Compressed

### Original Daily Log Entry (before compression)

```
---
date: 2026-03-10
time: 09:15 MT
agent: jake-contact-enricher
run_id: f3a1-9234-...
type: observation
confidence: 0.9
tags: jake-pipeline, enrichment, tampa-bay
---

Ran enrichment on 15 Tampa Bay leads from Maps discovery run on 03-08.

Step 0 (direct domain): 4 hits out of 15 (27%). Worked on companies with
unique 2+ word names. Failed on "Bay Area Contractors" — too generic.
Step 1 (scrape website): Found emails on 3 of the 4 step-0 hits.
Step 2 (Bing search): Found 2 more websites. One was wrong company (bay area
contractor in California, not Florida).
Step 3 (scrape from search): Got 1 email from step-2 results.
Step 4 (LinkedIn): Found 3 profiles, but no emails from LinkedIn alone.
Step 5 (pattern guess): 2 guesses, 0 confirmed (both bounced on verify).

Final: 4 emails found out of 15 leads (27%). 11 failed.

Cost: $0. Duration: 4.2 minutes. No browser crashes this run.
```

### Compressed Weekly Entry (what survives)

```
---
date: 2026-03-16
time: 08:00 MT
agent: brain-distillation
run_id: null
type: compressed
confidence: 0.9
tags: jake-pipeline, enrichment, compressed: true
compressed: true
date_range: 2026-03-10 to 2026-03-16
entries_compressed: 7
---

Jake enrichment — Tampa Bay batch (week of Mar 10):
- Email hit rate: 27% (4/15 from Maps, similar to 24% system average)
- Step 0 (direct domain): best performer — 27% hit rate, $0 cost
- Pattern guess (Step 5): 0% on this batch — stop using for single-word company names
- Failure pattern: generic names ("Bay Area Contractors", "FL Builders") fail domain guess
  → Minimum 2 unique words required before attempting Step 0
- Action: enricher now requires company_name word count >= 2 before Step 0 attempt
- Evergreen: true (this pattern holds across markets)
```

**What was preserved:** hit rates, the specific failure pattern, the fix, the action taken.
**What was discarded:** step-by-step process narration, individual lead details, timing, browser health notes.
