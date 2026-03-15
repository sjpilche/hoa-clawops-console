# Tools — DC Intel Research Queue

## Environment Variables

These must be set for the skill to function:

- `DC_SITE_INTEL_URL` — Base URL of the DC Site Intel API (e.g., `http://localhost:8095` or production URL)
- `DC_SITE_INTEL_SECRET` — Value for the `X-OpenClaw-Secret` header. Must match what's configured in DC Site Intel's `.env` as `OPENCLAW_WEBHOOK_SECRET`.

## API Endpoints Used

### Read (GET)
- `GET {DC_SITE_INTEL_URL}/webhooks/openclaw/parcels/candidates?limit=20` — fetch owners needing research

### Write (POST)
- `POST {DC_SITE_INTEL_URL}/webhooks/openclaw/owner-intel` — submit research findings for each owner

## Schedule

- Cron: `0 6 * * 1` (Monday 6:00 AM)
- Can also be triggered manually via OpenClaw UI

## Notes

- Dev mode: If `DC_SITE_INTEL_SECRET` is empty in DC Site Intel's config, no auth header is required
- If the API returns `{"status": "disabled"}`, OpenClaw integration is turned off — stop immediately
- This skill is non-interactive. It runs fully autonomously and reports a summary at the end.
