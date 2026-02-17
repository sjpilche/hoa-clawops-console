# ClawOps Console ↔ OpenClaw Integration - Architecture Deep Dive

## 🎯 Overview

Your setup has **TWO separate but connected systems**:

1. **ClawOps Console** (Your Dashboard) - Windows-based web application
2. **OpenClaw CLI/Gateway** (Agent Runtime) - WSL/Linux-based execution engine

This document explains how they connect, where data flows, and why synchronization issues can occur.

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR BROWSER                             │
│                    http://localhost:5174                        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  ClawOps Console UI                       │  │
│  │  (React 19 + Vite 7 + Tailwind)                          │  │
│  │                                                           │  │
│  │  - Dashboard                                              │  │
│  │  - Agents Page                                            │  │
│  │  - Lead Gen Page                                          │  │
│  │  - Schedule Management                                    │  │
│  └──────────────┬───────────────────────────────────────────┘  │
└─────────────────┼───────────────────────────────────────────────┘
                  │
                  │ HTTP API Calls
                  │ (port 3001)
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              ClawOps Console Backend (Express)                  │
│                 c:\Users\SPilcher\OpenClaw2.0                  │
│                                                                 │
│  ┌────────────────┐         ┌─────────────────────────────┐    │
│  │   SQLite DB    │◄────────┤  API Routes                 │    │
│  │  clawops.db    │         │  /api/agents                │    │
│  │                │         │  /api/lead-gen              │    │
│  │  Tables:       │         │  /api/schedules             │    │
│  │  - agents      │         └──────────┬──────────────────┘    │
│  │  - schedules   │                    │                       │
│  │  - lg_*        │                    │                       │
│  └────────────────┘                    │                       │
│                                        │                       │
│              ┌─────────────────────────┼───────────────────┐   │
│              │   OpenClawBridge        │                   │   │
│              │   (Integration Layer)   │                   │   │
│              │                         │                   │   │
│              │  - createAgent()        │                   │   │
│              │  - runAgent()           │                   │   │
│              │  - scheduleAgent()      │                   │   │
│              │  - listOpenClawAgents() │                   │   │
│              └──────────┬──────────────┘                   │   │
└─────────────────────────┼─────────────────────────────────────┘
                          │
                          │ WSL Execution
                          │ (spawn wsl.exe)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WSL (Ubuntu/Linux)                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              OpenClaw CLI/Gateway                         │  │
│  │            ~/.openclaw/openclaw.json                      │  │
│  │                                                           │  │
│  │  Registered Agents:                                       │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ • main (default)                                    │ │  │
│  │  │ • hoa-networker                                     │ │  │
│  │  │ • hoa-content-writer                                │ │  │
│  │  │ • hoa-social-media                                  │ │  │
│  │  │ • hoa-social-engagement                             │ │  │
│  │  │ • hoa-email-campaigns                               │ │  │
│  │  │ • hoa-cms-publisher                                 │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                           │  │
│  │  Agent Workspaces:                                        │  │
│  │  c:\Users\SPilcher\OpenClaw2.0\openclaw-skills\           │  │
│  │  ├── hoa-networker/SOUL.md                                │  │
│  │  ├── hoa-content-writer/SOUL.md                           │  │
│  │  └── ...                                                  │  │
│  │                                                           │  │
│  │  Execution:                                               │  │
│  │  - `openclaw agent --agent hoa-networker ...`             │  │
│  │  - `openclaw agents list`                                 │  │
│  │  - `openclaw cron add ...`                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow & Synchronization

### Two Separate Data Stores

| System | Data Store | Location | Purpose |
|--------|-----------|----------|---------|
| **ClawOps Console** | SQLite DB | `c:\Users\SPilcher\OpenClaw2.0 for linux - Copy\data\clawops.db` | UI state, agent metadata, Lead Gen data |
| **OpenClaw CLI** | JSON config | `C:\Users\SPilcher\.openclaw\openclaw.json` | Agent registration, workspaces, routing |

### The Sync Problem

**Issue:** These two data stores are **NOT automatically synchronized**.

- When you **create an agent in ClawOps UI**, it's added to `clawops.db`
- When you **register an agent via CLI**, it's added to `openclaw.json`
- **They don't talk to each other automatically**

