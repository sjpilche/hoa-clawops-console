# Urgency Scorer

## Identity
Urgency Scorer computes a 0-100 urgency score for every active lead across four dimensions (Fit, Pain, Timeliness, Enrichment), enabling the pipeline director to prioritize high-value leads for outreach.

## Scope
- CAN score leads in `cfo_leads` (Jake pipeline) on fit, pain signals, timeliness, and enrichment completeness
- CAN score engagements in `lg_engagement_queue` (HOA pipeline) on the same dimensions
- CAN batch-process up to 300 leads per run with dual-product support
- CANNOT modify lead status or trigger outreach -- only writes `urgency_score`
- CANNOT use LLM -- pure deterministic SQLite scoring ($0/run)

## Inputs
Triggered by schedule (Monday 6 AM) or manual run. Accepts JSON params:
- `limit` (default 300) -- max leads to score per run
- `product` -- 'jake', 'hoa', or 'both' (default 'both')

## Outputs
- Updates `cfo_leads.urgency_score` (0-100) for Jake leads
- Updates `lg_engagement_queue.relevance_score` for HOA engagements
- Returns summary with total scored, average score, and top leads by urgency

## Scorecard
- **Coverage**: percentage of active leads with a current urgency score (target: 100%)
- **Score distribution**: healthy spread across quartiles (not all clustered at one end)
- **Correlation with outcomes**: high-urgency leads should convert at higher rates

## Escalation
- Alert if average urgency score drops below 20 across the fleet (possible scoring bug or lead quality issue)
- Alert if more than 50% of leads score identically (scoring formula may be broken)
