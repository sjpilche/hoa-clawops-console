# 🚀 ClawOps Console - Quick Start Guide

## What Is This?

**ClawOps Console** is a web-based UI for managing your OpenClaw AI agents. It provides:
- 🖥️ **Dashboard** - Monitor all your agents
- 💬 **Chat Interface** - Talk to agents like Slack/Discord
- 📊 **Real-time Monitoring** - See agent runs in action
- 🛡️ **Safety Controls** - Budget limits, kill switch, audit logs

---

## ⚡ Quick Start (One-Click)

### Start Everything
**Double-click:** `START-CLAWOPS.bat`

This will:
1. Start the Express API server (port 3001)
2. Start the Vite frontend (port 5177)
3. Open your browser to http://localhost:5177

### Stop Everything
**Double-click:** `STOP-CLAWOPS.bat`

---

## 🔐 Login

**Default Credentials:**
- Email: `admin@clawops.local`
- Password: `changeme123`

⚠️ **Change this password after first login!**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│  Your Browser (http://localhost:5177)   │
│  - ClawOps Console UI                   │
│  - Dashboard, Agents, Monitor, Chat     │
└───────────────┬─────────────────────────┘
                │ HTTP + WebSocket
┌───────────────▼─────────────────────────┐
│  Express Server (localhost:3001)        │
│  - REST API                             │
│  - Authentication                       │
│  - OpenClaw Bridge                      │
└───────────────┬─────────────────────────┘
                │ Shell Commands
┌───────────────▼─────────────────────────┐
│  OpenClaw (WSL2)                        │
│  /home/sjpilche/projects/openclaw-v1/   │
│  - AI Agents (GPT-4o)                   │
│  - Browser Automation                   │
└─────────────────────────────────────────┘
```

**How they connect:**
- ClawOps Console runs `openclaw agent --local --message "..."` via WSL
- Results come back and are displayed in the UI
- Everything is tracked in the SQLite database

---

## 📂 Project Structure

```
OpenClaw2.0 for linux/
├── START-CLAWOPS.bat          ← Double-click to start
├── STOP-CLAWOPS.bat           ← Double-click to stop
├── server/                    ← Express backend
│   ├── index.js              ← Server entry point
│   ├── routes/               ← API endpoints
│   └── services/
│       └── openclawBridge.js ← Connects to OpenClaw
├── src/                       ← React frontend
│   ├── App.jsx
│   ├── pages/                ← Dashboard, Agents, etc.
│   └── components/
├── data/
│   └── clawops.db            ← SQLite database
└── .env.local                ← Configuration
```

---

## 🧪 Testing the Connection

### Test API Health
```bash
curl http://localhost:3001/api/health
```

### Test OpenClaw Integration (No Auth)
```bash
curl -X POST http://localhost:3001/api/test/run-agent \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is 2+2?\"}"
```

Expected response:
```json
{
  "success": true,
  "output": "2 + 2 equals 4.\n"
}
```

---

## 🎯 Next Steps

### 1. **Create Your First Agent**
1. Click **"Agents"** in the sidebar
2. Click **"New Agent"**
3. Configure:
   - Name: "Invoice Extractor"
   - Description: "Extracts invoices from Sage 300"
   - Target System: "Sage 300"
   - Domains: `["sage300.example.com"]`

### 2. **Run an Agent** (via test endpoint for now)
```bash
curl -X POST http://localhost:3001/api/test/run-agent \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Extract invoices from Sage 300\"}"
```

### 3. **Build Phase 2: Chat Interface**
The chat UI is planned for Phase 2. You'll be able to type:
```
/run invoice-extractor
> Starting Invoice Extractor...
> ✅ Extracted 47 invoices | 2m 14s
```

---

## 🔧 Configuration

Edit `.env.local` to customize:

```bash
# Server Ports
SERVER_PORT=3001
VITE_DEV_PORT=5173

# OpenClaw Connection
OPENCLAW_MODE=shell                    # shell or gateway
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789

# Security
JWT_SECRET=dev-only-secret-change-in-production
DEFAULT_ADMIN_EMAIL=admin@clawops.local
DEFAULT_ADMIN_PASSWORD=changeme123

# Safety Limits
MAX_CONCURRENT_AGENTS=3
MAX_COST_PER_RUN=5.00
MAX_DURATION_PER_RUN=300
```

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Run STOP-CLAWOPS.bat, then START-CLAWOPS.bat again
```

### Can't Login
```bash
# Reset admin user
curl -X POST http://localhost:3001/api/test/create-admin
```

### OpenClaw Not Found
```bash
# Verify OpenClaw is installed in WSL2
wsl bash -c "cd /home/sjpilche/projects/openclaw-v1 && source ~/.nvm/nvm.sh && openclaw --version"
```

---

## 📚 Documentation

- **Integration Guide**: [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)
- **Integration Test Results**: [INTEGRATION-SUCCESS.md](./INTEGRATION-SUCCESS.md)
- **Architecture Details**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **API Reference**: [docs/API-REFERENCE.md](./docs/API-REFERENCE.md)

---

## 🆘 Support

- **Test Endpoints**: http://localhost:3001/api/test/ping
- **Health Check**: http://localhost:3001/api/health
- **Server Logs**: Check the terminal where you ran `START-CLAWOPS.bat`

---

## ✅ Current Status

| Component | Status | URL |
|-----------|--------|-----|
| Frontend UI | ✅ Working | http://localhost:5177 |
| Express API | ✅ Working | http://localhost:3001 |
| OpenClaw Bridge | ✅ Working | Shell mode (WSL2) |
| Database | ✅ Working | SQLite (./data/clawops.db) |
| Authentication | ✅ Working | JWT-based |
| Agent Execution | ✅ Tested | Via test endpoints |

**Phase 1 Complete!** The foundation is solid and ready for Phase 2 (Chat Core).

---

**Made with ❤️ for browser automation**