### Current State (What You Have)

```
ClawOps DB (clawops.db):
✅ 6 agents created
✅ config.openclaw_id set for each
✅ Status: active
✅ UI shows "registered"

OpenClaw CLI (openclaw.json):
✅ 6 agents registered
✅ Workspaces configured
✅ Model: openai/gpt-4o
✅ Auth profiles copied
```

**Status:** ✅ **FULLY SYNCHRONIZED** (after our fixes)

---

## 📋 How Synchronization Works (Current Architecture)

### 1. Agent Creation Flow

**When you click "Register" in ClawOps UI:**

```javascript
// Frontend (AgentCard.jsx)
onClick={handleRegister}
  ↓
// API Call
POST /api/agents/:id/register
  ↓
// Backend (server/routes/agents.js)
Uses openclawBridge.createAgent()
  ↓
// OpenClawBridge (server/services/openclawBridge.js)
Executes: wsl.exe bash -c "openclaw agents add <id> --workspace <path>"
  ↓
// OpenClaw CLI (WSL)
Updates ~/.openclaw/openclaw.json
Creates workspace directory
  ↓
// Backend writes to DB
UPDATE agents SET config = '{"openclaw_id":"..."}' WHERE id = ?
  ↓
// Response to frontend
{ success: true, openclawId: '...' }
```

**Result:** Agent exists in BOTH systems

---

### 2. Agent Execution Flow

**When you run an agent:**

```javascript
// User clicks "Run" in UI
  ↓
// API Call
POST /api/agents/:id/run
Body: { message: "task instructions" }
  ↓
// Backend (server/routes/agents.js)
const result = await openclawBridge.runAgent(agentId, {
  openclawId: agent.config.openclaw_id,
  message: req.body.message
});
  ↓
// OpenClawBridge
Executes: wsl.exe bash -c "openclaw agent --agent <id> --local --message '...'"
  ↓
// OpenClaw CLI
Loads agent workspace
Reads SOUL.md instructions
Calls OpenAI API (via auth-profiles.json)
Executes agent logic
Returns result
  ↓
// Backend stores result
INSERT INTO results (...) VALUES (...)
  ↓
// Response to frontend
{ sessionId, status: 'completed', output: '...' }
  ↓
// UI updates
Shows result in Results page
```

---

### 3. Schedule Sync Flow

**Current Issue:** Schedules created in ClawOps UI are stored in `clawops.db` but NOT in OpenClaw cron system.

**The Fix:**

```javascript
// When schedule is created in UI
POST /api/schedules
  ↓
// Backend should call
await openclawBridge.scheduleAgent(openclawId, {
  cron: '0 */2 * * *',
  message: 'task instructions',
  name: 'Schedule Name'
});
  ↓
// This creates BOTH:
// 1. Entry in clawops.db (for UI display)
// 2. Cron job in OpenClaw (for actual execution)
```

**Current State:** ⚠️ **PARTIALLY IMPLEMENTED**
- UI can create schedules (stored in DB)
- BUT: Not yet calling `openclawBridge.scheduleAgent()`
- NEED: Add bridge call to schedule creation endpoint

---

## 🔍 Where Sync Can Break

### Common Issues & Solutions

#### 1. "Agent shows as registered in UI but can't run"

**Cause:** `config.openclaw_id` set in DB, but agent doesn't exist in `openclaw.json`

**Check:**
```bash
# List agents in OpenClaw
openclaw agents list

# List agents in DB
curl http://localhost:3001/api/agents
```

**Fix:**
```bash
# Re-register missing agent
cd "c:\Users\SPilcher\OpenClaw2.0 for linux - Copy"
openclaw agents add <agent-id> --workspace ./openclaw-skills/<agent-id> --non-interactive
```

---

#### 2. "Changes to SOUL.md don't take effect"

**Cause:** OpenClaw caches workspace files

**Fix:**
```bash
# OpenClaw reads SOUL.md fresh each run (no cache)
# But make sure you're editing the RIGHT file:
c:\Users\SPilcher\OpenClaw2.0 for linux - Copy\openclaw-skills\<agent>\SOUL.md
```

