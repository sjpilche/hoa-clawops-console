# Reverse Prompt Engine
*ClawOps Systems File — Agent-readable operating spec and live prompt library*
*Last updated: 2026-03-13*

---

# PART 1 — THE ENGINE SPEC

## Overview

A standard AI agent waits to be told what to do. The Reverse Prompt Engine flips the model.

Instead of Steve asking agents "do X," agents analyze Steve's complete founder context — his goals, his current pipelines, his active experiments, and the state of the business right now — and ask themselves: **"What should Steve be doing that he isn't? What is sitting in this system that hasn't been acted on? Where is the highest-leverage move that nobody has taken yet?"**

Then they surface the answer as a ranked, scored, executable task list — not a report, not a summary, not a "here are some thoughts." A decision with enough context to approve or redirect in 30 seconds.

This is the engine that turns 53 agents from a fleet of workers into a proactive business partner.

The output of every engine run feeds Todd's morning briefing to Steve. Todd doesn't generate the brief from scratch — he packages what the engine already scored.

---

## How It Works

### Step 1: Load Founder Context
Agent loads all context from the `founder/` directory:
- `founder_profile.md` — who Steve is, what he values, his time constraints
- `founder_goals.md` — near-term targets, opportunity criteria, what "winning" looks like
- `decision_frameworks.md` — ICE scoring, leverage hierarchy, escalation triggers
- `agent_mandate.md` — the standing question, revenue hierarchy, entrepreneurial behaviors

### Step 2: Scan Current System State
Agent queries the following live data sources:

**Pipeline metrics (cfo_leads):**
- Total leads by status: new / contacted / replied / nurture / unsubscribed / bounced / pilot
- Leads with email addresses (enrichment_status = 'enriched') not yet in outreach
- Leads in outreach with no reply > 5 days (follow-up candidates)
- Leads with INTERESTED reply that haven't advanced to meeting_booked
- Leads with pilot_fit_score > 70 that haven't been contacted

**HOA pipeline metrics (lg_engagement_queue):**
- Communities by tier: HOT / WARM / WATCH / COLD
- HOT communities with no outreach drafted
- Engagement queue backlog (status = 'pending_review' age > 48 hours)

**Outreach sequence stats (cfo_outreach_sequences):**
- Emails sent in last 7 days
- Reply rate (replied / sent)
- Drafts sitting unreviewed > 24 hours
- Follow-up emails due but not queued

**Content pipeline (cfo_content_pieces):**
- Posts published in last 7 days
- Posts drafted but not published
- Social posts scheduled vs. actually posted

**Agent run history (runs):**
- Failed runs in last 24 hours (status = 'failed')
- Runs with zero actionable output (completed but result_data empty or minimal)
- Agents with no run in last 7 days but marked active/scheduled
- Cost per day this week vs. last week

**Schedule health:**
- Schedules with enabled = 1 that haven't fired in expected window
- Schedules firing but producing 0 leads or 0 content

**Collective Brain stats:**
- Observations written this week
- KB entries distilled (Layer 4)
- Feedback signals: approved vs. rejected ratio
- Episode average outcome score (goal: > 0.6)

**Cost tracking:**
- Total spend today, this week, this month
- Cost per lead generated
- Cost per email sent
- Highest cost agents by run

### Step 3: Apply Scoring Frameworks

For every candidate task the engine identifies, it scores using all three frameworks (defined below) and computes a combined Priority Score.

Tasks scoring > 70 are flagged as "Execute Now."
Tasks scoring 50-70 are flagged as "This Week."
Tasks scoring < 50 are filed as "Backlog."

### Step 4: Generate Ranked Task List

Engine outputs a ranked list in the execution plan format (see Execution Planning section below). Maximum 10 items total. Top 3 are "Execute Now."

### Step 5: Surface to Todd for Steve's Morning Brief

Todd receives the ranked list by 6:30 AM Mountain Time — 30 minutes before the morning brief is assembled. Todd packages it, adds pipeline snapshot data, and formats it using the `daily_mission_brief_template.md`.

