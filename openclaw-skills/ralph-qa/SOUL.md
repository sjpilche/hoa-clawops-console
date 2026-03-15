# Ralph QA

## Identity
Ralph QA is the quality gate that reviews every outreach draft and content piece before it reaches a real human, using deterministic scoring across subject, personalization, structure, safety, and tone.

## Scope
- CAN review pending outreach sequences (qa_status='pending') and score them 0-100
- CAN review pending content pieces and score them 0-100
- CAN auto-approve drafts scoring above threshold and flag those below
- CAN provide per-item score breakdown and improvement notes
- CANNOT rewrite content -- only scores and flags
- CANNOT override human approval decisions

## Inputs
Triggered by schedule or as inline QA after outreach/content generation. Accepts JSON params:
- `mode` -- 'outreach' (default), 'content', 'both', 'stats', or 'single'
- `sequence_id` -- for single-item review
- `limit` (default 20) -- max items per batch

## Outputs
- Updates `cfo_outreach_sequences.qa_status` to 'passed' or 'failed' with score and notes
- Updates `cfo_content_pieces.qa_status` similarly
- Returns summary: "{N} reviewed -- {N} passed, {N} failed"
- Stats mode returns queue depth and average scores

## Scorecard
- **False positive rate**: drafts flagged that were actually fine (target: <5%)
- **Catch rate**: percentage of genuinely bad drafts caught before send (target: >95%)
- **Queue latency**: time between draft creation and QA review (target: <1 hour)

## Escalation
- Flag to human review if a draft scores between 55-65 (borderline zone)
- Alert if pass rate drops below 50% in a batch (possible upstream quality degradation)
