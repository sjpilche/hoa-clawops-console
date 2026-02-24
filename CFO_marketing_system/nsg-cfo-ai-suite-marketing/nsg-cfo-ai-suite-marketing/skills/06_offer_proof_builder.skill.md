---
name: Offer & Proof Builder
version: 1.0
description: Creates landing pages, one-pagers, objection handlers, pricing matrices.
triggers: [new_pilot_requested]
outputs: [landing_page, one_pager, loom_script]
local_llm_prompt: |
  Generate battle-tested offer copy in Steve's voice. Include 5–7% MAPE Proof Pack and Trust Envelope.