Steve gets one clean document. Not a dashboard. Not a Slack thread. One document, one decision per line, one ask at the bottom.

---

## Trigger Conditions

| Trigger | When It Fires |
|---------|---------------|
| Scheduled daily | Every day at 6:30 AM Mountain Time (before Todd's 7 AM brief) |
| On-demand | When Steve says "what should I be doing?" or "what's the priority today?" |
| Pipeline drop alert | Automatically when any pipeline metric drops 20%+ week-over-week |
| New market discovery | When a discovery agent logs > 30 new leads from a single market |
| INTERESTED reply received | When jake-reply-classifier classifies a lead as INTERESTED |
| Cost spike | When daily spend exceeds 150% of 7-day average |
| Stalled pipeline | When pipeline-state-tracker flags > 10 stalled leads |

---

## Input Sources the Engine Should Scan

The engine does not rely on pre-built reports. It reads live data directly.

**SQLite tables (ClawOps DB):**
- `cfo_leads` — full Jake + CFO pipeline. Columns: status, enrichment_status, pilot_fit_score, created_at, last_run_at, cadence_active, next_touch_due
- `cfo_outreach_sequences` — all email activity. Columns: status, sent_at, replied_at, sequence_position
- `cfo_content_pieces` — all content. Columns: status, channel, published_at, created_at
- `lg_engagement_queue` — HOA outreach queue. Columns: status, relevance_score, created_at, approved_at
- `runs` — agent run history. Columns: status, cost_usd, duration_ms, result_data, created_at, agent_id
- `schedules` — schedule config. Columns: enabled, last_run_at, agent_id, cron_expression
- `brain_observations` — collective brain Layer 1. Columns: observation_type, created_at, agent_name
- `brain_feedback` — collective brain Layer 2. Columns: signal, created_at, agent_name
- `brain_episodes` — collective brain Layer 3. Columns: outcome_score, outcome_type, created_at

**Configuration files:**
- `founder/founder_goals.md` — near-term targets and opportunity criteria
- `founder/decision_frameworks.md` — scoring logic
- `org/agent_org_chart.md` — who is active, who is vacant

**Agent outputs (recent runs, result_data column):**
- Last run from each discovery agent: did it find new leads?
- Last run from each outreach agent: did it draft emails?
- Last run from each content agent: did it produce publishable content?

---

## Task Scoring Framework

### Framework 1: ICE Score (from decision_frameworks.md — extended)

**Impact (1-10):** Revenue or leverage if this task succeeds.
- 9-10 = Direct path to a paying customer or closed deal
- 7-8 = Significant pipeline advancement (new market, batch of enriched leads, INTERESTED reply advanced)
- 5-6 = Content or brand that will convert in 60-90 days
- 3-4 = Automation that saves time but no direct revenue path
- 1-2 = Reporting or organization (zero revenue impact)

**Confidence (1-10):** How likely is this to work, given current data?
- 9-10 = Already working (proven tactic, just needs to be repeated or scaled)
- 7-8 = Strong signal (a reply came in, a lead is hot, a market has 50+ companies)
- 5-6 = Reasonable hypothesis backed by at least one data point
- 3-4 = Speculative but plausible
- 1-2 = Gut feeling only, no supporting data

**Ease (1-10):** How fast and cheap to execute with existing tools?
- 9-10 = Agent can do 100% of this in < 10 minutes, $0 cost
- 7-8 = Agent does 80%, Steve does 20% (approve a draft, send one email)
- 5-6 = Takes an hour and minor config change, < $5 cost
- 3-4 = Requires meaningful Steve time (1-3 hours) or new tool setup
- 1-2 = Requires building something new, significant Steve time, or real cost

**ICE Score = (Impact + Confidence + Ease) / 3**

| ICE Score | Action |
|-----------|--------|
| ≥ 8 | Do today — escalate to Steve immediately if spend or send involved |
| 6-7 | Do this week — include in weekly plan |
| 4-5 | Queue for next sprint |
| < 4 | Kill it or park it indefinitely |

---

### Framework 2: Revenue Potential Score (RPS)

Measures how directly this task connects to money in the near term.

| Revenue Path | Points |
|-------------|--------|
| Immediate revenue: closes a deal, sends an invoice, converts a pilot | +40 |
| Short-term pipeline: generates or advances a lead that could close in 30 days | +25 |
| Medium-term: content or brand play that converts in 60-90 days | +15 |
| Long-term leverage: automation that compounds (saves $X/mo or generates passively) | +10 |
| Learning only: research with no direct revenue path right now | +0 |

Tasks can earn points from multiple tiers if they serve multiple purposes (e.g., outreach content that generates leads AND builds brand = +25 + +15 = +40 RPS).

**Maximum RPS: 40 points (scaled to 40 for the combined formula)**

---

### Framework 3: Automation Leverage Score (ALS)

Measures how much of this task agents can execute without Steve's time.

| Automation Level | Points |
|----------------|--------|
| Agents do 100% — Steve does nothing except review output | +30 |
| Agents do 80% — Steve approves one decision or clicks send | +20 |
| Agents do 50% — Steve and agents split the work | +10 |
| Steve does most of it — agents provide research or drafts only | +5 |
| Steve does all of it — agents cannot help | +0 |

**Maximum ALS: 30 points (scaled to 30 for the combined formula)**

---

### Combined Priority Score

```
Priority Score = (ICE × 0.4) + (RPS × 0.35) + (ALS × 0.25)
```

Where:
- ICE is normalized to 0-100 scale: `(raw_ICE / 10) × 100`
- RPS is already 0-40, normalized: `(RPS / 40) × 100`
- ALS is already 0-30, normalized: `(ALS / 30) × 100`

**Interpretation:**
| Score Range | Label | Action |
|------------|-------|--------|
| 70-100 | Execute Now | Includes in Today's Top 3, escalate to Steve |
| 50-69 | This Week | Include in weekly plan |
| 30-49 | Backlog | Queue, don't act yet |
| < 30 | Kill | Remove from active consideration, explain why |

---

## Opportunity Scoring — New Business Evaluation

When the engine encounters a new opportunity (forum complaint pattern, new market, product idea, partnership signal), it runs this evaluation before surfacing to Steve.

### Opportunity Evaluation Matrix

| Column | Description |
|--------|-------------|
| Opportunity Name | Clear one-line description of the opportunity |
| Market Size | S (< 500 companies), M (500-5,000), L (> 5,000) |
| Time to Revenue | Estimated days to first dollar |
| Steve's Edge (1-5) | 1 = generic, 5 = unfair advantage from construction/finance background |
| Automation Fit (1-5) | 1 = all manual, 5 = agents do everything |
| Capital Required ($) | Cash needed to validate (not scale) |
| ICE Score | Computed from above |
| GO / NO-GO | Binary output |

### GO Criteria — ALL must be met

1. Time to first revenue is 60 days or fewer
2. Steve's Edge score is 3 or higher (uses construction, finance, or ops domain knowledge — or existing relationships that others don't have)
3. Automation Fit score is 3 or higher (agents can do the majority of execution)
4. Capital required to validate is under $500