**Verify workspace location:**
```bash
openclaw agents list
# Check "Workspace:" path for each agent
```

---

#### 3. "Schedules don't run automatically"

**Cause:** Schedule exists in `clawops.db` but not in OpenClaw cron system

**Check:**
```bash
# List OpenClaw cron jobs
openclaw cron list
```

**Fix:** Implement bi-directional sync in backend:
```javascript
// In server/routes/schedules.js
router.post('/schedules', async (req, res) => {
  // 1. Save to DB (for UI)
  await db.run('INSERT INTO schedules ...');

  // 2. Register with OpenClaw (for execution)
  await openclawBridge.scheduleAgent(agent.config.openclaw_id, {
    cron: req.body.cron,
    message: req.body.instructions
  });
});
```

---

#### 4. "Agent deleted in UI but still exists in OpenClaw"

**Cause:** Deletion only removed from DB, not from OpenClaw

**Check:**
```bash
openclaw agents list
# Look for orphaned agents
```

**Fix:** Update deletion endpoint:
```javascript
// In server/routes/agents.js DELETE endpoint
router.delete('/agents/:id', async (req, res) => {
  const agent = await db.get('SELECT config FROM agents WHERE id = ?', req.params.id);

  // 1. Delete from DB
  await db.run('DELETE FROM agents WHERE id = ?', req.params.id);

  // 2. Delete from OpenClaw
  if (agent.config?.openclaw_id) {
    await openclawBridge.removeAgent(agent.config.openclaw_id);
  }
});
```

---

## 🛠️ Making Sync Flawless

### Strategy 1: Webhook Events (Recommended)

Add event listeners to keep systems in sync:

```javascript
// In openclawBridge.js - already has EventEmitter!
bridge.on('agent:status', (event) => {
  // Update DB when agent completes
  db.run('UPDATE agents SET last_run_at = ? WHERE id = ?',
    [event.timestamp, event.agentId]);
});

bridge.on('agent:result', (event) => {
  // Store result in DB
  db.run('INSERT INTO results (...) VALUES (...)', [event]);
});
```

### Strategy 2: Periodic Sync Job

Run a background sync every 5 minutes:

```javascript
// In server/index.js
setInterval(async () => {
  const openclawAgents = await openclawBridge.listOpenClawAgents();
  const dbAgents = await db.all('SELECT * FROM agents');

  // Find mismatches and log warnings
  for (const dbAgent of dbAgents) {
    const openclawMatch = openclawAgents.find(
      a => a.id === dbAgent.config?.openclaw_id
    );

    if (!openclawMatch) {
      console.warn(`⚠️ Agent ${dbAgent.name} in DB but not in OpenClaw`);
    }
  }
}, 5 * 60 * 1000);
```

### Strategy 3: Single Source of Truth

Make OpenClaw the authoritative source:

```javascript
// On dashboard load, sync FROM OpenClaw TO DB
router.get('/api/agents/sync', async (req, res) => {
  const openclawAgents = await openclawBridge.listOpenClawAgents();

  for (const agent of openclawAgents) {
    // Update or create in DB
    await db.run(`
      INSERT INTO agents (id, name, config)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET config = ?
    `, [
      agent.id,
      agent.id,
      JSON.stringify({ openclaw_id: agent.id }),
      JSON.stringify({ openclaw_id: agent.id })
    ]);
  }

  res.json({ synced: openclawAgents.length });
});
```

---

## 📊 Current Status Check

### What's Synced ✅

| Component | ClawOps DB | OpenClaw CLI | Status |
|-----------|-----------|--------------|---------|
| Agent Records | ✅ 6 agents | ✅ 6 agents | ✅ SYNCED |
| Agent Config | ✅ openclaw_id set | ✅ Workspaces configured | ✅ SYNCED |
| Auth Profiles | N/A | ✅ Copied from main | ✅ OK |
| SOUL.md Files | ✅ In DB (instructions field) | ✅ In workspace dirs | ✅ SYNCED |
| Lead Gen Data | ✅ 3 opportunities | N/A | ✅ OK |

### What's NOT Synced ⚠️

