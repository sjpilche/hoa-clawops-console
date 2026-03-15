# Executive Agent Handoff Templates
*Standard message format for all inter-agent communication in the ClawOps executive fleet.*

All handoffs use this structure. Required fields are marked with *. Optional fields may be omitted when not applicable.

---

## Template 1: Todd → Scout (Research Request)

```
FROM: todd
TO: scout
TASK_TYPE: research | discovery | enrichment | signal_monitoring | lead_scoring
PAYLOAD:
  task: "discovery"                    # or "enrichment", "score", "monitor_hiring", etc.
  region: "Tampa Bay, FL"              # for discovery; omit to use rotation
  limit: 80                            # max records to process
  source: "maps"                       # filter for enrichment (maps/permits/all)
  status_filter: "pending"             # for enrichment runs
  lead_ids: [201, 202, 203]            # for targeted scoring
  states: ["FL", "TX"]                 # for signal monitoring
PRIORITY: HIGH | NORMAL | LOW *
DEADLINE: "EOD today" | ISO datetime | null
NOTES: >
  Context that Scout needs to calibrate this run — e.g., "we've already hit Tampa heavily,
  consider St. Pete sub-region" or "focus on leads with ERP=unknown for scoring".
```

---

## Template 2: Todd → Charlie (Build Request)

```
FROM: todd
TO: charlie
TASK_TYPE: build | fix | refactor | scaffold | migrate
PAYLOAD:
  task: "build"                        # or "fix", "refactor", "scaffold"
  spec: >                              # plain language spec — be specific
    Add a new special handler for jake_permit_scanner. Calls jakePermitScanner.js.
    Accepts counties (array) and limit (integer). Returns permits_scanned, leads_inserted.
  complexity: "LOW"                    # estimate if known; Charlie will re-estimate
  files_to_modify: ["server/routes/runs.js"]
  deadline: null
  approved: false                      # if true, skip PROPOSAL and build immediately
  context: >
    jakePermitScanner.js already exists at server/services/. Migration 033 (permit_date
    column) is also needed — treat as separate task unless you want to bundle.
PRIORITY: NORMAL *
DEADLINE: "This sprint" | null
NOTES: >
  Charlie should propose before building. If approved=true, go straight to DELIVERY.
  All code goes to Ralph before deployment.
```

---

## Template 3: Todd → Quill (Content Request)

```
FROM: todd
TO: quill
TASK_TYPE: cold_email | cold_email_batch | follow_up | meeting_booking | blog_post | linkedin_post | facebook_post | case_study
PAYLOAD:
  task: "cold_email"                   # or "cold_email_batch", "blog_post", etc.
  lead_id: 201                         # single lead (omit for blog/social)
  lead_ids: [201, 202, 203]            # for batch (omit for single)
  voice: "jake"                        # jake | owen | clawops
  sequence_position: 1                 # 1=first touch, 2=follow-up, 3=meeting booking
  topic: "construction cash flow Q4"  # for blog/social posts
  keyword: "construction cash flow"    # for blog posts (SEO target)
  days_since_last_touch: 7             # for follow-up tasks
  original_subject: "Gulf Coast — your QB is costing you money"  # for follow-ups
  reply_text: "Sounds interesting..."  # for meeting booking tasks
  calendly_url: "https://calendly.com/jake-cfo/30min"  # for meeting booking
PRIORITY: NORMAL *
DEADLINE: "by noon today" | null
NOTES: >
  Lead context summary — ERP types, market distribution, enrichment confidence issues.
  e.g., "Lead 204 has pattern-guess email (0.62 confidence) — flag in draft, hold for
  Steve approval before including in send batch."
  All content goes to Ralph before being marked ready-to-send.
```

---

## Template 4: Scout → Todd (Leads Ready)

```
FROM: scout
TO: todd
TASK_TYPE: leads_ready | hot_lead_alert | enrichment_complete | signal_found
PAYLOAD:
  event: "enrichment_complete"         # or "discovery_complete", "hot_lead", "signal_found"
  region: "Tampa Bay, FL"
  stats:
    leads_with_email: 5
    leads_partial: 9
    leads_failed: 6
    hot_leads: 2
  lead_ids_ready: [201, 203, 205, 207, 208]  # leads with confirmed email, ready for Quill
  lead_ids_partial: [202, 204, 206]           # LinkedIn only — separate decision needed
  hot_lead_ids: [201, 203]                    # score >= 70 — flag to Steve
  flags:
    - "Lead 204 (Suncoast Builders): email is pattern-guess, confidence 0.62 — verify before send"
    - "Lead 206 (Tampa Bay Reno): company name matched 3 different entities on Bing"
PRIORITY: HIGH (if hot_leads > 0) | NORMAL *
DEADLINE: null
NOTES: >
  Enrich run took 4m 12s. Playwright pool healthy. Dedup rate was 25/87 (28%) in this
  market — consider rotating to Clearwater or Bradenton sub-region for next discovery run.
```

---

## Template 5: Charlie → Ralph (Code Ready for QA)

