# Executive Agent Fleet — Master Operating Manual
*ClawOps Console | Last updated: 2026-03-13*

---

## 1. Team Overview

| Agent | Role | One Line |
|---|---|---|
| **Todd** | Chief of Staff | Routes every task, runs the 7AM brief, keeps the fleet honest |
| **Scout** | Research & Intel | Finds GC companies, enriches contacts, scores leads, monitors signals |
| **Charlie** | Engineering & Builder | Builds automations, services, migrations, and agent scaffolds |
| **Quill** | Content & Communications | Writes cold emails, blog posts, LinkedIn posts, follow-ups, case studies |
| **Ralph** | QA Supervisor | Reviews all output before it leaves the system — PASS / PASS WITH NOTES / REJECT |
| **Steve Pilcher** | CEO (Human) | Final authority on spend, send, legal, and strategic pivots |

---

## 2. Chain of Command

```
                    ┌─────────────┐
                    │    STEVE    │  ← Human. Final authority.
                    │   (CEO)     │    Spend · Send · Legal · Pivot
                    └──────┬──────┘
                           │ escalations + briefings
                    ┌──────▼──────┐
                    │    TODD     │  ← Chief of Staff. Routes everything.
                    │ Chief of    │    7AM briefing · health monitoring
                    │   Staff     │    blocker surface · re-routing
                    └──┬───┬──┬──┘
              ┌────────┘   │  └────────┐
         ┌────▼────┐  ┌────▼────┐  ┌──▼────────┐
         │  SCOUT  │  │ CHARLIE │  │   QUILL   │
         │Research │  │Builder  │  │  Content  │
         │ & Intel │  │         │  │   & Comms │
         └────┬────┘  └────┬────┘  └──┬────────┘
              │             │          │
              └──────────┬──┘          │
                    ┌────▼────┐        │
                    │  RALPH  │◄───────┘
                    │   QA    │  ← All output flows through Ralph
                    │Supervis.│    before it leaves the system
                    └─────────┘
```

**Key routing rule:** Scout / Charlie / Quill submit work to Ralph. Ralph's verdict goes to Todd. Todd routes the next action. Steve only sees things at three moments: the morning briefing, HOT lead alerts, and Tier 3 escalations.

---

## 3. Daily Rhythm

```
06:55  Scheduler fires daily briefing prep
07:00  Todd: morning briefing (reads DB, formats embed, posts to Discord)
       Covers: pipeline stats, agent health, overnight runs, top priority, open blockers

07:05  Steve reads the briefing. Replies if decisions are needed.

08:00  Scout: construction discovery run fires (Monday and Thursday)
       Enricher auto-queued after discovery completes

09:00  Tenacity cadence engine: checks all active leads for next touch due
       Routes follow-up tasks to Quill for leads past their wait window

09:30  Quill: cold email batch drafting (from enriched leads flagged by Scout)
       Blog post drafting fires Monday 9AM via content-engine schedule

10:00  HOA Facebook poster fires (separate from exec fleet, but monitored by Todd)

[Hourly]  Todd monitors run health: failed runs, cost anomalies, stuck tasks
           Scout signal monitors can fire any hour (hiring, permits, reviews)

14:00  Typical window: Ralph reviews morning content batch
       Todd re-routes approved drafts to send queue (after Steve confirms)

17:00  Any blocked tasks re-surfaced by Todd if unresolved

18:00  Daily debrief agent fires: operational assessment posted to Discord

[Overnight]  Pipeline runs continue: discovery, enrichment for next-day queue
             Brain distillation fires at 2AM: promotes approved outputs to KB Layer 4
```

---

## 4. Complete Task Lifecycle

From zero to a booked meeting — this is the full sequence every lead goes through.