If any single criterion fails, the opportunity is flagged NO-GO until conditions change. Engine notes which criterion failed so Steve can decide if it's worth forcing.

### FAST KILL Criteria — Any ONE kills it immediately

- **Consumer market (B2C):** Steve's network, tools, and edge are all B2B. Consumer requires a completely different distribution model.
- **Requires hiring before revenue:** If we need a human employee before first dollar, the math is wrong. Agents first.
- **Dependent on a single platform Steve doesn't control:** Platform risk is existential for a bootstrapped operation. No single-point dependencies.
- **Time to revenue > 90 days without a strong existing data signal:** If it takes that long and we don't already have warm prospects, it's a bet, not a business.
- **No identifiable paying customer in Steve's reach:** If we can't name five companies who would pay for this right now, it's a hypothesis, not an opportunity.

---

## Execution Planning — Output Format

When the engine generates a plan, it outputs in this exact format. Todd uses this as raw material for the morning brief.

```
## Weekly Execution Plan — [Date]
Generated by: Reverse Prompt Engine v1.0
Based on: [list of data sources scanned and record counts]
Run time: [timestamp]

---

### THIS WEEK'S TOP 3 (Execute Now — Priority Score > 70)

1. [Task name]
   Priority Score: [X/100] | ICE: [X] | RPS: [X] | ALS: [X]
   Owner: [Agent name or "Steve"]
   Est. time: [X minutes/hours for Steve; agent runtime if autonomous]
   Revenue path: [specific description — not "generates pipeline value" but "4 leads with emails haven't received outreach — if 1 converts at $8K/mo that's $96K ARR"]
   Next action: [exact command or step to execute]

2. [Task name]
   [same format]

3. [Task name]
   [same format]

---

### PIPELINE HEALTH CHECK

Jake Pipeline:
- Total leads: [X] | With email: [X] | In active outreach: [X] | Replied: [X] | Hot (score > 70): [X]
- Leads needing enrichment: [X] | Leads overdue for follow-up: [X]
- Last outreach send: [date] | Reply rate (30-day): [X%]

HOA Pipeline:
- Total communities: [X] | HOT: [X] | WARM: [X] | In outreach: [X]
- Engagement queue backlog: [X pending items]
- Last discovery run: [date] | New communities (7 days): [X]

Content:
- Posts published this week: [X] | Scheduled: [X] | In draft: [X]
- Channels active: [list]

Cost:
- Yesterday: $[X] | This week: $[X] | 7-day average: $[X/day]
- Cost per lead (Jake): $[X] | Cost per email sent: $[X]
- Highest cost agent this week: [name] at $[X]

Agent Fleet:
- Scheduled runs today: [X] | Failed in last 24h: [X]
- Agents with no output in 7 days: [list]

---

### OPEN OPPORTUNITIES (Scored)

| Opportunity | Market | Days to Rev | Edge | Auto Fit | Capital | ICE | Verdict |
|------------|--------|------------|------|---------|---------|-----|---------|
| [name] | [S/M/L] | [X] | [1-5] | [1-5] | $[X] | [X] | GO / NO-GO |

---

### WHAT STEVE SHOULD IGNORE THIS WEEK

[List of things that might feel urgent but scored < 50 — with one-line reason why they can wait]

- [Item]: [why it scored low — be specific, e.g., "ALS = 5 — requires Steve to do all the work manually, no agent path exists yet"]
- [Item]: [reason]

---

### WHAT THE AGENTS ARE DOING WHILE STEVE SLEEPS

Scheduled runs tonight and tomorrow morning:
- [Time] — [Agent name]: [Expected output in one line]
- [Time] — [Agent name]: [Expected output in one line]
[...]

Estimated overnight cost: $[X]
Expected leads discovered: [X]
Expected emails queued for review: [X]

---
```

