# Todd — Sample Tasks

---

## Sample Task 1: Morning Briefing
**Input message:**
```
{ "task": "morning_briefing" }
```

**Expected output:**
```
STATUS: CLEAR
AS OF: 2026-03-13 07:00

BRIEFING — Friday, March 13

Pipeline:
- Leads discovered yesterday: 31 (Denver, CO — Scout)
- Leads enriched: 18 (58% from yesterday's discovery batch)
- Emails sent: 0 (12 drafts sitting in QA — Ralph needs to run)
- Replies received: 1 — INTERESTED (Apex Roofing, Dan Mercer — see HOT LEAD below)
- Cost yesterday: $1.84

Agent Health:
- All 5 executive agents: healthy
- jake-contact-enricher: completed 3 runs, 0 failures
- Playwright pool: healthy (0 circuit breaker events)

Overnight Runs:
- jake-construction-discovery: COMPLETED — 31 new GCs, Denver CO
- jake-contact-enricher: COMPLETED — 18/31 enriched, 6 emails found
- brain-distillation: COMPLETED — 4 new KB entries

HOT LEAD ALERT:
- Apex Roofing (Dan Mercer, Owner) replied: "sounds interesting, let's talk"
- Status updated to 'replied'
- Action: Route to Quill for meeting booking email — needs Calendly URL from Steve

Top Priority Today:
Route 6 Denver leads with email to Quill for cold email batch (Jake CFO voice)

Open Blockers:
- 12 cold email drafts in sequence table at status='draft' — Ralph has not run QA. Age: 18 hours.
```

**Notes:**
A good morning briefing run in under 30 seconds, posts to Discord, and gives Steve exactly one action item. A bad run is one where Todd says "everything looks good" when there are 12 stale QA items.

---

## Sample Task 2: Task Routing
**Input message:**
```
{
  "task": "Scout found 8 new Tampa GC leads with emails. Draft cold outreach for all 8.",
  "urgency": "NORMAL",
  "context": { "lead_ids": [201, 202, 203, 204, 205, 206, 207, 208] },
  "requester": "scout"
}
```

**Expected output:**
```
STATUS: CLEAR
AS OF: 2026-03-13 09:14

TASK ROUTING

Task: Draft cold outreach for 8 Tampa GC leads with verified emails
Routed To: quill
Priority: NORMAL
Deadline: none (today preferred — leads are fresh)
Notes:
- 8 lead_ids: [201, 202, 203, 204, 205, 206, 207, 208]
- Use Jake CFO voice
- All 8 have verified emails (method: direct_scrape or bing)
- ERP types: QuickBooks (5), unknown (3) — personalize ERP hook for the 5 QB leads
- After Quill completes batch, route to Ralph for QA before any send
```

**Notes:**
Good routing adds context Quill actually needs (voice, ERP breakdown) rather than just forwarding the lead IDs. Todd should never just pass through raw data without adding operational context.

---

## Sample Task 3: Blocker Surface
**Input message:**
```
Scout's Playwright browser has been restarting every 3 leads for the last 2 hours.
Discovery run for Phoenix AZ is at 12 companies — expected 80+.
Run ID: run-2026-03-13-phoenix-001.
```

**Expected output:**
```
STATUS: ATTENTION NEEDED
AS OF: 2026-03-13 11:47

BLOCKER

Agent: scout (via jake-construction-discovery)
Run ID: run-2026-03-13-phoenix-001
Issue: Playwright browser restarting every 3 leads — possible memory leak or Google Maps anti-bot block
Impact: Phoenix AZ discovery run stalled at 12/80+ expected companies. No new leads entering pipeline today.
Recommended Action:
1. Check server/services/playwrightPool.js circuit breaker — if tripped, 10-minute cooldown is in progress
2. If circuit is open: wait for cooldown, then re-run discovery with limit: 20 to test stability
3. If browser crashes persist after cooldown: Charlie should investigate — likely Google Maps session expiry or selector change
Severity: MEDIUM (pipeline continues from existing enriched leads; new discovery not urgent until Monday)

Escalate to Steve? NO — this is within Charlie's scope to fix. Will surface if unresolved by EOD.
```

**Notes:**
Good blocker reports give an exact recommended action, not just a description. Todd should never just relay the error — he should already have a hypothesis and a path forward.

---

## Sample Task 4: HOT Lead Escalation to Steve
**Input message:**
```
{
  "from_agent": "ralph",
  "issue": "Cold email draft for Apex Roofing approved — lead Dan Mercer has status=replied",
  "context": [
    "Lead ID 147 — Apex Roofing, Dan Mercer (Owner), Austin TX",
    "Reply: 'This is exactly what we need. When can we talk?'",
    "Meeting booking email drafted, pending Calendly URL"
  ],
  "decision_needed": "Confirm Calendly URL to insert in meeting booking email",
  "deadline": "today"
}
```

**Expected output:**
```
STATUS: ATTENTION NEEDED
AS OF: 2026-03-13 13:02

ESCALATION TO STEVE

Issue: HOT lead ready to book — needs your Calendly link

Context:
- Lead: Dan Mercer, Owner, Apex Roofing (Austin, TX)
- Reply: "This is exactly what we need. When can we talk?"
- Quill has drafted the meeting booking email — Ralph approved it
- One blocker: Calendly URL not configured in .env.local (CALENDLY_URL placeholder in email)

Decision Needed:
Reply with your Calendly URL (or paste it here). Todd will drop it into the email and route to send queue.

Deadline: Today — lead is warm, 24 hours is the window before it cools

Discord alert: SENT
```

**Notes:**
HOT lead escalations should be Steve's fastest reads. This is a revenue event. Todd's job is to make the decision trivially easy — one URL and the deal moves.

---

## Sample Task 5: Ralph REJECT Re-Route
**Input message:**
```
{
  "from_agent": "ralph",
  "verdict": "REJECT",
  "content_type": "cold_email",
  "original_agent": "quill",
  "lead_id": 148,
  "action_required": "Rewrite from scratch. Jake CFO voice. Max 150 words. Current draft is 214 words in Owen CFO voice."
}
```

**Expected output:**
```
STATUS: CLEAR
AS OF: 2026-03-13 14:33

TASK ROUTING (RE-ROUTE — RALPH REJECT)

Task: Rewrite cold email for lead 148 — REJECT from Ralph
Routed To: quill
Priority: HIGH (re-route same day)
Deadline: within 2 hours

Ralph's Notes Attached:
- Word count: 214 (hard limit: 150)
- Voice: Owen CFO detected (thought-leader tone) — task requires Jake CFO
- Required fix: Full rewrite. Not a patch. Start from the lead's pain, not your credentials.
- Specific phrases to remove: "In my experience advising construction executives..." → replace with direct call-out

Context for Quill:
- Lead 148: Lone Star Contracting | Sarah Patel, Controller | San Antonio, TX | ERP: unknown
- First touch — no prior contact
- Jake CFO voice: blunt, short, direct pain call-out, single CTA

This is Quill's first REJECT on this content type this week — no pattern alert.
```

**Notes:**
Re-routes should arrive at Quill with Ralph's notes already attached and the fix clearly stated. Quill should not have to re-read the original Ralph review. Todd distills it into an actionable brief.
