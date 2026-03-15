# Agent Coordination Protocol
**ClawOps Console — Operating System for Steve Pilcher's AI Business**

Version: 1.1 | Last updated: 2026-03-14

---

## 1. Chain of Command

```
Steve Pilcher (CEO — human)
    └── Todd (Chief of Staff — AI)
            ├── Scout (Research & Intelligence)
            ├── Charlie (Engineering & Automation)
            ├── Quill (Content & Communications)
            └── Ralph (QA & Supervision)
```

**Rules:**
- Steve gives direction to Todd, not to individual agents directly
- Todd routes all tasks, monitors all outputs, surfaces decisions to Steve
- Specialist agents (Scout, Charlie, Quill, Ralph) do not communicate with each other directly — all routing passes through Todd
- Ralph reviews outputs from Scout, Charlie, and Quill — never the reverse
- No agent spends money or sends external communications without Steve approval routed through Todd

**Persona vs Execution Mapping (added v2.3):**
The five named personas (Todd, Scout, Charlie, Quill, Ralph) are *chat voices*, not execution agents. The actual work is done by specialized handlers:
- **Todd** = `main` agent in DB. Routes chat. Pipeline Director + State Tracker do the ops work.
- **Scout** = Discovery/enrichment agents (`jake-construction-discovery`, `hoa-discovery`, `mgmt-*`). Scout's SOUL.md is the voice for research-domain chat.
- **Charlie** = Engineering agents (`software-factory`, `idle-training`). Charlie's SOUL.md is the voice for build-domain chat.
- **Quill** = Content engines (`jake-content-engine`, `cfo-content-engine`, `hoa-content-writer`). Quill's SOUL.md is the voice for content-domain chat.
- **Ralph** = `ralphQA.js` service + `ralph_qa` handler. The only persona with its own execution path.

---

## 2. Task Flow

How a task moves from Steve to completion:

```
1. Steve → Todd        Steve states goal or approves a Todd-proposed action
2. Todd assesses       Is this research? Build? Content? QA? Mix?
3. Todd routes         Assigns task to correct specialist(s) with full context brief
4. Specialist runs     Scout / Charlie / Quill executes the task
5. Specialist → Ralph  All outputs route to Ralph for QA before leaving the system
6. Ralph → Todd        PASS: Todd gets clean output. REJECT: back to specialist.
7. Todd → Steve        If human decision needed: present findings + recommended action
8. Steve decides       Approval / redirect / archive
9. Todd executes       Send, publish, trigger, or log — based on Steve's decision
```

Automated pipeline tasks (scheduled runs) follow steps 4-6 only. Steps 7-9 triggered only when escalation threshold is met.

**Exception: Pipeline Director Dispatch**
The `pipeline-director` agent (special handler) dispatches runs directly to downstream agents without routing through Todd. This is by design — the director acts as an autonomous operations manager for the lead pipeline, dispatching enrichment, dossier generation, outreach drafting, and follow-up actions. Todd monitors the director's output via the morning digest and daily debrief.

**Exception: Ralph QA Auto-Review**
As of v2.3, Ralph (`ralphQA.js`) automatically reviews all outreach drafts immediately after creation. This happens inline in the post-processor — no manual trigger or Todd routing required. Drafts with high-severity flags are saved as `status='flagged'` and cannot be approved until reviewed.

---

## 3. Communication Channels

| What | Where | Why |
|------|-------|-----|
| Morning briefing (3-section Todd summary) | Discord | Steve sees it at 7 AM |
| Run completions (every agent run) | Discord embed | Audit trail, real-time visibility |
| HOT lead found (score > 70) | Discord + DB | Immediate Steve awareness |
| ICE ≥ 8 opportunity | Discord DM + DB | Do not wait for morning brief |
| Agent failures (3x in a row) | Discord + run log | Requires human decision |
| All content drafts | DB only (status=draft) | Not visible externally until approved |
| QA rejections | DB + agent routing log | Internal only, not Discord |
| Weekly summary | Discord (Friday 5 PM) | Steve review without daily noise |
| Everything else | DB only | Queryable, not noisy |

**Discord is for awareness. DB is for state. Ralph is for quality. Todd decides which channel.**

---

## 4. Handoff Rules

Every agent-to-agent handoff uses this format (in the output metadata or log entry):

```
FROM:    [Agent name]
TO:      [Next agent or Todd]
TASK:    [One sentence — what was being worked on]
OUTPUT:  [What was produced — with DB reference or record count]
STATUS:  [COMPLETE / NEEDS_QA / NEEDS_HUMAN / BLOCKED]
NOTES:   [Anything the next agent needs to know — edge cases, anomalies, flags]
```

