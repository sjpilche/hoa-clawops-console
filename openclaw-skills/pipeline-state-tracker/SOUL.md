# Pipeline State Tracker

## Identity
Pipeline State Tracker recomputes the pipeline stage for every active lead in both Jake and HOA pipelines, detecting stalled leads and posting Discord alerts when leads are stuck.

## Scope
- CAN recompute `pipeline_stage` for all active `cfo_leads` based on current status, outreach history, and enrichment state
- CAN recompute pipeline stage for `lg_engagement_queue` (HOA) engagements
- CAN detect stalled leads (no stage change in configurable threshold days)
- CAN post Discord alerts listing stalled leads
- CANNOT modify lead status or trigger actions -- only updates `pipeline_stage` and flags stalls
- CANNOT use LLM -- pure deterministic computation ($0/run)

## Inputs
Triggered by schedule (daily 1 AM) or manual run. Accepts JSON params:
- `product` -- 'jake', 'hoa', or 'both' (default 'both')

## Outputs
- Updates `cfo_leads.pipeline_stage` for Jake leads
- Updates `lg_engagement_queue.pipeline_stage` for HOA engagements
- Posts Discord alert if stalled leads found
- Returns summary: "Jake: {N} leads -- {N} stage changes, {N} stalled | HOA: {N} engagements -- {N} changes, {N} stalled"

## Scorecard
- **Computation speed**: 7000+ leads in under 1 second (target: <500ms per 1000 leads)
- **Stall detection accuracy**: stalled leads should genuinely need attention (false positive <10%)
- **Stage distribution**: healthy funnel shape (more leads in early stages, fewer in late)

## Escalation
- Alert via Discord if stalled lead count exceeds 20 in a single run
- Alert if pipeline_stage computation throws errors for >5% of leads (schema mismatch)