---

# PART 2 — THE PROMPT LIBRARY

Ready-to-fire reverse prompts for agents. Each prompt is a standing challenge — not a request for a summary, but a demand for a decision or an action. Agents should feel uncomfortable if they can't produce a concrete output when these prompts fire.

---

## CATEGORY 1: MISSION ALIGNMENT PROMPTS

*These prompts force agents to check whether the current work actually moves toward Steve's goals. They are adversarial by design — they are asking whether the system is wasting time.*

---

**PROMPT M-1: The Highest-Leverage Vacuum**

> "Given Steve's mission to build autonomous revenue streams that run without manual input, and given everything currently scheduled in the agent fleet, what is the single highest-leverage action available right now that NO scheduled agent is executing? This is not a question about what is running — it is a question about what is being missed. Check the full pipeline, check the org chart for VACANT roles, check the lead counts, and identify the one gap that is costing the most revenue per week by not being automated. Output: the gap, the estimated weekly revenue cost of that gap, and a proposed agent or process that closes it."

---

**PROMPT M-2: The Revenue Per Agent Hour Audit**

> "For every agent that ran in the last 7 days, calculate an estimated Revenue Per Run metric: how many leads generated, leads advanced, or dollars of pipeline created per run. Rank agents from highest to lowest. Identify the bottom three performers. For each: is the agent producing zero value because of a configuration problem, a bad prompt, or because the task itself doesn't connect to revenue? Output a ranked table plus a one-line verdict on each bottom performer: FIX, RETARGET, or KILL."

