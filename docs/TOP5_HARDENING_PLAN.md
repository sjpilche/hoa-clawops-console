# Top 5 Agent Hardening Plan
**Source of truth:** `docs/RATIONALIZATION_PLAN.md`
**Date:** 2026-03-14
**Scope:** File-level hardening for the 5 highest-risk active agents

---

## 1. The Top 5 and Why They Outrank the Rest

| Rank | Agent | Core Risk | Why #1-5 and Not Lower |
|------|-------|-----------|------------------------|
| **H1** | `jake-outreach-agent` | LLM output → email sent to real humans | Highest external-facing consequence in the system. An LLM hallucination here damages Steve's reputation with a named CFO. Every other agent either writes to internal DB, posts to Steve's own Discord, or has no execution path. This one reaches strangers. |
| **H2** | `cfo-outreach-agent` | Same risk, different brand | Identical handler path. Same external consequence. Has a self-evaluation loop in its SOUL.md that jake-outreach lacks — but that loop isn't enforced server-side. |
| **H3** | `hoa-outreach-drafter` | Template emails to HOA board members | Writes to a separate `outreach_queue` table that **completely bypasses** contentGuard, Ralph QA, and angle_type tracking. It's the only outreach agent with zero post-creation governance. |
| **H4** | `jake-follow-up-agent` | LLM follow-up emails to already-contacted leads | Inserts directly into `cfo_outreach_sequences` with `status='draft'` but **no content guard, no Ralph QA auto-review, no angle_type**. Every governance gate we built for outreach agents doesn't fire for follow-ups. |
| **H5** | `jake-lead-scout` | LLM output → DB insert → feeds entire pipeline | Every downstream agent (enricher, outreach, follow-up, meeting-booker) depends on the quality of what lead-scout puts into `cfo_leads`. Garbage in = garbage through the entire pipeline. `validateLead()` exists but there's no quality trending — we can't see if output is degrading over time. |

**Why these 5 and not pipeline-director or facebook-poster?**
- `pipeline-director` is deterministic ($0, no LLM) — it can't hallucinate.
- `hoa-facebook-poster` has the existing OpenClaw confirmation gate + posts to Steve's own page.
- These 5 are the only agents where **LLM-generated text reaches people who are not Steve**.

---

## 2. Agent-by-Agent Assessment

### H1: `jake-outreach-agent`

