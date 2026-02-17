# 🚀 Blitz Mode - READY TO TEST!

## ✅ What's Been Implemented

### Backend (100% Complete)
- ✅ Database schema added (2 new tables: `blitz_runs`, `blitz_results`)
- ✅ API routes created (`server/routes/blitz.js`)
- ✅ Routes registered in server
- ✅ Agent prompts configured for all 6 agents
- ✅ Sequential execution logic
- ✅ Real-time status tracking
- ✅ Error handling and recovery

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/blitz/run` | POST | Start new blitz run |
| `/api/blitz/status/:runId` | GET | Get current status & progress |
| `/api/blitz/results/:runId` | GET | Get detailed results |
| `/api/blitz/history` | GET | List all previous runs |

---

## 🧪 Testing the Backend (Right Now!)

### Quick Test

```bash
# 1. Start a blitz run
curl -X POST http://localhost:3001/api/blitz/run

# Response:
{
  "success": true,
  "runId": 1,
  "message": "Blitz run started with 6 agents",
  "totalAgents": 6
}

# 2. Check status (use the runId from above)
curl http://localhost:3001/api/blitz/status/1

# 3. View results when complete
curl http://localhost:3001/api/blitz/results/1
```

### Using the Test Script

**Double-click:** `TEST-BLITZ.bat`

This will:
1. Start a blitz run
2. Poll status every 5 seconds
3. Show you real-time progress

---

## 📊 What Happens When You Run Blitz

### Execution Flow

```
User clicks "Run Blitz"
  ↓
POST /api/blitz/run
  ↓
Create blitz_run record (ID: 1)
  ↓
Create 6 pending blitz_results
  ↓
Start background execution
  ↓
For each agent (sequential):
  ├─ Update status to 'running'
  ├─ Call openclawBridge.runAgent()
  ├─ Capture output
  ├─ Store result in database
  └─ Update progress
  ↓
Mark run as 'completed'
  ↓
Frontend polls for updates
  ↓
Display all outputs
```

### Test Prompts Per Agent

**1. HOA Content Writer**
```
Write a 300-word blog post about why HOAs should build reserve funds
gradually rather than using special assessments.
```

**2. HOA Social Media**
```
Create 3 LinkedIn posts (each 150 words max) about HOA reserve funding
best practices.
```

**3. HOA Social Engagement**
```
Draft a helpful response to a Reddit post about draining reserves to
avoid raising fees.
```

**4. HOA Email Campaigns**
```
Create a 3-email drip campaign for HOA boards considering financing options.
```

**5. HOA CMS Publisher**
```
Generate SEO metadata for "HOA Reserve Study Guide 2026".
```

**6. HOA Networker**
```
Review the Lead Gen queue and summarize top opportunities.
```

---

## 🎨 Frontend UI (Next Step)

### File to Create
`src/pages/BlitzPage.jsx`

### Features
- ⚡ "Start Blitz Run" button
- 📊 Real-time progress bar
- 🎯 Agent status cards (pending, running, completed, failed)
- 📝 Output display with expand/collapse
- ⏱️ Timing metrics
- 📜 Run history

### Navigation
Add to sidebar between "Lead Gen" and "Audit Log":
```javascript
{ path: '/blitz', label: 'Blitz Mode', icon: 'Zap' }
```

---

## 📋 Database Schema

### blitz_runs
```sql
id                INTEGER PRIMARY KEY AUTOINCREMENT
status            TEXT DEFAULT 'running'  -- running, completed, failed
started_at        TEXT
completed_at      TEXT
total_agents      INTEGER DEFAULT 6
completed_agents  INTEGER DEFAULT 0
failed_agents     INTEGER DEFAULT 0
total_duration_ms INTEGER
```

### blitz_results
```sql
id                INTEGER PRIMARY KEY AUTOINCREMENT
blitz_run_id      INTEGER  -- FK to blitz_runs
agent_id          TEXT
agent_name        TEXT
prompt            TEXT     -- The test prompt used
output            TEXT     -- Agent's response
status            TEXT     -- pending, running, completed, failed
started_at        TEXT
completed_at      TEXT
duration_ms       INTEGER  -- How long this agent took
error             TEXT     -- If failed, why
```

---

## 🔍 Example API Responses

### POST /api/blitz/run
```json
{
  "success": true,
  "runId": 1,
  "message": "Blitz run started with 6 agents",
  "totalAgents": 6
}
```

### GET /api/blitz/status/1 (while running)
```json
{
  "success": true,
  "run": {
    "id": 1,
    "status": "running",
    "started_at": "2026-02-14 20:30:15",
    "completed_at": null,
    "total_agents": 6,
    "completed_agents": 2,
    "failed_agents": 0,
    "total_duration_ms": null
  },
  "results": [
    {
      "id": 1,
      "agent_name": "HOA Content Writer",
      "status": "completed",
      "duration_ms": 2341,
      "error": null
    },
    {
      "id": 2,
      "agent_name": "HOA Social Media",
      "status": "completed",
      "duration_ms": 3102,
      "error": null
    },
    {
      "id": 3,
      "agent_name": "HOA Social Engagement",
      "status": "running",
      "duration_ms": null,
      "error": null
    },
    // ... rest pending
  ],
  "progress": {
    "total": 6,
    "completed": 2,
    "failed": 0,
    "percentage": 33
  }
}
```

### GET /api/blitz/results/1 (when complete)
```json
{
  "success": true,
  "run": {
    "id": 1,
    "status": "completed",
    "started_at": "2026-02-14 20:30:15",
    "completed_at": "2026-02-14 20:31:03",
    "total_agents": 6,
    "completed_agents": 6,
    "failed_agents": 0,
    "total_duration_ms": 48234
  },
  "results": [
    {
      "id": 1,
      "agent_id": "uuid-1",
      "agent_name": "HOA Content Writer",
      "prompt": "Write a 300-word blog post...",
      "output": "**Building Reserve Funds: The Smart HOA Strategy**\n\nSuccessful HOA management...",
      "status": "completed",
      "started_at": "2026-02-14 20:30:15",
      "completed_at": "2026-02-14 20:30:17",
      "duration_ms": 2341,
      "error": null
    },
    // ... 5 more agents
  ]
}
```

---

## 🎯 Expected Results

### Timing (Approximate)
- **HOA Content Writer**: 2-4 seconds
- **HOA Social Media**: 3-5 seconds
- **HOA Social Engagement**: 2-3 seconds
- **HOA Email Campaigns**: 4-6 seconds
- **HOA CMS Publisher**: 1-2 seconds
- **HOA Networker**: 1-2 seconds

**Total Runtime**: 15-25 seconds for all 6 agents

### Success Criteria
- ✅ All 6 agents execute without errors
- ✅ Each agent produces relevant output
- ✅ Output matches the prompt intent
- ✅ Timing data captured accurately
- ✅ Status updates work in real-time

---

## 🐛 Troubleshooting

### "Agent failed with error"
**Check:**
1. Is OpenClaw CLI working? `openclaw agents list`
2. Are auth profiles copied? Check `~/.openclaw/agents/<agent>/agent/auth-profiles.json`
3. Check server logs for details

**Fix:**
```bash
# Test individual agent
openclaw agent --agent hoa-content-writer --message "test"
```

### "No output captured"
**Possible causes:**
- Agent returned empty response
- OpenAI API error
- Prompt too complex

**Fix:**
Check blitz_results.error column for specific error message

### "Run stuck in 'running' status"
**Cause:** Background execution crashed

**Fix:**
```bash
# Check server logs
tail -50 <path-to-server-output>

