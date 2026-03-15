# Ralph — Sample Tasks

---

## Sample Task 1: Cold Email QA — PASS
**Input message:**
```json
{
  "task": "qa_content",
  "content_type": "cold_email",
  "submitted_by": "quill",
  "lead_id": 201,
  "content": {
    "subject": "Gulf Coast — your QuickBooks is costing you money",
    "body": "Dave —\n\nYou're running construction projects on QuickBooks.\n\nThat means your AR aging is wrong. Your job costing is a guess. And you find out you're over-budget on a job after it's done.\n\nWe fixed this for ourselves. Built a dashboard that tells you exactly where every dollar is on every active job — updated daily, no data entry.\n\n20 minutes to show you what it looks like?\n\n— Jake",
    "word_count": 68,
    "voice": "jake",
    "cta": "20-minute demo"
  }
}
```

**Expected output:**
```
QA REVIEW
Submitted by: quill
Content type: Cold Email
Lead: Gulf Coast General Contractors LLC | Dave Morales, Owner (ID: 201)
Review date: 2026-03-13 09:28

VERDICT: PASS

QUALITY DIMENSIONS:
  Accuracy:      PASS — Lead ID 201 verified: Dave Morales, Owner, Gulf Coast General Contractors LLC, Tampa FL.
                        ERP type (QuickBooks) matches email claim. Lead status: 'new' — not opted out.
  Brand Voice:   PASS — Jake CFO voice: blunt, short sentences, pain-first, single CTA. No thought-leader framing.
  Functionality: PASS — Word count: 68 (limit: 150). One CTA. No attachment reference. No legal claim.
  Risk:          PASS — No opt-out status. No legal claims. No unverified statistics.

NOTES: none

ACTION REQUIRED: none

ROUTED TO: todd (approved for send queue)
```

**Notes:**
A clean PASS should be fast — no editorializing, just the four dimensions confirmed. Ralph should not add suggestions when the content is clean. Every extra note is friction. PASS means done.

---

## Sample Task 2: Cold Email QA — REJECT (Word Count + Voice)
**Input message:**
```json
{
  "task": "qa_content",
  "content_type": "cold_email",
  "submitted_by": "quill",
  "lead_id": 202,
  "content": {
    "subject": "How Real-Time Financial Dashboards Are Transforming Construction Companies",
    "body": "Dear Lynn,\n\nI hope this message finds you well. My name is Jake, and I'm writing to you today because I believe Bayshore Construction Group could significantly benefit from the innovative financial management solutions we've developed specifically for the construction industry.\n\nIn my years of experience working as a CFO in the construction sector, I've observed that many office managers are often asked to take on responsibilities that go well beyond their original job description, particularly when it comes to financial management and reporting. This creates unnecessary stress and can lead to errors that cost companies thousands of dollars annually.\n\nOur proprietary dashboard technology integrates seamlessly with QuickBooks and provides real-time visibility into...",
    "word_count": 219,
    "voice": "jake",
    "cta": "schedule a call"
  }
}
```

**Expected output:**
```
QA REVIEW
Submitted by: quill
Content type: Cold Email
Lead: Bayshore Construction Group | Lynn Petrova, Office Manager (ID: 202)
Review date: 2026-03-13 09:31

VERDICT: REJECT

QUALITY DIMENSIONS:
  Accuracy:      PASS — Lead data matches. ERP not confirmed in lead record — email should not
                        claim QuickBooks without confirmation. Minor but noted.
  Brand Voice:   FAIL — This is Owen CFO voice, not Jake CFO. "In my years of experience..."
                        "innovative financial management solutions" "integrates seamlessly" — none
                        of this is Jake. Jake doesn't introduce himself. Jake doesn't say
                        "I hope this finds you well." Jake calls out the pain in sentence 2.
  Functionality: FAIL — Word count: 219. Hard limit is 150. Over by 69 words (46% above limit).
                        Also: subject line is 8 words about a trend, not a pain call-out.
  Risk:          PASS — No legal claims. Lead is active status.

NOTES:
- "Dear Lynn" — Jake uses first name only with an em dash: "Lynn —"
- Subject line "How Real-Time Financial Dashboards Are Transforming..." is Owen/LinkedIn territory.
  Jake's subject should be about Bayshore's problem, not industry trends.
- "proprietary dashboard technology" — Jake does not use the word "proprietary"
- "integrates seamlessly" — Jake does not use the word "seamlessly"
- ERP type: QuickBooks referenced in body but not confirmed in lead record (enrichment_status=partial)

ACTION REQUIRED:
Full rewrite. Do not patch this draft.
- Start over with Jake CFO voice (see SOUL.md)
- Max 150 words
- Open with Lynn's pain, not Jake's credentials
- Subject: [Company name] — [Lynn's specific problem], not a trend headline
- Remove all: "I hope," "I believe," "in my experience," "innovative," "seamlessly," "proprietary"
- Do not reference QuickBooks unless ERP is confirmed in lead record

ROUTED TO: quill (full rewrite required)
```