**SOUL Quality:**
- Strong. 1,830 words. Clear banned-word list, 150-word limit, research-first mandate, strict JSON output format.
- **Gap:** No mention of Ralph QA, Brain writes, or self-evaluation loop (cfo-outreach has one; jake doesn't).
- **Gap:** No model specified — defers to bridge. Fine architecturally but means no SOUL-level fallback if bridge switches to a weaker model.

**Tool Permissions:**
- `web_search` required (MUST use before writing). Good — enforces research-first.
- `exec` and `write` explicitly forbidden. Good.
- **Gap:** No OpenClaw tool policy enforcement at handler level — the tool-policy.json blocks these in OpenClaw but the SOUL.md is the only thing preventing misuse if the bridge changes.

**Reviewer Gaps:**
- Ralph QA auto-review fires in postProcessor after insert. DONE.
- Content guard fires before insert. DONE.
- **Gap:** No check that `web_search` was actually used. The SOUL says "MUST use web_search" but nothing server-side verifies the output contains `research_sources`. An LLM that skips research produces generic emails that pass Ralph's personalization check at 0/25 — which fails QA, but the failure reason isn't "skipped research."

**Memory/Logging:**
- Brain observations written by reply-classifier downstream (not by outreach agent itself).
- **Gap:** No Brain observation on draft creation. If outreach drafts a bad email, there's no Layer 1 record of what it produced — only what happened when the lead replied.

**Eval Coverage:**
- Output schema in `outputValidator.js`: checks for `email_body`/`body_text` and `email_subject`/`subject`. Basic.
- Ralph QA scores 5 dimensions. Good.
- **Gap:** No trending. Can't see if average QA scores are declining over time. No alert on degradation.

**Recommended Changes:**

| File | Change | Risk |
|------|--------|------|
| `openclaw-skills/jake-outreach-agent/SOUL.md` | Add self-evaluation loop matching cfo-outreach's 9-criteria scorecard. Add "Write Brain observation" instruction. | LOW — SOUL edit only |
| `server/services/outputValidator.js` | Add `research_sources` field check to jake-outreach schema. Warn if empty or missing. | LOW |
| `server/services/ralphQA.js` | Add research-usage dimension (5 points): check if `research_sources` array is present and non-empty in parsed output. | LOW |
| `server/services/postProcessor.js` | After Ralph QA, write Brain Layer 1 observation: `outreach_drafted` with lead_id, QA score, angle_type. | LOW |
| `server/routes/agentHealth.js` | Add QA score trending to `/:id` endpoint: 7-day rolling avg of `qa_score` from `cfo_outreach_sequences WHERE source_agent='jake'`. | LOW |

---

### H2: `cfo-outreach-agent`

**SOUL Quality:**
- Excellent. 1,330 words. Has the **9-criteria self-evaluation loop** that jake-outreach lacks. Mandatory iteration until all criteria pass.
- The self-eval is prompt-engineering only — the LLM is told to self-score and iterate. No server-side enforcement that it actually did.
- **Gap:** The `SELF-EVALUATION` scorecard is appended after the JSON. The postProcessor's `parseAgentJSON` will fail to parse if the scorecard text follows the JSON block. Need to verify parsing handles this.

**Tool Permissions:**
- Same as jake-outreach. `web_search` mandatory, `exec`/`write` forbidden.
- Human approval gate explicitly stated in SOUL.md: "every email requires approval before sending." This matches the `status='draft'` flow.

**Reviewer Gaps:**
- Same as jake-outreach. Ralph QA fires, content guard fires.
- **Gap:** The self-evaluation scorecard in the output is never parsed or stored. We're throwing away quality signal the LLM is already producing.

**Memory/Logging:**
- Same gap as jake-outreach. No Brain observation on draft creation.

**Eval Coverage:**
- Same output schema as jake-outreach in `outputValidator.js`.
- **Gap:** Should parse and store the self-evaluation scores if present. Free quality data.

**Recommended Changes:**

| File | Change | Risk |
|------|--------|------|
| `server/services/postProcessor.js` | In the cfo/jake-outreach block, after `parseAgentJSON`, also try to extract `SELF-EVALUATION` block from raw text. If found, store in `qa_notes` alongside Ralph's score. | LOW |
| `server/services/outputValidator.js` | For cfo-outreach, add warning if no `SELF-EVALUATION` block found in raw output (means LLM skipped the loop). | LOW |
| `server/services/postProcessor.js` | Same Brain observation as H1: `outreach_drafted` with lead_id, QA score, angle_type. | LOW — same change covers both |

---

### H3: `hoa-outreach-drafter`

**SOUL Quality:**
- Good. 1,500 words. Template-based (not LLM). 5 scenario templates, CAN-SPAM compliant, clear word limits.
- **Gap:** SOUL.md says "human review required before sending" but the handler inserts directly with `send_status='draft'` and **no content guard or Ralph QA runs**.

**Tool Permissions:**
- No tools. Pure Node.js template generation. $0/run. No LLM risk — but the **template content itself** has never been validated against the content guard.

**Reviewer Gaps:**
- **CRITICAL:** The `hoa_outreach_drafter` special handler calls `hoaOutreachDrafter.draftMultipleOutreach()` which inserts into `outreach_queue` (a separate table from `cfo_outreach_sequences`). This table has **no `qa_status` column, no `qa_score`, no `angle_type`**. Ralph QA doesn't know this table exists.
- Content guard doesn't run on these drafts.
- The entire Week 2 governance layer we built — contentGuard, Ralph QA, angle_type — was wired into `cfo_outreach_sequences` only. HOA outreach uses a different table and is completely ungoverned.

**Memory/Logging:**
- No Brain observations written. The handler returns a summary but writes no Layer 1 signal.

**Eval Coverage:**
- No output schema validation (it's a special handler, not an LLM agent — outputValidator only runs on LLM path).
- No QA scores tracked.
- No A/B tracking on which scenario template converts better.

**Recommended Changes:**

| File | Change | Risk |
|------|--------|------|
| `server/db/migrations/039_hoa_outreach_qa.sql` | Add `qa_status`, `qa_score`, `qa_notes`, `qa_reviewed_at` columns to `outreach_queue` table. | LOW |
| `server/services/hoaOutreachDrafter.js` | After each INSERT into `outreach_queue`, run content guard on `email_body` and set `qa_status` based on result. | LOW |
| `server/services/ralphQA.js` | Add `reviewSingleHOAOutreach(queueId)` function that reads from `outreach_queue`, scores subject/body, writes `qa_status`. | MED — new function |
| `server/routes/runs.js` (hoa_outreach_drafter handler) | After `draftMultipleOutreach()`, call `ralphQA.reviewHOAOutreachBatch()` on newly created drafts. | LOW |
| `server/services/hoaOutreachDrafter.js` | Add Brain Layer 1 observation after drafting: `outreach_drafted` with lead_id, scenario, contact_email. | LOW |

---

### H4: `jake-follow-up-agent`

**SOUL Quality:**
- Minimal. Only ~300 words. Specifies: 1 web_search, JSON output, 5 follow-up angle types, under-100-word emails.
- **Gap:** No banned-word list (jake-outreach has one, follow-up doesn't).
- **Gap:** No mention of Ralph QA, content guard, or Brain writes.
- **Gap:** No self-evaluation loop.

**Tool Permissions:**
- `web_search`: exactly 1 search allowed. Good — tight constraint.
- No explicit `exec`/`write` ban (jake-outreach explicitly bans these; follow-up doesn't mention them).

**Reviewer Gaps:**
- **CRITICAL:** The `jake_follow_up` handler in runs.js inserts directly into `cfo_outreach_sequences` with:
  ```javascript
  INSERT INTO cfo_outreach_sequences (..., status, sequence_position) VALUES (..., 'draft', 2)
  ```
  No `qa_status` is set. No content guard runs. No Ralph QA auto-review. No `angle_type` is set.
  This is the exact same table that the jake/cfo-outreach agents write to — but the follow-up path completely skips all the governance we added in Week 2.

**Memory/Logging:**
- Handler writes one Brain observation: `follow_up_queued` with company name and days since first touch. Good.
- **Gap:** No content-level Brain observation (what angle was used, what research was found).

**Eval Coverage:**
- `outputValidator.js` has a `jake-follow-up-agent` schema that checks for `body_text` and word count. Basic but present.
- **Gap:** Schema doesn't check `follow_up_angle` field (one of 5 required values per SOUL.md).
- **Gap:** No Ralph QA scoring on follow-up drafts.

**Recommended Changes:**

| File | Change | Risk |
|------|--------|------|
| `openclaw-skills/jake-follow-up-agent/SOUL.md` | Add banned-word list (copy from jake-outreach). Add `exec`/`write` tool ban. | LOW |
| `server/routes/runs.js` (jake_follow_up handler) | After INSERT, run content guard on body. Set `qa_status='pending'`. Call `ralphQA.reviewSingleOutreach(insertedId)`. Set `angle_type` from parsed `follow_up_angle`. | MED |
| `server/services/outputValidator.js` | Add `follow_up_angle` required field check (must be one of: bump, new_angle, social_proof, curious_question, direct_ask). | LOW |
| `server/services/ralphQA.js` | Adjust scoring for follow-ups: lower word count expectation (50-150 vs 80-300), skip "research_sources" dimension, add "angle appropriateness" check against days_since_send. | MED |

---

### H5: `jake-lead-scout`

**SOUL Quality:**
- Good. ~415 words. Extremely strict output format (raw JSON only, must start with `{`). Exactly 3 searches. Scoring rubric defined (email +30, LinkedIn +20, etc.).
- **Gap:** No mention of `validateLead()` or what happens to invalid data. The SOUL just says "output JSON" — the validation is server-side only, invisible to the agent.
- **Gap:** No mention of Brain writes.

**Tool Permissions:**
- `web_search`: exactly 3, with specific query patterns prescribed. Excellent constraint.
- No other tools mentioned. No explicit bans.

**Reviewer Gaps:**
- `validateLead()` in runs.js catches garbage before DB insert. DONE.
- Output schema validation via `outputValidator.js`. DONE.
- **Gap:** No alert when validation failure rate exceeds a threshold. If the LLM starts hallucinating company names, we'd see `leadsSkipped` increase but nobody is watching that metric.
- **Gap:** No Ralph QA on leads (Ralph reviews outreach, not leads). This is correct — leads aren't external-facing. But lead *quality* directly impacts outreach quality downstream.

**Memory/Logging:**
- Handler writes Brain Layer 1 observations via `brain.observe()` for each lead: `market_insight` and `lead_signal`. Good.
- **Gap:** No observation written when leads are **rejected** by `validateLead()`. We know how many were rejected (`leadsSkipped`) but not *why* — the validation errors aren't persisted.

**Eval Coverage:**
- `outputValidator.js` schema: checks for `leads` array, required fields on first 5 leads, score range. Good.
- `validateLead()`: checks string lengths, email format, LinkedIn URL, SQL injection patterns, score range. Good.
- **Gap:** No quality trending. Can't answer "are lead scores declining?" or "is the validation failure rate increasing?" without manual log review.

**Recommended Changes:**

| File | Change | Risk |
|------|--------|------|
| `server/routes/runs.js` (jake_lead_scout handler) | After the lead insertion loop, compute and log: `avg_score`, `validation_failure_rate`, `leads_per_run`. Write to `audit_log` with action `lead_scout_quality`. | LOW |
| `server/routes/runs.js` (jake_lead_scout handler) | When `validateLead()` fails, write Brain Layer 1 observation: `lead_rejected` with the validation errors. This feeds back into the system so future scout runs can see what went wrong. | LOW |
| `server/routes/runs.js` (jake_lead_scout handler) | After loop, if `validation_failure_rate > 0.3` or `leadsInserted < 3`, post Discord warning: "Lead Scout quality alert." | LOW |
| `server/services/outputValidator.js` | Tighten jake-lead-scout schema: add check that `search_summary` exists and `queries_run === 3` (SOUL.md says exactly 3 searches). Warn if fewer. | LOW |

---

## 3. Complete File Change Manifest

| File | H1 | H2 | H3 | H4 | H5 | Total Touches |
|------|----|----|----|----|----|----|
| `server/services/postProcessor.js` | Brain obs + self-eval parse | Self-eval parse | — | — | — | 2 changes |
| `server/services/ralphQA.js` | Research dimension | — | HOA review function | Follow-up scoring adjustment | — | 3 changes |
| `server/services/outputValidator.js` | research_sources check | Self-eval warning | — | follow_up_angle check + search_summary | Tighten schema | 4 changes |
| `server/routes/runs.js` | — | — | HOA QA call | Follow-up QA + content guard + angle | Quality metrics + rejected obs + alert | 3 handlers touched |
| `server/services/hoaOutreachDrafter.js` | — | — | Content guard + Brain obs | — | — | 1 change |
| `server/routes/agentHealth.js` | QA score trending | — | — | — | — | 1 change |
| `server/db/migrations/039_hoa_outreach_qa.sql` | — | — | QA columns on outreach_queue | — | — | 1 new file |
| `openclaw-skills/jake-outreach-agent/SOUL.md` | Self-eval loop + Brain instruction | — | — | — | — | 1 edit |
| `openclaw-skills/jake-follow-up-agent/SOUL.md` | — | — | — | Banned-word list + tool bans | — | 1 edit |

**Total: 9 files changed, 1 new migration file.**

---

## 4. Lowest-Risk Implementation Order

Each step is independently deployable. No step depends on a later step.

### Step 1: Output validator tightening (zero runtime risk)
**Files:** `server/services/outputValidator.js`
**Changes:** Add `research_sources` check for outreach, `follow_up_angle` for follow-up, `search_summary.queries_run` for lead-scout, self-eval warning for cfo-outreach.
**Risk:** Zero. Validators only log warnings — they don't block execution.

### Step 2: SOUL.md edits (zero runtime risk)
**Files:** `jake-outreach-agent/SOUL.md`, `jake-follow-up-agent/SOUL.md`
**Changes:** Add self-evaluation loop to jake-outreach, add banned-word list and tool bans to follow-up.
**Risk:** Zero. SOUL.md changes only affect LLM behavior on next run, don't touch server code.

### Step 3: Brain observations for outreach drafts (low risk)
**Files:** `server/services/postProcessor.js`
**Changes:** After Ralph QA review, write `outreach_drafted` Brain observation. Parse and store self-evaluation scorecard if present.
**Risk:** Low. Brain observations are fire-and-forget. If they fail, the draft still saves.

### Step 4: Follow-up handler governance (medium risk)
**Files:** `server/routes/runs.js` (jake_follow_up handler)
**Changes:** After INSERT, run content guard, set `qa_status='pending'`, call `ralphQA.reviewSingleOutreach()`, set `angle_type` from `follow_up_angle`.
**Risk:** Medium. Modifies the follow-up handler's insert logic. Test with a single follow-up before enabling on schedule.

### Step 5: Lead scout quality trending (low risk)
**Files:** `server/routes/runs.js` (jake_lead_scout handler)
**Changes:** Compute `avg_score` / `validation_failure_rate` / `leads_per_run`. Log to `audit_log`. Brain observation on rejected leads. Discord alert on quality degradation.
**Risk:** Low. All additions are post-insertion — they don't affect whether leads get saved.

### Step 6: HOA outreach governance (medium risk)
**Files:** `039_hoa_outreach_qa.sql`, `server/services/hoaOutreachDrafter.js`, `server/services/ralphQA.js`, `server/routes/runs.js`
**Changes:** Add QA columns to `outreach_queue`, run content guard on HOA drafts, add `reviewSingleHOAOutreach()` to Ralph, call from handler.
**Risk:** Medium. Requires a migration on a table that's actively used. Run migration during low-traffic window. Test with `{"limit": 1}` first.

### Step 7: QA score trending on health endpoint (low risk)
**Files:** `server/routes/agentHealth.js`
**Changes:** Add 7-day rolling average of `qa_score` to the `/:id` detail endpoint.
**Risk:** Low. Read-only query addition to an existing endpoint.

---

## Summary

```
Step 1: outputValidator.js     → 4 schema tightenings      [ZERO RISK]
Step 2: 2x SOUL.md             → guardrail additions        [ZERO RISK]
Step 3: postProcessor.js       → Brain obs + self-eval      [LOW RISK]
Step 4: runs.js follow-up      → content guard + QA + angle [MED RISK]
Step 5: runs.js lead-scout     → quality trending + alerts  [LOW RISK]
Step 6: HOA outreach           → migration + guard + QA     [MED RISK]
Step 7: agentHealth.js         → QA trending endpoint       [LOW RISK]
```

**7 steps. 9 files. 1 migration. 0 agents deleted. 0 agents merged. 0 architecture changes.**

The two medium-risk steps (4 and 6) should each be tested with a single-record run before enabling on schedule. Everything else can ship immediately.