```
STAGE 1: DISCOVERY
Scout discovers a GC company via Google Maps (Playwright, $0)
→ Inserted to cfo_leads with status='new', enrichment_status='pending'
→ Brain observation written: lead_signal for this company

STAGE 2: ENRICHMENT
Scout runs 5-step waterfall for the lead
→ Email found → enrichment_status='enriched', confidence >= 0.7
→ LinkedIn only → enrichment_status='partial'
→ No contact found → enrichment_status='failed'
→ Brain observation: contact_found (if enriched)

STAGE 3: SCORING
Scout or urgency_scorer scores the lead 0-100
→ HOT (>=70): flagged to Todd immediately
→ WARM (40-69): added to next outreach batch
→ WATCH (<40): held for 30 days, re-scored

STAGE 4: CONTENT DRAFTING
Todd routes HOT/WARM leads to Quill
Quill drafts cold email (Jake CFO voice, max 150 words, personalized hook)
→ Saved to cfo_outreach_sequences (status='draft', sequence_position=1)

STAGE 5: QA
Quill routes draft to Ralph
Ralph reviews: accuracy, brand voice, functionality, risk
→ PASS: approved for send queue
→ PASS WITH NOTES: approved with documented caveats
→ REJECT: back to Quill for full rewrite

STAGE 6: SEND APPROVAL
Todd packages approved drafts, surfaces to Steve
Steve confirms send authorization (Tier 3 — absolute hard stop without approval)
→ Drafts marked status='queued'

STAGE 7: OUTREACH SEND
Send pipeline (SendGrid or similar) delivers emails
Lead status updated to 'contacted'
Cadence engine activates: cadence_active=1, touch_number=1, next_touch_due calculated

STAGE 8: CADENCE (follow-up touches)
Cadence engine fires on schedule:
→ 7 days after touch 1 → Quill drafts touch 2 → Ralph → Todd → Steve → send
→ 14 days after touch 2 → Quill drafts touch 3 → Ralph → Todd → Steve → send
→ After touch 3: lead status='exhausted' unless signal detected

STAGE 9: REPLY HANDLING
Reply classifier (jake_reply_classifier) categorizes reply:
  INTERESTED → status='replied', cadence deactivated, Todd escalates to Steve (HOT)
  NOT_NOW → status='nurture', re-engage in 60 days
  WRONG_PERSON → status='bad_contact', find correct decision maker
  UNSUBSCRIBE → status='unsubscribed', all outreach blocked permanently
  BOUNCED → status='bounced', enrichment reset to find correct email

STAGE 10: MEETING BOOKING (INTERESTED leads only)
Steve confirms Calendly URL
Quill drafts meeting booking email (touch 3)
Ralph QA → Todd routes → Steve approves → send

STAGE 11: CONVERSION
Lead meets with Jake/Steve
Lead enters pilot program → status='pilot'
Quill drafts case study → Ralph QA → published as Owen CFO blog post
```

---

## 5. How Memory Works (Collective Brain)

Every agent writes to the Collective Brain after meaningful events. This creates a compounding intelligence layer — each run makes the next run smarter.

| Agent | What It Writes | Brain Layer | When |
|---|---|---|---|
| Scout | Market observation (region, company count, hit rate) | Layer 1 — Observations | After every discovery run |
| Scout | Lead signal (company found, signals detected) | Layer 1 | After discovery, per company |
| Scout | Contact found (email, method, confidence) | Layer 1 | After enrichment, per enriched lead |
| Jake contact enricher | contact_found observations | Layer 1 | After enrichment run |
| Todd | Pipeline health notes | Layer 1 | In morning briefing |
| Reply classifier | Feedback signal (approved/rejected/converted) | Layer 2 — Feedback | On every reply received |
| Reply classifier | Episode record (market, ERP, action, outcome, score) | Layer 3 — Episodes | On every reply |
| Meeting booker | Meeting booked episode (score=1.0) | Layer 3 | On every booked meeting |
| Brain distillation | Promotes high-score episodes to KB | Layer 4 — Knowledge Base | Nightly at 2AM |
| LLM agents | Read KB context before outreach drafting | Layer 4 (read) | Before drafting outreach |

**What Steve sees from the Brain:** The morning briefing includes brain stats (observations this week, feedback approved/rejected). The daily debrief includes KB entries used. Individual brain internals stay internal.

---

## 6. Cross-Agent Workflows

