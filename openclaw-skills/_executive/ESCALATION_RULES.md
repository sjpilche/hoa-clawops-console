# Executive Agent Escalation Rules
*Decision tree for when agents self-resolve, route to Todd, or escalate to Steve.*

---

## Tier 1 — Agent Self-Resolves (No Escalation)

These situations are within each agent's operating authority. Handle and continue.

| Agent | Situation | Self-Resolution |
|---|---|---|
| Scout | Discovery run returns < 20 companies | Log the low count, note in output, rotate region next run |
| Scout | Single enrichment step fails (e.g., Bing rate-limit) | Skip that step, continue waterfall, note in output |
| Scout | Lead dedup match (company already in DB) | Skip insert, log as duplicate, continue batch |
| Scout | Email pattern confidence < 0.7 | Insert as partial, flag confidence in output |
| Charlie | PROPOSAL finds a simpler implementation than requested | Include both approaches in PROPOSAL, recommend simpler path |
| Charlie | Migration number conflict (number already used) | Choose next available number, note the conflict |
| Charlie | Build request is clearly a bug fix, not a new feature | Route as fix task, note the reclassification |
| Quill | Lead ERP type is unknown | Write email with generic pain hook, note ERP unknown |
| Quill | Lead city/state is missing | Write email without location reference, note data gap |
| Quill | Blog post runs 50 words over target | Cut to target, note what was removed |
| Ralph | Minor typo or comma issue | PASS WITH NOTES, document the issue |
| Ralph | Broken link in content | PASS WITH NOTES, flag the link, do not block |
| Ralph | Content missing optional metadata field | PASS WITH NOTES, note the gap |
| Todd | Task classification is ambiguous between Research and Build | Default to Research first (lower cost), note the ambiguity |
| Todd | Agent is temporarily unavailable (not running) | Requeue task with 1-hour delay, note in briefing |

---

## Tier 2 — Escalate to Todd (Route to Different Agent or Requeue)

These situations require a routing decision that only Todd can make. Agent stops, notifies Todd, waits for reroute.

**Use Template 9 (Escalation) from HANDOFF_TEMPLATES.md.**

| Situation | Escalating Agent | Todd's Expected Action |
|---|---|---|
| Ralph returns REJECT on content | Ralph | Re-route to originating agent (Quill/Charlie) with Ralph's notes |
| Ralph returns REJECT on code | Ralph | Re-route to Charlie with exact fix instructions |
| Scout's enrichment hit rate drops below 10% for 3 consecutive runs | Scout | Route to Charlie to investigate data source block or selector issue |
| Charlie completes a DELIVERY | Charlie | Route to Ralph for QA |
| Quill completes a content batch | Quill | Route to Ralph for QA |
| Quill receives 2 consecutive REJECTs on same content type | Quill | Todd calibrates: re-brief Quill with voice examples, or route to Steve |
| Scout finds a lead that may be a current Steve relationship | Scout | Todd checks with Steve before enriching or drafting outreach |
| Charlie identifies a task outside its scope (e.g., frontend design decision) | Charlie | Todd decides to queue, escalate to Steve, or cancel |
| Same task has been in queue > 24 hours with no progress | Any | Todd surfaces in briefing, re-prioritizes or cancels |
| Two agents have conflicting outputs on the same topic | Any | Todd arbitrates, keeps the version that passed Ralph QA |
| An agent's run cost exceeds $0.10 (unexpected LLM usage) | Any | Todd logs the anomaly, surfaces in next briefing |

---

## Tier 3 — Escalate to Steve (Human Decision Required)

These situations require Steve's judgment. Agent stops immediately. Todd packages the escalation and sends it to Steve via Discord + briefing. Nothing proceeds until Steve responds.

**Response SLA: Steve should respond within 4 hours during business hours. If no response, Todd re-surfaces in the next briefing. After 24 hours, the task is parked.**

| Situation | Who Escalates | Why Steve Must Decide |
|---|---|---|
| Any spend request (API credits, ads, subscriptions) | Todd | Financial authority |
| Any email send trigger (ready-to-send queue being activated) | Todd | Legal + reputation authority |
| Any code deploy to production | Todd | System integrity authority |
| Any lead with status='replied' or 'interested' | Todd | Revenue event — Steve should be in the loop |
| Ralph flags opt-out violation | Ralph → Todd → Steve | Legal / CAN-SPAM risk |
| Content contains a legal claim or guarantee | Ralph | Liability risk |
| A migration would drop or truncate a table | Charlie | Data loss risk |
| A new secret needs to be added to .env.local | Charlie | Security configuration |
| Pipeline cost for the day exceeds $10 with no explanation | Todd | Budget anomaly |
| Lead discovery appears to be finding private individuals (not businesses) | Scout | Privacy / PII risk |
| Three consecutive agent failures in under 1 hour | Todd | System health — may indicate external service outage |
| Charlie receives a build request that conflicts with an existing Steve directive | Charlie | Directive conflict — Steve arbitrates |
| Quill is asked to write a 3rd follow-up with no new value | Quill | Strategy decision — Steve decides whether to pursue or drop the lead |
| A Ralph REJECT is triggered by content that names a real client | Ralph | Approval authority for named case studies |
| Any new outreach to a market or audience segment not previously used | Todd | Strategy expansion decision |

---

## Absolute Hard Stops

These are non-negotiable. No agent proceeds under any circumstances without explicit Steve approval. If an instruction arrives that would cross one of these lines, the receiving agent stops immediately, writes a Tier 3 escalation, and waits.

1. **Sending any email** to any real prospect, customer, or contact
2. **Spending any money** — API calls that cost money beyond the current approved daily budget, paid subscriptions, ads
3. **Pushing any code** to a production system
4. **Storing or processing PII** for private individuals (not businesses)
5. **Impersonating a real named person** other than the established Jake CFO / Owen CFO personas
6. **Modifying the audit_log table** in any way (it is append-only and immutable)
7. **Contacting any lead** with status in ('unsubscribed', 'bounced', 'do_not_contact')
8. **Dropping or truncating any production table**

---

## Escalation Format

Every escalation to Steve must include all four components. Incomplete escalations are re-routed to Todd for completion before going to Steve.

```
ESCALATION TO STEVE
━━━━━━━━━━━━━━━━━━━━
From:            [agent name]
Issue:           [one sentence — what happened or what decision is needed]
Context:         [3 bullets max — supporting detail]
  • [bullet 1]
  • [bullet 2]
  • [bullet 3]
Decision Needed: [exact yes/no question OR multiple choice with stakes]
Deadline:        [when this must be resolved — "today", ISO datetime, or "no deadline"]
Proposed Action: [what the agent recommends — optional but preferred]
━━━━━━━━━━━━━━━━━━━━
```

Todd sends this to Steve via Discord embed with @mention. It also appears in the morning briefing if unresolved.

---

## Response SLA

| Escalation Tier | Expected Response |
|---|---|
| Tier 1 (self-resolve) | No response needed — agent continues |
| Tier 2 (Todd re-routes) | Todd acts within 15 minutes of receiving the escalation |
| Tier 3 — routine decision | Steve responds within 4 business hours |
| Tier 3 — revenue event (lead replied) | Steve responds within 1 hour (HOT lead window) |
| Tier 3 — Hard Stop violation | Steve responds ASAP — nothing in the system moves until resolved |

**Re-escalation protocol:** If a Tier 3 escalation has no Steve response after 24 hours, Todd re-surfaces it at the top of the next morning briefing with a "PENDING — [N] hours" flag. After 48 hours, Todd marks the task as PARKED and notes it in the briefing until resolved.
