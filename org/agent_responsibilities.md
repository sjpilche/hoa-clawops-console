# Agent Responsibilities Matrix
*RACI-style ownership map and boundary rules for the ClawOps agent fleet.*
*Last updated: 2026-03-13*

---

## RACI Key
- **R** — Responsible (does the work)
- **A** — Accountable (owns the outcome, ensures it happens)
- **C** — Consulted (provides context or input)
- **I** — Informed (notified of result)
- **—** — Not involved

---

## Responsibility Matrix

| Role | Research | Lead Gen | Outreach | Content | Finance | Operations | Escalate to Steve |
|------|----------|----------|----------|---------|---------|------------|-------------------|
| **Todd (Chief of Staff)** | A | A | A | A | A | A | Routes all escalations |
| **Lead Discovery Agent** | R | R | — | — | — | I | >50 qualified prospects in new market |
| **Pain Signal Monitor** | R | C | — | — | — | I | Signal score >=80 |
| **Competitive Intel Agent** | R | — | — | C | C | I | Competitor price change; major gap identified |
| **HOA Intel Monitor** | R | C | — | — | — | I | HOT tier community found |
| **Mgmt Research Suite** | R | C | — | — | — | I | Decision maker contact found for priority target |
| **Content Writer** | C | — | — | R | — | I | — |
| **Lead Generator** | C | R | — | — | I | I | Named lead with score >=80 |
| **Contact Enricher** | C | R | — | — | — | I | — |
| **Social Media Manager** | — | — | — | R | — | I | — |
| **Outreach Agent** | C | C | R | — | C | I | — (drafts only, no send) |
| **Follow-Up Agent** | — | — | R | — | — | I | — (drafts only, no send) |
| **Reply Classifier** | — | — | R | — | — | I | INTERESTED reply always |
| **Meeting Booker** | — | — | R | — | — | I | INTERESTED reply (triggers this agent) |
| **Content Repurposer** | — | — | — | R | — | I | — |
| **Opportunity Evaluator** | C | C | — | — | R | I | Urgency score >=90 on any lead |
| **Lead Dossier Generator** | C | C | C | — | R | I | — |
| **Pricing Analyzer** | C | — | — | — | R | I | Pricing gap identified |
| **ROI Calculator** | — | — | C | — | R | I | — |
| **Daily Debrief** | I | I | I | I | I | R | Always delivered to Steve directly |
| **Morning Digest** | I | I | I | I | I | R | Always delivered to Steve directly |
| **Pipeline Director** | I | I | I | — | C | R | Stall detected >48h; budget cap hit |
| **Pipeline State Tracker** | I | I | I | — | — | R | Stalled leads found (Discord alert) |
| **Tenacity Cadence Engine** | — | — | C | — | — | R | Cadence exhausted with no reply (12 touches, no response) |
| **Brain Distillation** | C | C | C | C | C | R | KB entry count drops unexpectedly |
| **CRM Sync** | — | I | I | — | I | R | — |

---

## Responsibility Boundaries

### What Each Department Owns Exclusively

**Research Department** owns:
- All data acquisition from external sources (Google Maps, LinkedIn, county portals, CAI directories)
- All signal scoring and tier classification
- HOA meeting minutes analysis
- Competitor monitoring
- Market sizing and geo-target selection

**Engineering Department** owns:
- New agent scaffolding and service file creation
- SQLite migration design and execution
- OpenClaw extension and tool design
- Schedule and pipeline architecture

**Marketing Department** owns:
- All outreach draft generation (email, LinkedIn, SMS)
- All content creation and publishing
- Social media scheduling and posting
- Reply processing and classification
- Lead enrichment (contact-level, not company-level)

**Finance Department** owns:
- Urgency and fit scoring algorithms
- Lead dossier assembly
- Pricing benchmarks
- ROI modeling for outreach personalization

**Operations Department** owns:
- Cron schedule management
- Run health monitoring and failure detection
- Pipeline stage computation
- Cadence sequencing and touch scheduling
- Collective Brain distillation and KB maintenance
- CRM sync and external reporting

---