---

**PROMPT M-3: The 30-Day Revenue Gap**

> "Steve's near-term target is first paying customer from the Jake/CFO pipeline. It is [today's date]. Based on current pipeline velocity — leads in outreach, reply rate, follow-up cadence, and meeting bookings — project the number of days until a deal could realistically close if current pace holds. If that number is greater than 30, identify the single bottleneck that most reduces that number if resolved. Output: current projected days to first close, the rate-limiting step, and what changes if it is fixed."

---

**PROMPT M-4: The Leverage Hierarchy Check**

> "Steve's leverage hierarchy ranks: (1) automated recurring revenue, (2) agent-executed services, (3) one-time high-margin deals, (4) content/brand, (5) manual service work. Review where each active project sits on this hierarchy RIGHT NOW — not where it could sit eventually, but where it is today. Any project sitting at rank 4 or 5 needs a specific, dated plan to move up the hierarchy or it is wasting Steve's time. Output: a table with each project, its current hierarchy rank, and either the specific date it moves up or a recommendation to pause it."

---

**PROMPT M-5: The Sleeping Money Audit**

> "Scan the cfo_leads table for every lead that meets ALL of the following conditions: pilot_fit_score > 65, enrichment_status = 'enriched', status = 'new', and created_at > 14 days ago. These are qualified, enriched leads that have been sitting untouched. For each one, calculate the cost of inaction: if the average deal is $8K-$15K, and 5% of contacted leads convert, what is the dollar value sitting dormant in this list? Output: lead count, pipeline value at risk, and the exact prompt to trigger outreach for this batch immediately."

---

## CATEGORY 2: PIPELINE ACCELERATION PROMPTS

*These prompts look at the current pipeline and find the fastest path to a conversion. They are operational — fired when there is a clear next step that isn't being taken.*

---

**PROMPT P-1: The Enriched-But-Untouched Backlog**

> "Query cfo_leads WHERE enrichment_status IN ('enriched', 'partial') AND status = 'new' AND NOT EXISTS (SELECT 1 FROM cfo_outreach_sequences WHERE lead_id = cfo_leads.id). These are leads the system has found and enriched but has never contacted. Count them. For each one, check if they have a valid email (contact_email IS NOT NULL and contact_email != ''). How many have email addresses ready to receive outreach right now? What is the exact sequence of agent runs needed to get the first email drafted, reviewed, and queued within the next 2 hours? Output: lead count, email-ready count, and the 3-step action plan."

---

**PROMPT P-2: The Reply Queue Check**

> "Query cfo_outreach_sequences WHERE status = 'sent' AND sequence_position = 1 AND replied_at IS NULL AND sent_at < datetime('now', '-5 days'). These leads received an email 5+ days ago with no reply and no follow-up queued. How many are there? How many have a sequence_position = 2 record already drafted? For those that don't: run jake-follow-up-agent on the top 10 by pilot_fit_score right now. Output the follow-up backlog count, action taken, and the exact leads targeted."

---

**PROMPT P-3: The INTERESTED Lead Audit**

> "Query cfo_leads WHERE status = 'replied'. For each one: is there a meeting booking draft (cfo_outreach_sequences WHERE sequence_type = 'meeting')? How many days since the reply came in? Any replied lead with no meeting draft and reply > 48 hours old is a closing opportunity being left on the table. This is the highest-priority pipeline problem in the system. Output: count of replied leads with no meeting draft, the lead names and ages, and fire jake-meeting-booker for each one immediately. Escalate to Steve if any replied lead is > 72 hours without a meeting draft."

---

**PROMPT P-4: The HOA Hot List**

> "Query lg_engagement_queue WHERE status = 'pending_review' AND relevance_score > 70 ORDER BY created_at ASC. These are high-relevance HOA engagement opportunities sitting in the approval queue. How many are there? How old is the oldest one? Any engagement opportunity older than 48 hours is at risk of becoming irrelevant — the forum post ages, the author moves on. Output: count, oldest item age in hours, and a summary of the top 5 by relevance_score. Flag as URGENT if any item is > 72 hours old."

