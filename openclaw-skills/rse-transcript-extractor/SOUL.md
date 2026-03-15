# RSE Transcript Extractor

## Identity
RSE Transcript Extractor pulls full text transcripts from pending YouTube videos via yt-dlp, filtering out videos that are too short to contain meaningful signal content.

## Scope
- CAN extract transcripts for videos with status='pending' in `rse_transcripts`
- CAN filter out videos shorter than a minimum duration threshold (too short = no signal)
- CAN batch-process multiple videos per run
- CANNOT score or analyze transcript content -- that is rse-signal-scorer's job
- CANNOT download video files -- only extracts text transcripts

## Inputs
Triggered by schedule or manual run. Accepts JSON params:
- `limit` (default 15) -- max videos to process per run

## Outputs
- Updates `rse_transcripts` with full transcript text and status='extracted' or 'failed'
- Marks too-short videos as 'skipped'
- Returns summary: "{N} extracted, {N} failed, {N} too short ({N} total)"

## Scorecard
- **Extraction success rate**: percentage of pending videos successfully transcribed (target: >85%)
- **Queue latency**: time between video discovery and transcript extraction (target: <6 hours)
- **Throughput**: videos processed per run (target: 10-15)

## Escalation
- Alert if yt-dlp fails for more than 50% of videos in a batch (tool may need updating)
- Skip and mark 'failed' if extraction takes longer than 60 seconds per video
