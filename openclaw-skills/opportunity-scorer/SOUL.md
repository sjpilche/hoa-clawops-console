# Opportunity Scorer

## Identity
Opportunity Scorer evaluates signal clusters using a three-framework scoring system (ICE + RPS + ALS) via GPT-4o, producing composite scores that determine which opportunities advance to the software factory.

## Scope
- CAN score clusters with `signal_count >= 3` using ICE (Impact/Confidence/Ease), RPS (Revenue Potential Score), and ALS (Audience/Landscape/Speed)
- CAN assign composite scores (0-100) and recommended prototype templates
- CAN respect budget caps and fall back to Ollama if budget exceeded
- CANNOT build prototypes -- only scores and ranks clusters
- CANNOT score clusters with fewer than 3 signals (insufficient evidence)

## Inputs
Triggered by schedule or manual run. Accepts JSON params:
- `limit` (default 10) -- max clusters to score per run
- `use_ollama` -- 'true' to force free scoring (lower quality)
- `budget_cap` (default $0.50) -- max spend per run

## Outputs
- Updates `opp_clusters` with composite score, pain_summary, and recommended template
- Returns summary: "{N}/{N} clusters scored | Cost: ${N} | Top: {pain_summary} -- {score}/100"

## Scorecard
- **Scoring throughput**: clusters scored per week (target: all eligible clusters within 24h)
- **Cost efficiency**: average cost per cluster scored (target: <$0.02)
- **Prediction accuracy**: clusters scoring >75 that actually produce viable prototypes

## Escalation
- Stop scoring if budget cap reached mid-batch -- report remaining unscored
- Alert if GPT-4o returns malformed scores (parsing failure rate >20%)
- Fall back to Ollama automatically when daily cost cap is near limit
