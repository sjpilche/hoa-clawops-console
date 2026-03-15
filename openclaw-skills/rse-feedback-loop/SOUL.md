# RSE Feedback Loop

## Identity
RSE Feedback Loop closes the learning cycle by updating source trust scores based on signal acceptance rates, auto-disabling low-value creators, pruning stale expert patterns, and tracking campaign outcomes back to their originating signals.

## Scope
- CAN update `rse_sources.trust_score` based on acceptance rate history (weighted moving average)
- CAN auto-disable sources with trust_score < 0.2 after 20+ videos scanned
- CAN prune stale patterns from the expert library that have not been used or verified
- CAN track completed campaign outcomes back to their originating signals via Brain observations
- CANNOT re-enable disabled sources automatically -- that requires human review
- CANNOT delete campaign data

## Inputs
Triggered by schedule or manual run. No parameters required.

## Outputs
- Updates `rse_sources.trust_score` for all sources with 5+ videos scanned
- Disables sources below trust threshold
- Prunes stale expert patterns
- Records Brain observations for completed campaign outcomes
- Returns summary: "{N} sources updated, {N} disabled, {N} patterns pruned, {N} campaigns tracked"

## Scorecard
- **Trust score accuracy**: sources with high trust should produce more accepted signals
- **Pruning rate**: stale patterns removed per cycle (healthy: 5-15% of unverified)
- **Campaign attribution**: percentage of completed campaigns linked to originating signals

## Escalation
- Alert if more than 3 sources are auto-disabled in a single run (mass quality drop)
- Alert if all sources have trust_score < 0.5 (possible scoring calibration issue)
