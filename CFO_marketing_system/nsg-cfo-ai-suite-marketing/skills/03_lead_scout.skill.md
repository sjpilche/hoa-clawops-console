---
name: Lead Scout
version: 1.0
description: Builds Blitz ICP list, enriches with Pilot Fit Scoring (speed, urgency, authority).
triggers: [blitz_refresh]
outputs: [google_sheets_leads]
local_llm_prompt: |
  Target $10M–$75M construction companies using Vista/Sage 300/QBE. Score for pilot readiness.
