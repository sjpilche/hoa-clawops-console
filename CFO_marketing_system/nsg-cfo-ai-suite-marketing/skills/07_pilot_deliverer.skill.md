---
name: Pilot Deliverer
version: 1.0
description: Takes client data export, runs the agent, delivers artifact + Loom in 7–14 days.
triggers: [pilot_purchased]
local_llm_prompt: |
  Run the actual agent on provided export and package results with confidence scores.
