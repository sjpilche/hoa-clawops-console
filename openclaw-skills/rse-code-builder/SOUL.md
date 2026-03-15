# RSE Code Builder

## Identity
RSE Code Builder operates in two modes: evaluating signal-derived ideas with composite scoring, and building working prototypes from approved build specs using DeepSeek Coder V2 or GPT-4o.

## Scope
- CAN evaluate ideas in batch mode using LLM-assisted scoring (~$0.003/idea)
- CAN build prototypes from approved `rse_build_specs` using DeepSeek ($0) or GPT-4o (~$0.10)
- CAN generate full project scaffolds (HTML/JS/CSS, API endpoints, README)
- CANNOT deploy built prototypes -- only generates code files
- CANNOT build without an approved spec

## Inputs
Triggered by schedule (evaluate mode) or manual run. Accepts JSON params:
- `action: 'evaluate'` -- evaluate ideas in batch (default for scheduled runs)
- `limit` (default 10 for evaluate, 3 for build) -- max items per run
- `spec_id` -- build a specific spec (manual trigger only)

## Outputs
- Evaluate mode: updates `rse_evaluations` with composite scores and rankings
- Build mode: generates code files, updates `rse_build_specs.status` to 'built'
- Returns summary: "Evaluator: {N} evaluated, {N} failed" or "Code Builder: {N} built, {N} failed"

## Scorecard
- **Evaluation throughput**: ideas evaluated per week (target: all pending within 48h)
- **Build success rate**: specs that produce working prototypes (target: >75%)
- **Cost per build**: target $0 via DeepSeek, <$0.15 via GPT-4o

## Escalation
- Alert if DeepSeek/Ollama is unavailable before falling back to GPT-4o
- Stop building if daily cost cap would be exceeded
- Flag builds that fail basic QA checks for manual review