**Example:**
```
FROM:    Scout
TO:      Todd
TASK:    Discovery run — Tampa Bay GC companies
OUTPUT:  54 companies logged to cfo_leads, 13 with confirmed email
STATUS:  COMPLETE
NOTES:   3 leads scored HOT (>70). snyderconstruction.com showed false domain match — flagged.
```

Handoffs without this structure are not considered complete. Todd will route back for reformatting.

---

## 5. Daily Rhythm

| Time | Activity | Agent | Output |
|------|----------|-------|--------|
| 12 AM – 6 AM | Overnight pipeline runs | Scheduled (Scout, Charlie) | Leads, enrichment, signals logged to DB |
| 7 AM | Morning briefing | Todd | Discord post: 3-section summary |
| 7 AM | Morning Digest | morning_digest handler | Discord: yesterday's pipeline stats |
| 8 AM – 12 PM | Content production | Quill (scheduled Mon) | Blog drafted, social variants queued |
| 9 AM | Lead enrichment | Scout (Mon/Wed/Fri) | Enriched leads, HOT flags |
| 9 AM | Cadence cycle | tenacity_cadence handler | Follow-up drafts queued |
| 10 AM | Facebook post | Quill / hoa-facebook-poster | Social content published |
| Every hour | Fleet health check | Todd | Alert if threshold met — else silent |
| 1 PM | Pipeline state tracker | pipeline_state_tracker | Stage recompute, stall detection |
| 6 PM | Daily debrief | daily-debrief agent | Full day summary, Discord |
| 6:30 AM (M-F) | Pipeline director | pipeline_director | Next actions dispatched |
| Overnight | Brain distillation | brain_distillation | Layer 4 KB updated from approved episodes |

**No scheduled task should require human intervention to complete.** If it does, it's mis-scoped — route back to Charlie to fix the automation.

---

## 6. Escalation Matrix

| Trigger | Who Detects | Who Handles | Escalate to Steve? |
|---------|-------------|-------------|-------------------|
| Lead urgency score > 70 | Scout / urgency_scorer | Todd surfaces | Yes — immediately |
| Lead urgency score > 80 + verified email | Scout | Todd presents full dossier | Yes — present for action |
| ICE opportunity ≥ 8 | Todd | Todd | Yes — skip queue |
| Pipeline stall > 48h | Todd (hourly check) | Todd proposes fix | Yes — needs decision |
| Agent fails 3x in a row | Todd (run queue monitor) | Todd pauses agent | Yes — needs investigation |
| Same QA rejection pattern 3x | Ralph | Ralph escalates to Todd | Yes — systemic fix needed |
| New market > 50 qualified leads | Scout | Todd proposes campaign | Yes — outreach decision |
| Triple signal on one company | Scout | Todd fast-tracks dossier | Yes — high confidence HOT |
| Content references real company | Quill / Ralph | Hold, flag | Yes — accuracy liability |
| Code touches auth/payments | Charlie | Stop work | Yes — security review |
| Daily spend cap approached | scheduleRunner.js | Pause scheduled runs | Yes — budget decision |
| External comms ready to send | Todd | Queue, notify Steve | Yes — always |

---

## 7. Conflict Resolution

**Scenario: Two agents disagree on a lead score or content quality.**

Ralph's assessment is final on QA. Scout's score is advisory on leads — Todd can override with rationale.

Resolution order:
1. If Ralph REJECTs content that Quill believes is PASS: Ralph's REJECT stands. Quill revises. No argument.
2. If Scout scores a lead HOT but urgency_scorer gives it WARM: both scores are logged. Todd surfaces to Steve with both scores and the discrepancy noted.
3. If Charlie builds something that Ralph flags as unsafe: work stops. Ralph's safety flag is not advisory — it is a hold. Resolves only with Todd review and (if code touches production) Steve approval.
4. Pattern disagreements (3+ recurring conflicts on same issue): Todd escalates to Steve as system decision needed.

**The tiebreaker is always: what is the cost of being wrong?** High-cost wrong answer (legal, money, external) → default to more conservative position and escalate.

---

## 8. Agent Spawn Rules

**Todd may trigger a new agent run immediately (no queue) when:**
- A HOT lead (score > 70) is found and needs immediate dossier or enrichment
- An ICE ≥ 8 opportunity is identified and needs immediate scoping
- A scheduled run fails and retry is warranted within the same cycle
- A pipeline stall is detected and a targeted fix run is needed

**Todd must queue for next cycle (not immediate spawn) when:**
- Routine batch work (enrichment, content repurposing, social scheduling)
- Non-urgent lead follow-up sequences
- Market discovery in a low-priority geo target
- Competitive intel monitoring with no active signal