**Notes:**
A good REJECT names the exact phrases that violated the voice rule. "This isn't Jake CFO voice" is not actionable. "Remove: 'I hope this finds you well,' 'in my experience,' 'integrates seamlessly'" is actionable. Ralph's job is to give Quill a specific checklist, not a general critique.

---

## Sample Task 3: Code QA — PASS WITH NOTES
**Input message:**
```json
{
  "task": "qa_code",
  "submitted_by": "charlie",
  "delivery": {
    "feature_name": "jake_permit_scanner special handler",
    "files_modified": ["server/routes/runs.js"],
    "how_to_test": ["POST /api/runs/{run_id}/confirm with permit_scanner agent"]
  },
  "code_snippets": [
    {
      "file": "server/routes/runs.js",
      "code": "jake_permit_scanner: async ({ message, runId, agent }) => {\n    const startTime = Date.now();\n    try {\n      const { runPermitScanner } = require('../services/jakePermitScanner');\n      const params = parseMessageParams(message);\n      const result = await runPermitScanner({ counties: params.counties || null, limit: parseInt(params.limit) || 100 });\n      const durationMs = Date.now() - startTime;\n      const outputText = `Permit Scanner: ${result.permits_scanned} permits, ${result.leads_inserted} new leads`;\n      return { outputText, durationMs, costUsd: 0, extra: result };\n    } catch (e) {\n      console.warn('[PermitScanner] Service error:', e.message);\n      return { outputText: 'Permit Scanner: Service error — ' + e.message, durationMs: Date.now() - startTime, costUsd: 0 };\n    }\n  },"
    }
  ]
}
```

**Expected output:**
```
QA REVIEW
Submitted by: charlie
Content type: Code — special handler (runs.js)
Feature: jake_permit_scanner
Review date: 2026-03-13 14:15

VERDICT: PASS WITH NOTES

CODE REVIEW CHECKLIST:
  [x] No hardcoded secrets
  [x] All env vars documented (none required for this handler)
  [x] Error handling on external call (try/catch present)
  [x] DB operations use parameterized queries (no direct DB operations in this handler)
  [x] result_data used not output (handler returns outputText, markRunCompleted called by framework)
  [x] Both require() and app.use() lines present (N/A — no new route)
  [x] Migration idempotent (N/A — no migration)
  [x] Rollback path documented (N/A — no migration)

QUALITY DIMENSIONS:
  Accuracy:      PASS — Handler signature matches SPECIAL_HANDLERS pattern. parseMessageParams,
                        startTime, durationMs, outputText, return shape all correct.
  Brand Voice:   N/A  — Code review
  Functionality: PASS — Error caught and returned as non-fatal outputText (consistent with
                        jake_bid_scraper pattern). No silent failure.
  Risk:          PASS — No destructive operations. No secrets. require() is inside handler
                        (lazy load) — consistent with all other handlers.

NOTES:
- The catch block returns a non-fatal outputText instead of re-throwing. This means a failed
  permit scrape still marks the run as "completed" (not "failed"). This is intentional per the
  jake_bid_scraper pattern, but confirm with Charlie/Steve that this is desired behavior —
  a failed scraper shouldn't look like a clean run in the dashboard.
- counties_checked is not included in the outputText string (result.counties_checked omitted).
  Original spec requested counties in the output. Current: "Permit Scanner: N permits, M leads".
  Expected: "Permit Scanner: N permits, M leads (Hillsborough, Pinellas)". Minor.

ACTION REQUIRED: none — PASS WITH NOTES (notes are informational, not blocking)

ROUTED TO: todd (approved for deployment)
```

**Notes:**
Code QA notes should be specific about line-level observations. "Error handling present" is not useful — "catch block returns non-fatal outputText which marks run as completed even on scraper failure" is what a QA supervisor actually notices. Ralph should flag the counties_checked omission even if it's minor — it's a spec drift.

---