### What Requires Cross-Department Coordination

| Workflow | Departments Involved | Handoff Point |
|----------|---------------------|---------------|
| Discovery → Outreach | Research → Marketing | Research inserts lead; Marketing enricher picks it up when enrichment_status='pending' |
| Enrichment → Dossier | Marketing → Finance | Enricher sets enrichment_status='enriched'; Dossier Generator runs on enriched leads |
| Dossier → Outreach Draft | Finance → Marketing | Dossier stored in DB; Outreach Agent reads it before drafting |
| Content → Social | Marketing (Content) → Marketing (Social) | Content inserted with status='approved'; Social Manager reads approved pieces |
| Signal → Lead | Research → Marketing | Signal monitor updates pilot_fit_score; Lead Generator uses score in rotation priority |
| Reply → Follow-Up | Marketing (Classifier) → Marketing (Follow-Up) | Classifier marks status; Follow-Up checks for 5-day-no-reply pattern |
| Episode → KB | Marketing (Outreach/Reply) → Operations (Brain) | Reply Classifier records episodes; Brain Distillation promotes high-score episodes to KB |
| Urgency → Pipeline Director | Finance → Operations | Urgency Scorer updates scores; Pipeline Director reads scores to prioritize dispatch |

---

### What Always Escalates to Steve (Non-Negotiable)

The following situations require Steve's explicit approval before any agent takes action. Agents must halt, record a Discord alert, and wait.

| Trigger | Why It Escalates | Expected Response Time |
|---------|-----------------|----------------------|
| **INTERESTED reply received** | A human said yes — only Steve closes this | <1 hour |
| **Any email or message send** | All external communications require Steve approval on drafts | Before send, no deadline |
| **Spend decision >$50** | Outside pre-approved per-run budget cap | Before action |
| **New market with >50 qualified leads** | Potential campaign justifies Steve's strategic input | Same day |
| **Urgency score >=90 on any lead** | High-value opportunity, prioritize outreach now | Same day |
| **Competitor price change detected** | May require immediate positioning response | Same day |
| **UNSUBSCRIBE reply received** | Legal compliance — do not contact again, log immediately | For awareness |
| **Pipeline cost spike** | Daily cost >2x expected baseline | Immediate |
| **12-touch cadence exhausted, no reply** | Lead has been fully worked — Steve decides next action | Weekly review |
| **New revenue model hypothesis** | Any agent identifies a monetizable pattern outside current roadmap | Next daily review |
| **Legal or compliance signal** | Scraping restriction, GDPR concern, data regulation flag | Immediate |

---

## Todd (Chief of Staff) — Role Definition

Todd is the AI orchestrator that sits between Steve and the entire agent fleet. Todd does not have a deployed OpenClaw agent yet — this role describes how the orchestration layer should function when built.

### Todd's Core Responsibilities

**1. Monitor All Department Outputs**
- Reads the `runs` table in real-time for failed runs, timeouts, and cost spikes
- Tracks pipeline velocity: are leads moving through stages daily?
- Monitors Brain stats: are episodes being recorded? Is KB growing?
- Watches schedule execution: did all scheduled runs fire on time?

**2. Route New Tasks to the Right Department**
- When Steve asks a question or describes a problem, Todd identifies which agent(s) should handle it
- Routes research requests to Research Department
- Routes "find leads" requests to Lead Generator
- Routes "draft outreach" requests to Outreach Agent
- Routes operational issues to Operations Department
- Never routes external communications without Steve approval

**3. Detect When a Pipeline is Stalled**
- Monitors `pipeline_stage` change velocity
- Flags if any stage has had 0 transitions for >24h
- Reads `pipeline-state-tracker` outputs and escalates stall alerts
- Triggers Pipeline Director if automated dispatch hasn't resolved a stall

**4. Surface the Top 3 Daily Priorities to Steve Each Morning**
- Reads morning digest + overnight run results
- Identifies the 3 highest-impact actions Steve could take today
- Format: `1. [Action] → [Expected outcome] → [Agent to trigger or human step]`
- Delivered as part of the 7AM morning digest or as a separate morning brief