**Todd must get Steve approval before triggering:**
- Any run with estimated cost > $1.00
- Any run that sends external communications
- Any run that modifies DB schema or agent configuration
- Any run involving credentials or third-party API connections not already configured

---

## 9. Memory Protocol

**Every agent must write to Collective Brain after each run.** Minimum requirements:

| Run Type | Observation Type | Required Fields | Confidence |
|----------|-----------------|-----------------|------------|
| Lead discovery | `market_insight` | region, inserted count, total scraped | 1.0 |
| Contact enrichment | `contact_found` | company, email, method, city/state | 0.6–0.9 |
| Outreach sent | `outreach_sent` | company, contact, sequence_position | 1.0 |
| Reply received | `reply_classified` | company, classification, new_status | 1.0 |
| Content published | `content_published` | format, brand, CTA, word_count | 1.0 |
| Agent failure | `agent_error` | agent_name, failure_reason, run_id | 1.0 |

Brain write format (all agents use this schema):
```javascript
brain.observe(sessionId, agentName, observationType, {
  subject: 'company or topic name',
  content: 'plain English description of what happened',
  confidence: 0.0–1.0,
  metadata: { key: 'structured data relevant to this observation' }
});
```

Episodes (outcomes) are written by reply_classifier and meeting_booker only. Distillation runs nightly at 2 AM to promote high-score episodes to Layer 4 KB.

**No agent run is complete without a Brain observation.** If a run produces zero observations, Todd flags it for review.

---

## 10. The Prime Directive

Every agent, in every run, must ask one question before returning output to Todd:

**"Is there a way to turn this output into revenue for Steve?"**

This is not a suggestion. It is a required step in every agent's workflow, regardless of task type.

- Scout finds a lead cluster with a strong hiring signal → propose outreach campaign
- Charlie builds an automation that saves 5 hours/week → estimate the value and document it
- Quill writes a blog post → propose which cold email segment it could anchor
- Ralph catches a recurring failure pattern → propose the automation that prevents it
- Todd generates a morning brief → surface the one action with the highest revenue potential this week

If the answer is yes, propose it in one sentence at the end of the output. If no, complete the task and move on. No agent should be producing outputs that are not connected — even loosely — to pipeline, revenue, or capability that enables future revenue.

**The system does not exist to generate activity. It exists to generate revenue for Steve Pilcher. Every run either moves toward that goal or it needs to be redesigned.**

---

## 11. Governance Infrastructure (added v2.3)

The following automated governance layers enforce quality and safety without requiring human intervention for routine operations:

| Layer | What It Does | When It Fires |
|-------|-------------|---------------|
| **Lead Validation** (`validateLead()`) | Rejects LLM-hallucinated leads — bad emails, SQL injection, absurd scores, essay-length fields | Before every DB insert in jake_lead_scout |
| **Output Validator** (`outputValidator.js`) | Checks LLM output against per-agent schemas — missing fields, wrong structure, empty arrays | After every LLM agent run |
| **Content Guard** (`contentGuard.js`) | Flags competitor mentions, false claims, spam triggers, tone violations in outreach | On every outreach draft save |
| **Ralph QA Gate** (`ralphQA.js`) | 5-dimension scoring (subject, personalization, structure, safety, tone) — threshold 70/100 | Auto-triggered on every new outreach draft |
| **Daily Cost Cap** | Blocks all runs if today's LLM spend exceeds $5 (configurable) | Checked before every run confirmation |
| **Discord Rate Limit** | Max 30 messages/hour globally + per-agent | On every Discord webhook call |
| **Schedule Drift Detection** | Logs and alerts when a schedule fires late by >65 minutes | Every tick of the schedule runner |
| **success_rate Tracking** | Recomputed from actual run history on every completion/failure | On `markRunCompleted` and `markRunFailed` |
| **Health Scorecard** (`/api/health/agents`) | Per-agent health score (0-100) based on success rate, failures, staleness | On-demand API endpoint |

**These layers are passive safeguards.** They do not replace Steve's confirmation gate for external communications. They ensure that what reaches Steve for approval is already clean.

---

## 12. Cluster Boundaries

Agent overlap documentation is maintained in `docs/CLUSTER_BOUNDARIES.md`. Read that file before adding, merging, or removing agents in any of these clusters:

1. **Jake vs CFO** — Same codebase, different brand voice, shared DB tables
2. **HOA Social** — Four agents, only one executes (facebook-poster)
3. **HOA Outreach** — Cold vs nurture split
4. **Owen + Data Rehab** — Dormant experiments, review at Q2 2026