---

**PROMPT P-5: The Content-to-Lead Conversion Gap**

> "Review cfo_content_pieces published in the last 30 days. For each piece: what channel was it published to? Is there any downstream evidence of leads generated or pipeline activity that correlates with the publish date? Cross-reference lead creation dates against content publish dates. If content is being produced but not generating any pipeline activity within 14 days of publishing, one of three things is true: (a) wrong channel, (b) wrong message, or (c) no call-to-action. Identify which. Output: content-to-lead attribution table and a verdict on whether the current content strategy is accelerating the pipeline or just burning tokens."

---

## CATEGORY 3: OPPORTUNITY DISCOVERY PROMPTS

*These prompts actively scan for new revenue opportunities using Steve's industry edge. They are not satisfied with the current roadmap — they are always looking for what Steve hasn't thought of yet.*

---

**PROMPT O-1: The Construction Forum Pain Signal**

> "Scan the most active construction industry forums and communities (The Blue Book Network, Construction Dive comments, ENR forums, r/construction, BuildingAdvisors, LinkedIn construction groups) for the complaint that appeared most frequently in the last 7 days. It must be a complaint about a workflow, software, billing, data, or compliance problem — not a complaint about weather or supply chains. For the top complaint: (1) identify the specific pain, (2) estimate how many companies have this problem in the US, (3) describe the fastest possible $500/month solution using existing agent infrastructure, (4) name 5 specific companies you could call tomorrow to validate demand. Output must include all 4 components or it is incomplete."

---

**PROMPT O-2: The ERP Transition Signal**

> "Search LinkedIn job postings, Indeed, and Glassdoor for construction companies (GC, subcontractors, and construction management firms) posting any of these job titles in the last 30 days: Controller, CFO, Director of Finance, VP Finance, ERP Administrator, Sage Administrator, Viewpoint Administrator. Companies actively hiring for these roles are in one of three high-value situations: (a) rapid growth creating finance stress, (b) existing finance person left taking tribal knowledge with them, or (c) ERP migration in progress. All three are buying signals for Jake's CFO automation service AND for Data Rehab. Output: 10 companies with job posting details, estimated revenue range, and recommended outreach angle for each."

---

**PROMPT O-3: The Underserved Niche Scan**

> "Review Steve's active pipelines — Jake CFO (construction ERP/finance automation), HOA funding, Data Rehab. For each one, identify the adjacent market: the same type of buyer in a slightly different vertical who has the same pain but isn't being targeted yet. For example: if Jake targets GC company CFOs, the adjacent might be specialty subcontractor CFOs (mechanical, electrical, plumbing) — same ERP pain, different NAICS code, potentially less competitive to reach. Score each adjacent market using the Opportunity Evaluation Matrix and output the top adjacency across all three pipelines with a proposed 2-week test campaign."

---

**PROMPT O-4: The Data Asset Inventory**

> "Survey every database table in the ClawOps SQLite DB that contains company or contact data: cfo_leads, lg_engagement_queue, hoa_communities (if exists), mgmt_companies (if exists). For each table: how many records? How many have email addresses? How many have verified contact names? What is the combined estimated reach of this data asset if used for outreach? Now ask: is there a business where someone ELSE would pay for access to this data, scored and organized the way it currently is? A list of 2,000 verified construction CFO contacts with ERP type, revenue range, and enrichment data is a product, not just a pipeline. Output: data inventory, estimated total reach, and a monetization hypothesis for the dataset itself."

---

**PROMPT O-5: The 30-Day Micro-SaaS Hypothesis**

> "Based on the market signals visible in the current system — job postings, forum complaints, lead pain signals, HOA meeting minutes — propose ONE micro-SaaS product that: (1) solves a specific, repeated problem Steve already has domain expertise in, (2) could be validated with a landing page and 10 cold outreach emails this week, (3) could be built by agents within 30 days if validated, and (4) has a pricing model between $99/month and $999/month targeting a business buyer, not a consumer. This is not a brainstorm — pick ONE and commit to it. Apply the full GO/NO-GO evaluation matrix. Output the hypothesis with all five fields from Framework 4 (Experiment Design): hypothesis, test, success metric, kill condition, plus the GO/NO-GO matrix result."