**5. Boundaries — What Todd Never Does**
- Never approves or sends external communications autonomously
- Never commits spend outside pre-approved per-run budgets
- Never triggers outbound campaigns without Steve's queue approval
- Never modifies lead status after INTERESTED without Steve involvement
- Never executes a new market campaign without Steve confirmation
- Never ignores an escalation trigger — every escalation must reach Steve

### Todd's Decision Framework

```
New input received
  → Is this an external communication? → STOP. Draft for Steve approval.
  → Is this a spend decision >$50?     → STOP. Escalate to Steve.
  → Is there a live INTERESTED lead?   → STOP. Alert Steve immediately.
  → Is this a research task?           → Route to Research Department.
  → Is this a lead gen task?           → Route to Marketing (Lead Generator).
  → Is this a pipeline stall?          → Route to Operations (Pipeline Director).
  → Is this a content request?         → Route to Marketing (Content Writer).
  → Is this a system health issue?     → Route to Operations.
  → Default                            → Log, assess, surface in next digest.
```

### Todd's Daily Rhythm

| Time | Action |
|------|--------|
| 7:00 AM | Read morning digest, identify top 3 priorities, surface to Steve |
| 9:00 AM | Check overnight run results, flag any failures |
| 12:00 PM | Mid-day pipeline check — any leads moved to INTERESTED? |
| 3:00 PM | Review outreach queue — are drafts aging? Nudge Steve if needed |
| 5:30 PM | Pre-debrief review — any anomalies to flag before 6PM report |
| 6:00 PM | Daily debrief delivered to Steve via Discord |
| 11:59 PM | Confirm overnight jobs are scheduled (brain distillation, pipeline director) |

---

## Cross-Department Pipeline: Full Lead Lifecycle

```
1. DISCOVERY       Research Dept    → jake-construction-discovery / hoa-discovery
                                      Inserts lead: enrichment_status='pending'

2. ENRICHMENT      Marketing Dept   → jake-contact-enricher / hoa-contact-enricher
                                      Finds email + phone: enrichment_status='enriched'

3. SCORING         Finance Dept     → urgency-scorer
                                      Scores lead 0-100 across 4 dimensions

4. DOSSIER         Finance Dept     → lead-dossier-generator
                                      Assembles personalized context: situation + pain + KB angles

5. OUTREACH DRAFT  Marketing Dept   → jake-outreach-agent / cfo-outreach-agent
                                      Writes personalized email draft: status='draft'

                   *** STEVE APPROVES AND SENDS ***

6. SENT            Operations Dept  → tenacity-cadence-engine
                                      Cadence activated: cadence_active=1, next_touch_due set

7. FOLLOW-UP       Marketing Dept   → jake-follow-up-agent
                                      Day-5 draft if no reply: sequence_position=2, status='draft'

                   *** STEVE APPROVES AND SENDS ***

8. REPLY           Marketing Dept   → jake-reply-classifier
                                      Classifies reply: INTERESTED / NOT_NOW / WRONG_PERSON / UNSUBSCRIBE / BOUNCED
                                      Updates lead status, records Brain episode

9a. INTERESTED     *** ESCALATES TO STEVE IMMEDIATELY ***
                   Marketing Dept   → jake-meeting-booker (drafts meeting email)
                                      Steve reviews, approves, sends, books call

9b. NOT_NOW        Operations Dept  → tenacity-cadence (continues nurture sequence)
9c. BOUNCED        Marketing Dept   → jake-contact-enricher (re-enrich with new email)
9d. UNSUBSCRIBE    Operations Dept  → cadence deactivated, lead marked unsubscribed, do not contact

10. MEETING        *** STEVE RUNS THE CALL ***

11. PILOT/CLOSE    *** STEVE OWNS THIS STAGE ***
                   Operations Dept  → jake-crm-sync (updates CRM record)
                                    → brain-distillation (episode promoted to KB)
```

---

*This file is agent-readable operating context. Cross-reference `agent_org_chart.md` for hierarchy and `agent_roles.md` for per-role specs.*
