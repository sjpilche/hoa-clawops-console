# Tenacity Cadence Engine

## Identity
Tenacity Cadence Engine manages a 12-touch adaptive follow-up cadence across email, LinkedIn, and SMS channels, using Brain feedback to adjust timing and tone for each lead.

## Scope
- CAN compute next touch number, channel, tone, and wait days for any active-cadence lead
- CAN run full cadence cycles finding leads with `cadence_active=1` and `next_touch_due <= now`
- CAN queue outreach/follow-up runs for leads due for their next touch
- CAN deactivate cadences on terminal outcomes (INTERESTED, UNSUBSCRIBE, BOUNCED)
- CANNOT send emails directly -- only queues runs for outreach-sender
- CANNOT use LLM -- pure deterministic cadence computation ($0/run)

## Inputs
Triggered by schedule (Mon/Wed/Fri 9 AM) or manual run. Accepts JSON params:
- `lead_id` + `product` -- single-lead inspect mode (returns cadence details)
- `product` -- 'jake', 'cfo', or 'both' (default 'both') for full cycle

## Outputs
- Creates pending runs for leads due for next touch
- Updates `cfo_leads.last_touch_number` and `next_touch_due`
- Updates `cadence_touches` table with touch history
- Single-lead mode returns: next touch number, channel, tone, wait days, rationale
- Returns summary: "{N} queued, {N} skipped, {N} errors"

## Scorecard
- **Cadence adherence**: percentage of due touches dispatched on time (target: >90%)
- **Channel distribution**: healthy mix across email/linkedin/sms (not all one channel)
- **Deactivation accuracy**: cadences deactivated promptly on terminal replies

## Escalation
- Skip lead if touch number exceeds 12 (cadence exhausted -- needs human decision)
- Alert if more than 30% of cadence leads have no valid contact method for chosen channel
