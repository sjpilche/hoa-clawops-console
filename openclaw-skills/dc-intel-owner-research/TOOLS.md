# Tools — DC Intel Owner Research

## Environment Variables

These must be set for the skill to function:

- `DC_SITE_INTEL_URL` — Base URL of the DC Site Intel API (e.g., `http://localhost:8095` or production URL)
- `DC_SITE_INTEL_SECRET` — Value for the `X-OpenClaw-Secret` header. Must match what's configured in DC Site Intel's `.env` as `OPENCLAW_WEBHOOK_SECRET`.

## API Endpoints Used

### Read (GET)
- `GET {DC_SITE_INTEL_URL}/webhooks/openclaw/parcels/candidates` — fetch owners needing research (used by research-queue, not directly by this skill)

### Write (POST)
- `POST {DC_SITE_INTEL_URL}/webhooks/openclaw/owner-intel` — submit research findings
- `POST {DC_SITE_INTEL_URL}/webhooks/openclaw/intel-note` — submit supplementary intel notes (optional)

## Secretary of State Lookups

For Illinois entities:
- https://apps.ilsos.gov/corporatellc/ — Illinois SOS business search

For Virginia entities:
- https://cis.scc.virginia.gov/ — Virginia SCC entity search

## Notes

- Dev mode: If `DC_SITE_INTEL_SECRET` is empty in DC Site Intel's config, no auth header is required
- If the API returns `{"status": "disabled"}`, OpenClaw integration is turned off in DC Site Intel
