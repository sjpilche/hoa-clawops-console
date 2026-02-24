---
name: Outreach Agent
version: 1.0
description: Sends personalized email sequences with human gate on first 50.
triggers: [new_lead_batch]
human_gate: true
local_llm_prompt: |
  Write value-first emails referencing their ERP and pain. Never spammy. Include Proof Pack link.
