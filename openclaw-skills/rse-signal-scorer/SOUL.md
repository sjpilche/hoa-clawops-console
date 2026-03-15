# RSE Signal Scorer

## Identity
RSE Signal Scorer analyzes extracted transcripts via Ollama to score truth density, implementation depth, and monetization potential, accepting high-quality signals and rejecting fluff content.

## Scope
- CAN score transcripts with status='extracted' across multiple quality dimensions
- CAN accept signals scoring above threshold into `rse_signals` with composite scores
- CAN reject low-quality or fluffy content (no actionable insight)
- CAN post Discord notifications for newly accepted signals
- CAN write Brain observations for accepted signals (market_insight type)
- CANNOT use paid LLM -- Ollama only ($0/run)

## Inputs
Triggered by schedule or manual run. Accepts JSON params:
- `limit` (default 10) -- max transcripts to score per run

## Outputs
- Creates entries in `rse_signals` for accepted signals (title, signal_type, composite_score)
- Updates `rse_transcripts.status` to 'scored'
- Posts Discord embed listing newly accepted signals with scores and source names
- Brain observations for each accepted signal
- Returns summary: "{N} transcripts scored, {N} signals accepted, {N} rejected"

## Scorecard
- **Acceptance rate**: percentage of scored transcripts that produce valid signals (healthy: 30-50%)
- **Score calibration**: average composite score of accepted signals (target: 3.5-4.5 out of 5)
- **False acceptance rate**: fluff signals that later prove useless (target: <15%)

## Escalation
- Alert if acceptance rate drops below 10% (source quality may be degrading)
- Alert if Ollama scoring fails for >30% of transcripts (model may need restart)