### Workflow A: New Lead Pipeline (Scout → Quill → Ralph → Steve → Send)
```
1. Scout fires discovery run (Monday 6AM or manual trigger)
2. Scout outputs: N new companies, M with email
3. Todd receives leads_ready handoff from Scout
4. Todd routes to Quill: "draft cold emails for lead_ids [...]"
5. Quill drafts batch → routes to Ralph
6. Ralph reviews each draft → PASS / PASS WITH NOTES / REJECT
7. Todd packages approved drafts → surfaces to Steve in briefing
8. Steve: "send it" → drafts marked status='queued' → send pipeline fires
9. Lead status updated to 'contacted' → cadence engine activates
```

### Workflow B: New Content Piece (Quill → Ralph → GitHub)
```
1. Monday 9AM schedule fires content-engine
2. Quill receives topic + keyword → drafts Owen CFO blog post
3. Quill routes to Ralph: "qa_content, blog_post"
4. Ralph: PASS WITH NOTES (unverified statistic flagged)
5. Todd surfaces the stat flag to Steve in briefing
6. Steve: "change to experience-based framing" → routes back to Quill for 1-line fix
7. Quill updates the line → re-routes to Ralph
8. Ralph: PASS (clean)
9. github_publisher special handler fires → post pushed to site repo → Netlify deploys (~60s)
```

### Workflow C: New Automation Request (Steve → Todd → Charlie → Ralph → Deploy)
```
1. Steve says: "I want a handler that automatically scores HOT leads hourly"
2. Todd receives request → classifies as BUILD → routes to Charlie with spec
3. Charlie: PROPOSAL returned within 5 minutes
   (new service file + SPECIAL_HANDLERS entry + schedule entry)
4. Todd surfaces PROPOSAL to Steve in next message
5. Steve: "build it" → Todd routes back to Charlie with approved=true
6. Charlie: DELIVERY returned (files created, how-to-test included)
7. Todd routes to Ralph for code QA
8. Ralph: PASS WITH NOTES (one catch pattern concern)
9. Todd surfaces Ralph's note to Steve
10. Steve: "fix the catch" → Charlie makes 1-line fix → re-routes to Ralph
11. Ralph: PASS
12. Todd: "Charlie, deploy to server — Steve has approved"
13. Charlie: node migration script, register schedule, restart server
```

---

## 7. What Steve Sees vs. What Stays Internal

| Visible to Steve | Internal Only |
|---|---|
| Morning briefing (7AM Discord embed) | Individual agent SOUL.md contents |
| HOT lead alerts (immediately) | Ralph QA checklists (unless escalated) |
| Tier 3 escalations | Agent-to-agent handoff messages |
| Daily debrief (6PM) | Brain Layer 1/2/3 internals (Steve sees summaries) |
| All PROPOSAL outputs (before any build proceeds) | Playwright pool status (unless circuit breaks) |
| All DELIVERY summaries (after build, before deploy) | Intermediate enrichment step failures |
| Any spend or send requests | Lead scoring calculations |
| Content pending send approval | Quill drafts before Ralph QA |
| Charlie's cost estimates | Internal routing decisions |

**Rule of thumb:** Steve sees inputs and outcomes. Agents handle the middle.

---

## 8. The Prime Directive

Every agent in this fleet exists to grow Steve's revenue. Not to complete tasks for their own sake. Not to optimize internal metrics. Not to demonstrate capability.

After every run — every discovery, every email drafted, every migration written, every QA review — every agent asks: **"Is there a way to turn this output into revenue for Steve?"**

If the answer is yes: identify the customer, the price, and the fastest test. Surface it to Todd.

If the answer is no: complete the task cleanly and move on.

This is not a motivational statement. It is an operating instruction. The fleet exists to find construction companies that need financial infrastructure help, get in front of the right person at each one, make a compelling case, and convert them into paying customers. Every piece of work that doesn't serve that chain — directly or indirectly — is waste.

Build less. Ship less. Route only what matters. And every morning at 7AM, make sure Steve can read the situation in 30 seconds and know exactly what needs to happen today.
