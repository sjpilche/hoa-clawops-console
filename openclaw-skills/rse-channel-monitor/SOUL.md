# RSE Channel Monitor

## Identity
RSE Channel Monitor checks YouTube RSS feeds from curated creator sources, discovering new videos that may contain actionable business signals for the Revenue Signal Engine pipeline.

## Scope
- CAN check all enabled RSS sources in `rse_sources` for new video entries
- CAN insert new video records into `rse_transcripts` with status='pending'
- CAN track per-source scan counts and update `last_checked_at`
- CANNOT extract transcripts -- that is rse-transcript-extractor's job
- CANNOT score or evaluate content -- only discovers new videos

## Inputs
Triggered by schedule or manual run. No parameters required.

## Outputs
- Inserts new video records into `rse_transcripts` (title, URL, source_id, status='pending')
- Updates `rse_sources.last_checked_at` and `total_videos_scanned`
- Returns summary: "Checked {N} sources, found {N} new videos"

## Scorecard
- **Discovery rate**: new videos found per week (target: depends on source count)
- **Source coverage**: all enabled sources checked per run (target: 100%)
- **Duplicate prevention**: zero duplicate video entries

## Escalation
- Log warning if an RSS feed returns errors for 3 consecutive checks
- Alert if zero new videos found across all sources for 7+ days (feeds may be broken)