---

## CATEGORY 4: SYSTEM OPTIMIZATION PROMPTS

*These prompts improve the agent system itself — efficiency, cost reduction, and new automations. An agent system that doesn't improve itself is decaying.*

---

**PROMPT S-1: The Zero-Output Agent Audit**

> "Query the runs table for all completed runs in the last 7 days. For each agent, calculate: (a) number of runs, (b) average result_data length in characters (proxy for output volume), (c) average cost_usd per run. Flag any agent where result_data length averages under 200 characters — this is almost certainly a run that produced no actionable content. For each flagged agent: pull the actual result_data from its last 3 runs. Is this agent producing nothing because of a broken prompt, a failed API call, a configuration error, or because the task is genuinely done and the agent should be rescheduled? Output: flagged agents with actual outputs and a verdict — FIX / RETARGET / RESCHEDULE / KILL."

---

**PROMPT S-2: The Schedule Efficiency Review**

> "Review every active schedule in the system. For each schedule: how often does it fire? What is the average cost per run? What is the average output (leads found, emails drafted, content created, communities discovered)? Now calculate Output-per-Dollar for each scheduled agent. Rank from highest to lowest. Identify the bottom quartile. For each low-efficiency schedule: is it low because the agent needs a better prompt, because it's running too frequently (daily when weekly is enough), or because the underlying market has been exhausted? Output a ranked efficiency table and specific recommendations for the bottom 25% — with suggested new cron schedules, prompt changes, or kill recommendations."

---

**PROMPT S-3: The Vacant Role Opportunity Cost**

> "Review the agent org chart at org/agent_org_chart.md. Identify every role marked VACANT. For each vacant role, estimate: (a) what tasks would this role perform if filled?, (b) what is the estimated weekly revenue impact of those tasks not being performed?, (c) what is the minimum viable agent config to fill this role using existing OpenClaw capabilities and the jake-* agent patterns already established? Prioritize the vacant roles by estimated weekly revenue impact. Output: a ranked list of vacancies, the cost of each gap per week, and a one-paragraph agent brief for the highest-priority vacancy — ready to turn into a SOUL.md file."

---

**PROMPT S-4: The Cost-Per-Lead Compression**

> "Calculate the total cost to acquire one lead (from initial discovery through enrichment to outreach draft) for each active pipeline: Jake construction discovery, Jake lead scout (LLM), CFO lead scout, and HOA discovery. Break the cost into stages: discovery cost per company found, enrichment cost per email found, outreach draft cost per email created. Now identify the single most expensive step in the cheapest pipeline. Is there a $0 alternative (scraping, pattern-guessing, or open data) that replaces that step without significantly reducing lead quality? Output: cost-per-lead table by pipeline, the target step, and a specific proposal to reduce it — with an estimated new cost-per-lead if the proposal is implemented."

---

**PROMPT S-5: The Compounding Automation Candidate**

> "Review Steve's current daily workflow: what does he do manually that agents could do? Look at what types of decisions he makes (approving outreach drafts, reviewing lead lists, checking pipeline metrics) and ask: which of these could be partially automated with a lightweight rule or threshold that handles the 80% obvious cases and only escalates the genuinely ambiguous 20%? For example: if a lead has a pilot_fit_score > 80 and a verified email, it could auto-queue for outreach without review. Identify the top 3 manual approval steps that could be automated using existing data in the DB, estimate the hours per week saved for each, and propose the specific automation logic — with the edge cases that should still require Steve's review."

---

*End of Reverse Prompt Engine — Part 1 and Part 2*

*Agents: Part 2 is not a library to browse. It is a weapon. Fire at least one prompt from each category per week. If you cannot produce a concrete output from any prompt above, that itself is the answer — something is broken, vacant, or being ignored. Surface that finding.*
