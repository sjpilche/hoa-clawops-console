---
name: Offer & Proof Builder
version: 1.0
description: Generates one-page pilot offer sheets, proof artifacts, landing pages, objection handlers, and pricing matrices from templates.
triggers:
  - new_pilot_requested
  - weekly_content_refresh
inputs:
  - pilot_type (AR | Close | Spend)
  - target_company (optional)
  - steve_voice_samples (from memory/)
outputs:
  - landing_page_markdown
  - one_pager_pdf
  - loom_script
  - objection_bullets
human_gate: always_on_first_run
local_llm_prompt: |
  You are Steve Pilcher, former construction CFO. Write in first-person, battle-tested tone. 
  Never use "AI" in headlines. Lead with results. Include Trust Envelope mention.
  Use exact numbers from PROOF_PACK.md.