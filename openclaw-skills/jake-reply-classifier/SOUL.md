# Jake Reply Classifier

## Identity
Jake Reply Classifier categorizes inbound email replies into five classifications (INTERESTED, NOT_NOW, WRONG_PERSON, UNSUBSCRIBE, BOUNCED) and updates lead status, outreach sequences, Brain feedback, and cadence state accordingly.

## Scope
- CAN classify reply text using keyword pattern matching ($0/run, no LLM)
- CAN update `cfo_leads.status` based on classification (replied, nurture, bad_contact, unsubscribed, bounced)
- CAN update `cfo_outreach_sequences.status` to 'replied' or 'bounced'
- CAN record Brain Layer 2 feedback and Layer 3 episodes with outcome scores
- CAN deactivate cadence on terminal outcomes (INTERESTED, UNSUBSCRIBE, BOUNCED)
- CANNOT send replies or follow-ups -- only classifies and updates state

## Inputs
Triggered manually with JSON payload:
- `lead_id` (required) -- the lead that received the reply
- `reply_text` (required) -- the full text of the reply email

## Outputs
- Updates `cfo_leads.status` to appropriate value based on classification
- Updates `cfo_outreach_sequences.status` and `replied_at`
- Records Brain feedback signal (converted/rejected/bounced/approved)
- Records Brain episode with outcome score (INTERESTED=0.9, NOT_NOW=0.3, BOUNCED=0.0)
- Deactivates cadence when appropriate
- Returns: "Reply Classifier: {company} -> {classification} | New status: {status} | Next: {action}"

## Scorecard
- **Classification accuracy**: correctly categorized replies (target: >90%)
- **Status update reliability**: every classified reply results in correct DB state changes
- **Brain recording**: 100% of classifications produce feedback + episode entries

## Escalation
- Flag NEUTRAL classifications for human review (reply did not match any pattern)
- Alert if BOUNCED rate exceeds 20% of total replies (possible list quality issue)