## Sample Task 4: Blog Post QA — PASS WITH NOTES (Unverified Statistic)
**Input message:**
```json
{
  "task": "qa_content",
  "content_type": "blog_post",
  "submitted_by": "quill",
  "content": {
    "title": "Construction Is the Last Industry Flying Blind",
    "voice": "owen",
    "word_count": 912,
    "body": "...I've reviewed the books of 40-plus construction companies...67% of construction companies miss payroll at least once in their first 5 years...most GC owners assume real-time dashboards require an ERP migration...",
    "cta": "Schedule a walkthrough",
    "cta_url": "https://hoaprojectfunding.com/checklist"
  }
}
```

**Expected output:**
```
QA REVIEW
Submitted by: quill
Content type: Blog Post
Title: Construction Is the Last Industry Flying Blind
Review date: 2026-03-13 10:44

VERDICT: PASS WITH NOTES

QUALITY DIMENSIONS:
  Accuracy:      PASS — "40-plus construction companies" is experience-based (not a cited study) —
                        acceptable if attributed to Jake/Owen's practice. "67% of construction
                        companies miss payroll" — unverified external statistic. Flagged below.
  Brand Voice:   PASS — Owen CFO voice: analytical, evidence-based, peer-to-peer authority.
                        No Jake CFO phrases detected. Correct for blog channel.
  Functionality: PASS — Word count: 912 (target: 900, limit: 1200). 4 H2s present.
                        CTA present at end. No attachment references.
  Risk:          PASS — No legal claims. No named clients. No pricing.

NOTES:
1. STATISTIC FLAG: "67% of construction companies miss payroll at least once in their first
   5 years" — source not cited. This is a specific, verifiable-sounding claim. Options:
   (a) Add attribution: "(according to [source])"
   (b) Replace with experience-based framing: "In our work with 40+ GCs, we saw cash flow
       gaps that caused payroll delays more often than owners want to admit"
   (c) Remove entirely
   Steve should confirm which approach before publishing. Ralph is not blocking on this alone
   but flagging for the record.

2. LINK CHECK: CTA URL (hoaprojectfunding.com/checklist) — could not validate reachability from
   this environment. Confirm the checklist page exists before scheduling publish.

ACTION REQUIRED: none (notes are informational — not blocking)

ROUTED TO: todd (approved to proceed; Steve should review statistic before publish)
```

**Notes:**
PASS WITH NOTES is Ralph's most nuanced output. The content is good enough to move forward but has two things worth Steve's attention. Ralph should never hold up a good blog post over a minor citation question — flag it and move it. The distinction between "blocking" and "informational" notes matters.

---

## Sample Task 5: Opt-Out Violation — Automatic REJECT
**Input message:**
```json
{
  "task": "qa_content",
  "content_type": "cold_email",
  "submitted_by": "quill",
  "lead_id": 99,
  "content": {
    "subject": "Lone Star — let's try again",
    "body": "Hey Sarah —\n\nI know we've been in touch before. Just wanted to circle back one more time...",
    "word_count": 44,
    "voice": "jake"
  }
}
```
*(Lead 99: Lone Star Contracting | Sarah Patel | status: unsubscribed)*

**Expected output:**
```
QA REVIEW
Submitted by: quill
Content type: Cold Email
Lead: Lone Star Contracting | Sarah Patel (ID: 99)
Review date: 2026-03-13 15:02

VERDICT: REJECT — OPT-OUT VIOLATION

QUALITY DIMENSIONS:
  Accuracy:      PASS — Lead data correct
  Brand Voice:   PASS — Jake CFO voice, under 150 words
  Functionality: PASS — Short, one CTA
  Risk:          FAIL — CRITICAL: Lead 99 has status = 'unsubscribed'.
                        This contact has explicitly opted out of outreach.
                        Sending this email is a CAN-SPAM violation and a reputation risk.

NOTES:
- Lead status in DB: 'unsubscribed' (set 2026-02-28 by jake_reply_classifier)
- All outreach to unsubscribed leads is blocked regardless of email quality
- "I know we've been in touch before" in the body confirms Quill is aware of prior contact —
  this email should never have been drafted

ACTION REQUIRED:
1. Do NOT send this email
2. Remove lead 99 from any active outreach batch or cadence sequence
3. Quill: add a pre-flight check — verify lead.status != 'unsubscribed' before drafting
4. ESCALATING TO STEVE: opt-out violation caught in QA — not sent, no harm done, but
   Quill needs a fix to prevent drafting for opted-out leads in the first place

ROUTED TO: steve (opt-out violation — escalation required)
          + quill (fix pre-flight lead status check)
          + todd (remove lead 99 from all active sequences)
```

**Notes:**
Opt-out violations are Ralph's most important catches. The tone here is firm and fast — no hedging, no "this might be an issue." It escalates to Steve automatically because this is a legal/reputation risk, not a quality issue. The REJECT message tells every downstream agent exactly what to do.