# Manually mark as failed
curl -X PATCH http://localhost:3001/api/blitz/status/1 -d '{"status":"failed"}'
```

---

## 📈 Next Steps

### 1. Test Backend (NOW)
```bash
# Terminal 1: Watch server logs
tail -f <server-output-file>

# Terminal 2: Run blitz
curl -X POST http://localhost:3001/api/blitz/run

# Terminal 3: Poll status
while true; do
  curl -s http://localhost:3001/api/blitz/status/1 | jq .progress
  sleep 2
done
```

### 2. Build Frontend UI (NEXT)
Create `src/pages/BlitzPage.jsx` with:
- Start button
- Progress display
- Result cards
- History view

### 3. Add to Navigation
Update `src/lib/constants.js`:
```javascript
{ path: '/blitz', label: 'Blitz Mode', icon: 'Zap' }
```

### 4. Test End-to-End
1. Click "Blitz Mode" in sidebar
2. Click "Start Blitz Run"
3. Watch real-time progress
4. Review all 6 outputs
5. Evaluate quality

---

## 🎉 What You Can Do NOW

**Backend is READY!** You can:

1. **Test via curl:**
   ```bash
   curl -X POST http://localhost:3001/api/blitz/run
   ```

2. **Run the test script:**
   ```
   Double-click: TEST-BLITZ.bat
   ```

3. **Check results in database:**
   ```bash
   # After run completes
   curl http://localhost:3001/api/blitz/results/1 | jq .
   ```

---

## 📝 Implementation Summary

### Files Created
- ✅ `server/routes/blitz.js` (372 lines)
- ✅ `BLITZ-MODE-PLAN.md` (Full specification)
- ✅ `TEST-BLITZ.bat` (Test script)
- ✅ `BLITZ-MODE-READY.md` (This file)

### Files Modified
- ✅ `server/db/schema.sql` (Added blitz tables)
- ✅ `server/index.js` (Registered blitz routes)

### Database Tables
- ✅ `blitz_runs` (Track runs)
- ✅ `blitz_results` (Store agent outputs)
- ✅ 3 indexes for performance

### API Endpoints
- ✅ POST `/api/blitz/run` - Start run
- ✅ GET `/api/blitz/status/:runId` - Get status
- ✅ GET `/api/blitz/results/:runId` - Get results
- ✅ GET `/api/blitz/history` - List runs

---

**Backend is 100% complete and ready to test!**

The frontend UI is the only remaining piece. Should I build that next, or do you want to test the backend API first? 🚀