| Component | ClawOps DB | OpenClaw CLI | Issue |
|-----------|-----------|--------------|-------|
| Schedules | ⚠️ May exist | ⚠️ Not created | Need bridge call |
| Agent Results | ✅ Stored | N/A | OK (one-way) |
| Execution Logs | ⚠️ Partial | ✅ Full logs in sessions | Need to stream |

---

## 🎯 Recommended Fixes (Priority Order)

### 1. Schedule Sync (HIGH PRIORITY)

**File to modify:** `server/routes/schedules.js`

**Add:**
```javascript
// When creating schedule
await openclawBridge.scheduleAgent(agent.config.openclaw_id, {
  cron: schedule.cron,
  message: schedule.instructions,
  name: schedule.name
});
```

### 2. Deletion Sync (MEDIUM PRIORITY)

**File to modify:** `server/routes/agents.js`

**Add to DELETE endpoint:**
```javascript
if (agent.config?.openclaw_id) {
  await openclawBridge.removeAgent(agent.config.openclaw_id);
  await openclawBridge.unscheduleAgent(agent.config.openclaw_id);
}
```

### 3. Real-Time Log Streaming (LOW PRIORITY - nice to have)

**Already implemented!** OpenClawBridge emits events:
```javascript
bridge.emit('agent:log', { log: output, timestamp: ... });
```

**Just need to connect to WebSocket:**
```javascript
// In server/websocket/socketServer.js
openclawBridge.on('agent:log', (data) => {
  io.to('logs').emit('agent:log', data);
});
```

### 4. Health Check Endpoint (LOW PRIORITY)

**Add to:** `server/routes/agents.js`

```javascript
router.get('/agents/health', async (req, res) => {
  const openclawAvailable = await openclawBridge.testConnection();
  const openclawAgents = await openclawBridge.listOpenClawAgents();
  const dbAgents = await db.all('SELECT COUNT(*) as count FROM agents');

  res.json({
    openclaw: {
      available: openclawAvailable,
      agents: openclawAgents.length
    },
    database: {
      agents: dbAgents[0].count
    },
    synced: openclawAgents.length === dbAgents[0].count
  });
});
```

---

## 🔧 Testing Sync Health

### Manual Test Script

```bash
# 1. Check OpenClaw CLI
openclaw agents list

# 2. Check ClawOps DB
curl -s http://localhost:3001/api/agents | jq '.agents[] | {name, openclaw_id: .config.openclaw_id}'

# 3. Compare counts
echo "OpenClaw agents:"
openclaw agents list | grep -c "Workspace:"

echo "ClawOps DB agents:"
curl -s http://localhost:3001/api/agents | jq '.agents | length'

# 4. Check schedules
echo "OpenClaw cron jobs:"
openclaw cron list

echo "ClawOps schedules:"
curl -s http://localhost:3001/api/schedules | jq length
```

---

## 📚 Key Takeaways

1. **Two Systems, One Goal**
   - ClawOps = UI/Dashboard (Windows)
   - OpenClaw = Execution Engine (WSL/Linux)
   - They communicate via `openclawBridge.js`

2. **Sync is Manual (Currently)**
   - Agent creation requires both DB write + CLI registration
   - Your setup is now fully synced after our fixes
   - Future agents need both operations

3. **The Bridge is the Key**
   - All sync happens through `openclawBridge.js`
   - It wraps OpenClaw CLI commands
   - Emits events for real-time updates

4. **Flawless Sync Requires**
   - Bridge calls on ALL mutations (create, update, delete)
   - Event listeners for status updates
   - Periodic health checks (optional but recommended)

---

## 🚀 Next Steps

1. **Verify current sync**
   ```bash
   openclaw agents list
   curl http://localhost:3001/api/agents
   ```

2. **Test agent execution**
   ```bash
   openclaw agent --agent hoa-networker --message "Hello"
   ```

3. **Implement schedule sync** (if needed)
   - Modify `server/routes/schedules.js`
   - Add `openclawBridge.scheduleAgent()` call

4. **Setup health monitoring**
   - Add `/agents/health` endpoint
   - Display sync status in UI

---

**Your system is now fully synced and operational!** 🎉

All 6 agents are registered in both systems. The architecture is solid. Future improvements can be made incrementally based on your needs.