```
FROM: charlie
TO: ralph
TASK_TYPE: qa_code
PAYLOAD:
  delivery:
    feature_name: "jake_permit_scanner special handler"
    status: "COMPLETE"
    files_created: ["server/services/jakePermitScanner.js"]
    files_modified: ["server/routes/runs.js"]
    db_migration: null
    how_to_test:
      - "POST /api/runs/{run_id}/confirm with permit_scanner agent"
      - "node -e \"require('./server/services/jakePermitScanner').runPermitScanner({limit:3}).then(console.log)\""
    known_limitations:
      - "Travis County TX portal not yet supported — returns empty array for TX"
  code_snippets:
    - file: "server/routes/runs.js"
      lines: "387-401"
      code: |
        jake_permit_scanner: async ({ message, runId, agent }) => { ... }
PRIORITY: NORMAL *
DEADLINE: null
NOTES: >
  This is a LOW complexity handler following the jake_bid_scraper non-fatal catch pattern.
  The decision to mark failed scrapes as completed (not failed) is intentional — confirm
  Ralph agrees or flags for Steve review.
```

---

## Template 6: Quill → Ralph (Content Ready for QA)

```
FROM: quill
TO: ralph
TASK_TYPE: qa_content
PAYLOAD:
  content_type: "cold_email"          # or "blog_post", "linkedin_post", etc.
  lead_id: 201                         # required for email types
  content:
    subject: "Gulf Coast — your QuickBooks is costing you money"
    body: "Dave —\n\nYou're running construction projects on QuickBooks..."
    word_count: 68
    voice: "jake"
    cta: "20-minute demo"
    saved_to_sequence_id: 1047
  flags:
    - "Lead ERP type confirmed as QuickBooks — used in body"
    # or empty array if no flags
PRIORITY: NORMAL *
DEADLINE: null
NOTES: >
  Clean draft — no concerns. Or: "Lead 204 has low-confidence email (0.62) — noted in
  draft. Awaiting Steve decision on whether to include in send batch."
```

---

## Template 7: Ralph → Todd (QA Result)

```
FROM: ralph
TO: todd
TASK_TYPE: qa_result
PAYLOAD:
  verdict: "PASS"                      # PASS | PASS WITH NOTES | REJECT
  content_type: "cold_email"
  submitted_by: "quill"                # originating agent
  lead_id: 201                         # if applicable
  review_id: "ralph-review-2026-03-13-001"
  notes:
    - "Minor: ERP type not confirmed in DB but referenced in email — acceptable"
  action_required: null                # or specific fix instructions for REJECT
  escalate_to_steve: false             # true for opt-out violations, legal risk
  routed_to: "todd"                    # always todd; todd decides next routing
PRIORITY: HIGH (if REJECT or escalate_to_steve=true) | NORMAL *
DEADLINE: null
NOTES: >
  PASS — approved for send queue. Or: REJECT — full rewrite required (details in action_required).
  Route back to quill with action_required block attached.
```

---

## Template 8: Todd → Steve (Daily Briefing)

```
FROM: todd
TO: steve
TASK_TYPE: daily_briefing
PAYLOAD:
  date: "2026-03-13"
  status: "CLEAR"                      # CLEAR | ATTENTION NEEDED | BLOCKED
  pipeline:
    leads_discovered_yesterday: 31
    leads_enriched_yesterday: 18
    emails_sent_yesterday: 12
    replies_yesterday: 1
    cost_yesterday_usd: 1.84
  agent_health:
    - { agent: "scout", status: "healthy" }
    - { agent: "charlie", status: "healthy" }
    - { agent: "quill", status: "healthy" }
    - { agent: "ralph", status: "healthy" }
  overnight_runs:
    - { agent: "jake-construction-discovery", status: "completed", summary: "31 new GCs, Denver CO" }
    - { agent: "jake-contact-enricher", status: "completed", summary: "18/31 enriched, 6 emails found" }
  hot_leads: []                        # array of {lead_id, company, contact, reply_snippet}
  top_priority_today: >
    Route 6 Denver leads with email to Quill for cold email batch (Jake CFO voice)
  open_blockers: []                    # or array of {agent, issue, impact, recommended_action}
  decisions_needed: []                 # or array of {issue, options, deadline}
PRIORITY: NORMAL *
DEADLINE: "7:05 AM daily"
NOTES: >
  Briefing posted to Discord. Reply with any priority overrides or decisions.
```

---

## Template 9: Any Agent → Todd (Escalation)

```
FROM: [agent_name]                     # scout | charlie | quill | ralph
TO: todd
TASK_TYPE: escalation
PAYLOAD:
  urgency: "IMMEDIATE"                 # IMMEDIATE | HIGH | NORMAL
  issue: >                             # one sentence — what happened
    Lead 99 was drafted for outreach despite having status='unsubscribed' in the DB.
  context:
    - "Lead 99: Lone Star Contracting, Sarah Patel — status set to unsubscribed 2026-02-28"
    - "Quill drafted cold_email sequence_position=1 without checking lead status"
    - "Ralph caught the violation in QA — email was never sent"
  decision_needed: >                   # exact question for Todd (and possibly Steve)
    Should we add a pre-flight lead status check to Quill's cold_email task,
    or handle this at the DB query level (filter out unsubscribed leads from the input)?
  escalate_to_steve: true              # true if human decision required
  deadline: "today"
  proposed_action: >                   # optional — what the escalating agent recommends
    Route to Charlie to add a pre-flight check in Quill's cold_email handler that
    rejects leads with status in ('unsubscribed', 'bounced') before drafting.
PRIORITY: HIGH *
DEADLINE: "today"
NOTES: >
  No email was sent — this is a prevention fix, not an incident response.
  But it should be patched before next outreach batch runs.
```
