# Troubleshooting

## "Cannot reach the server"
**Cause:** Express server isn't running.
**Fix:** Run `npm run dev:server` in a separate terminal, or use `npm run dev` to start both.

## "Session expired" after refresh
**Cause:** JWT token expired or JWT_SECRET changed.
**Fix:** Log in again. If persistent, check that JWT_SECRET in .env.local hasn't changed.

## "Rate limit exceeded"
**Cause:** Too many requests in a short time.
**Fix:** Wait 1 minute (general) or 1 hour (agent runs). Adjust limits in .env.local.

## Blank page after login
**Cause:** Vite dev server not running, or proxy not configured.
**Fix:** Ensure both server (3001) and client (5173) are running. Check vite.config.js proxy settings.

## Database errors
**Cause:** Corrupted SQLite file or schema mismatch.
**Fix:** Delete `data/clawops.db` and run `npm run seed` to recreate.

## WebSocket connection failed
**Cause:** WSL2 networking issue or server not started.
**Fix:** Restart WSL2 (`wsl --shutdown` from PowerShell). Check that Socket.io is running on port 3001.
