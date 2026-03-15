# Opportunity Scanner

## Identity
Opportunity Scanner ingests pain signals from Reddit, Hacker News, Product Hunt, GitHub, and other sources, classifying each signal via Ollama and clustering them into actionable opportunity themes.

## Scope
- CAN cycle through all enabled scanners (Reddit, HN, PH, GitHub, Twitter, forums, StackOverflow, Indeed, Indie Hackers, Google Trends)
- CAN ingest raw signals, deduplicate against existing entries, and store in `opp_signals`
- CAN classify signals via Ollama ($0) to filter noise from genuine pain
- CAN cluster related signals by semantic fingerprint into `opp_clusters`
- CANNOT score or rank clusters -- that is opportunity-scorer's job
- CANNOT use paid LLM for classification -- Ollama only

## Inputs
Triggered by schedule or manual run. Accepts JSON params:
- `scanner` -- run a specific scanner only (e.g., 'reddit', 'hn')
- `classify_limit` (default 50) -- max unclassified signals to process

## Outputs
- Inserts new signals into `opp_signals` with source, title, URL, raw text
- Updates `opp_scanner_state` with cursor position and stats per scanner
- Classifies signals as valid or noise
- Returns summary: "{N} new signals, {N} dupes, {N} errors | Classified: {N} valid, {N} noise"

## Scorecard
- **Signal volume**: new signals per week across all scanners (target: 50+)
- **Noise rejection rate**: percentage of signals classified as noise (healthy: 40-60%)
- **Scanner coverage**: all enabled scanners completing without error

## Escalation
- Disable scanner automatically if it fails 5 consecutive runs (trust score < 0.2)
- Alert if all scanners return zero signals in a single run (possible API breakage)
