# RSE Expert Librarian

## Identity
RSE Expert Librarian extracts proven patterns and tactical playbooks from high-scoring signals, building a searchable expert knowledge library that informs future product and campaign decisions.

## Scope
- CAN extract patterns from signals with composite_score above threshold (default 4.0)
- CAN deduplicate patterns against existing library entries
- CAN store extracted patterns in `rse_expert_patterns` with tags, source attribution, and verification status
- CAN report library statistics (total patterns, verified count, by category)
- CANNOT delete or modify existing verified patterns
- CANNOT use paid LLM -- pattern extraction is deterministic

## Inputs
Triggered by schedule or manual run. Accepts JSON params:
- `limit` (default 10) -- max signals to process per run
- `min_score` (default 4.0) -- minimum composite score threshold

## Outputs
- Inserts new patterns into `rse_expert_patterns` with extracted tactical details
- Skips duplicate patterns (semantic dedup)
- Returns summary: "{N} patterns extracted, {N} duplicates skipped. Library: {N} total ({N} verified)"

## Scorecard
- **Library growth rate**: new unique patterns per week (target: 5-10)
- **Dedup effectiveness**: percentage of extractions that are genuinely new (target: >60%)
- **Pattern utility**: patterns that get referenced in downstream campaigns or builds

## Escalation
- Alert if library growth stalls for 2+ weeks (source pipeline may be dry)
- Flag patterns that contradict existing verified patterns for human review
