# 🚀 ClawOps Console — Quick Start (5 Minutes)

## Start Everything

```bash
# 1. Kill any stale node processes
powershell -Command "Get-Process node | Stop-Process -Force"

# 2. Start the console
cd c:\Users\SPilcher\OpenClaw2.0\ for\ linux\ -\ Copy
npm run dev
```

**Wait 30 seconds.** You should see:
```
✓ Server listening on port 3001
✓ Vite frontend on port 5174
✓ OpenClaw trader on port 3002
✓ OpenClaw gateway on port 18789
```

---

## Login

1. Go to http://localhost:5174
2. **Email**: admin@clawops.local
3. **Password**: changeme123
4. **Click**: "Agents" to see all 27 agents in 6 groups

---

## Quick Tests

### Test 1: Run an Agent (2 min)
1. Click any agent (e.g., "main")
2. Click "Run"
3. See output → cost → tokens used

### Test 2: Post to Social Media (3 min)
1. Click "Content Queue"
2. Click "Add Post"
3. Fill in:
   - **Content**: "Testing #HOA #RealEstate"
   - **Platform**: linkedin
   - **Type**: page
4. Click "Publish" → Posts to LinkedIn (if Postiz key configured)

### Test 3: View Agent Health (1 min)
1. Click "Monitor"
2. See: Gateway status, database health, agent counts, cost trends

---

## Configure Postiz (Optional — for Multi-Platform Posting)

1. Get API key from https://postiz.com/dashboard/integrations
2. Edit `.env.local`:
   ```
   POSTIZ_API_KEY=<your-key>
   POSTIZ_API_URL=https://api.postiz.com/api
   ```
3. Restart: `npm run dev`
4. Test: Post to LinkedIn, Twitter, Instagram, etc.

---

## Next Steps

- Read **DEPLOYMENT_CHECKLIST.md** for full launch guide
- Read **CLAYHUB_INTEGRATION.md** for all available skills
- Try installing **QMD** for token compression savings (20x cheaper)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Port 3001 already in use" | Kill processes: `powershell -Command "Get-Process node \| Stop-Process -Force"` |
| "Gateway offline" | Wait 30 seconds for startup; if persists: `openclaw gateway start` |
| "No agents loading" | Run: `node scripts/seed-all-agents.js` |
| "Postiz not posting" | Check API key in .env.local, restart server |

---

**You're live!** 🎉

