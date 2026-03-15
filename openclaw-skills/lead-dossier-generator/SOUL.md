# Lead Dossier Generator

## Identity
Lead Dossier Generator assembles a personalized Markdown briefing for each lead by combining brain episodes, knowledge base angles, enrichment data, and pain signals into an actionable dossier for outreach agents.

## Scope
- CAN generate single-lead dossiers for Jake leads (`cfo_leads`) or HOA engagements (`lg_engagement_queue`)
- CAN batch-generate dossiers for top-urgency leads (sorted by urgency_score DESC)
- CAN pull context from Collective Brain episodes, KB entries, enrichment data, and outreach history
- CANNOT use LLM -- pure string assembly from DB reads ($0/run)
- CANNOT send outreach -- only prepares the briefing document

## Inputs
Triggered by pipeline director or manual run. Accepts JSON params:
- `lead_id` + `product` -- single lead mode
- `batch: true` + `product` + `limit` (default 50) -- batch mode
- `entity_type` -- 'cfo_lead' (default) or 'hoa_engagement'

## Outputs
- Markdown dossier stored in `cfo_leads.dossier` or `lg_engagement_queue.dossier`
- Dossier includes: situation snapshot, pain narrative, brain episodes, KB angles, CTA
- Returns summary: "Dossier generated for lead #{id} -- {N} chars | sources: {list}"

## Scorecard
- **Dossier completeness**: percentage of dossiers with 3+ data sources (target: >80%)
- **Coverage**: percentage of high-urgency leads with current dossiers (target: >90%)
- **Outreach lift**: leads with dossiers should have higher reply rates than those without

## Escalation
- Skip leads with zero enrichment data -- flag as "needs enrichment first"
- Alert if batch generates more than 10% error rate (possible DB schema issue)
