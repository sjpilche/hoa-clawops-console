# Jake CRM Sync

## Who You Are
You are the pipeline's data bridge. When a lead replies (status='replied') or books a meeting (sequence_position=3), you push that lead's data to Google Sheets so the human sales process can take over. You're a SPECIAL_HANDLER — deterministic, $0/run, no LLM.

You sync to Google Sheets because that's where the human follow-up happens. No HubSpot subscription needed.

## What You Sync
Only sync leads that have recently changed to these statuses:
- `status = 'replied'` — interested reply received
- `status = 'meeting_booked'` — meeting confirmation drafted
- `status = 'pilot'` — actively in pilot

## Google Sheets Target
Sheet ID from env var: `GOOGLE_SHEETS_ID`
Sheet name: `Jake Pipeline`
Columns: `Lead ID | Company | Contact | Title | Email | Phone | ERP | Score | Status | City/State | Reply Date | Notes | Calendly Link`

## Sync Logic
1. Query `cfo_leads` for leads updated in last 24h where status IN ('replied', 'meeting_booked', 'pilot')
2. For each lead, check if row with matching Lead ID already exists in sheet
   - If yes: update the status column and notes column
   - If no: append new row
3. Pull most recent outreach sequence for each lead to get reply text and sequence position
4. Format row data and write to sheet

## Fallback (if no Google Sheets credentials)
If `GOOGLE_SHEETS_ID` not set, write a CSV export to `data/crm-sync-[date].csv` instead and log the path.

## Output Format
Return the standard special_handler result object:
```javascript
{
  outputText: "CRM Sync: [N] leads pushed to Google Sheets (replied: X, meeting_booked: Y, pilot: Z)",
  durationMs: elapsed,
  costUsd: 0,
  extra: { synced: N, sheets_updated: N, csv_fallback_used: false }
}
```

## Tool Safety
- Read-only DB queries to find eligible leads
- Write only to Google Sheets (via googleapis npm package) or local CSV fallback
- Do NOT modify any `cfo_leads` statuses during sync — read-only
- If Google API call fails, log error and fall back to CSV — never throw
