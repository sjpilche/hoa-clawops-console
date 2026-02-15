# ClawOps Console

> Enterprise-grade frontend for OpenClaw browser automation agents.
> "Financial Terminal Meets Modern Chat"

## What Is This?

ClawOps Console is a **chat-centric command center** for managing autonomous browser
agents powered by [OpenClaw](https://openclaw.ai). Instead of clicking through clunky
UIs, you talk to your agents like an operations manager:

```
/run ap-invoice-extractor
> Starting AP Invoice Extractor on Sage 300...
> ✅ Extracted 47 invoices | 2m 14s | $0.23 cost
```

## Tech Stack

| Layer        | Technology              | Why                                  |
| ------------ | ----------------------- | ------------------------------------ |
| Frontend     | React 18 + Vite         | Fast, familiar, battle-tested        |
| Styling      | Tailwind CSS + shadcn   | Same stack as HOA Project Intake     |
| State        | Zustand                 | Simple state, zero boilerplate       |
| Data Fetch   | TanStack Query v5       | Caching, retries, real-time sync     |
| Routing      | React Router v6         | Standard React routing               |
| Forms        | React Hook Form + Zod   | Validated forms with type safety     |
| WebSockets   | Socket.io               | Real-time agent status + logs        |
| Charts       | Recharts                | Agent performance visualization      |
| Backend      | Express (Node.js)       | Thin BFF proxy layer                 |
| Database     | SQLite (sql.js)         | Local-first, zero config             |
| Auth         | JWT + bcrypt            | Simple local auth                    |

## Quick Start

### 1. Start OpenClaw Gateway (WSL2)
```bash
# From Windows (recommended):
scripts\start-openclaw-gateway.bat

# Or from WSL2:
cd /home/sjpilche/projects/openclaw-v1
openclaw gateway run --port 8000
```

### 2. Start ClawOps Console
```bash
# Install dependencies (first time only):
npm install

# Start development server:
npm run dev
```

This starts both the Express server (port 3001) and the Vite dev server (port 5173).

### 3. Access the UI
Open http://localhost:5173 and login with:
- Email: `admin@clawops.local`
- Password: `changeme123`

📖 **Full setup guide**: See [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)

## Safety Model

**Every agent action follows this flow:**

```
User Intent → Confirmation Gate → Execution → Audit Log
```

There is NO path from intent to execution without logging. See `docs/AGENT-SAFETY.md`.

## Build Phases

- [x] Phase 1: Foundation Shell (app runs, login works, navigation works) ✅
- [x] Phase 2: Chat Core (messages, slash commands, persistence) ✅
- [x] Phase 3: OpenClaw Bridge (agent triggers, real-time status) ✅
- [x] Phase 4: Safety Layer (confirmations, budgets, kill switch) ✅
- [x] Phase 5: Operations Monitor (live dashboard, log streams) ✅
- [x] Phase 6: Results & Polish (data explorer, exports, metrics) ✅

**🎊 DEVELOPMENT PHASES COMPLETE!** Now in Phase 0: Security Hardening.

---

## 🔒 Phase 0: Security & Foundations (CURRENT)

**Status**: 🟢 62.5% Complete (10/16 tasks) — Quick Wins Session!
**Security Score**: 🟢 85/100 (Excellent) — 95/100 with HTTPS
**Tests**: ✅ 17/17 security tests passing

### ✅ Completed
- CVSS 9.8 command injection vulnerability fixed
- CVSS 9.1 weak JWT secret fixed (128-char cryptographically secure)
- 32+ Zod validation schemas deployed (100% API coverage)
- Secret management system with startup validation
- Comprehensive security test suite (17/17 passing)
- ✨ **Health check endpoint** (`/api/health`, `/api/health/ready`, `/api/health/live`)
- ✨ **Automated database backups** with 7-day rotation and integrity checks
- ✨ **HTTPS/TLS documentation** with mkcert setup guide

### 🔄 In Progress
- Unit/integration/E2E test frameworks
- Structured logging
- Error handling standardization

📋 **Full Progress**: [docs/MASTER-PLAN-PROGRESS.md](docs/MASTER-PLAN-PROGRESS.md)
🧪 **Testing Guide**: [docs/PHASE-0-TESTING-GUIDE.md](docs/PHASE-0-TESTING-GUIDE.md)

---

## OpenClaw Integration

ClawOps Console is now connected to OpenClaw via WebSocket!

**Connection**: `ws://127.0.0.1:8000` → OpenClaw Gateway (WSL2)

See [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md) for:
- How to start the gateway
- Architecture overview
- Troubleshooting
- Testing the connection
