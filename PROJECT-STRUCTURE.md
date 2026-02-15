# ClawOps Console - Project Structure

## Overview

ClawOps Console is a web-based management interface for OpenClaw agents. It provides agent creation, execution, monitoring, and scheduling capabilities.

**Current Version:** 1.0 (Single-Domain)
**Next Version:** 2.0 (Multi-Domain Platform) - See [ROADMAP.md](ROADMAP.md)

---

## Directory Structure

```
clawops/
├── server/                     # Backend (Express + SQLite)
│   ├── db/                     # Database layer
│   │   ├── schema.sql          # SQLite schema definition
│   │   └── connection.js       # sql.js wrapper + persistence
│   ├── routes/                 # API endpoints
│   │   ├── agents.js           # Agent CRUD + execution
│   │   ├── auth.js             # Authentication & JWT
│   │   ├── chat.js             # Chat interface
│   │   ├── runs.js             # Run history
│   │   ├── settings.js         # System settings
│   │   └── health.js           # Health checks
│   ├── services/               # Business logic
│   │   ├── openclawBridge.js   # WSL OpenClaw integration
│   │   └── commandHandler.js   # Slash command processing
│   ├── middleware/             # Express middleware
│   │   ├── auth.js             # JWT verification
│   │   ├── validator.js        # Zod schema validation
│   │   ├── errorHandler.js     # Error handling
│   │   ├── auditLogger.js      # Audit trail
│   │   └── rateLimiter.js      # Rate limiting
│   ├── schemas/                # Zod validation schemas
│   ├── websocket/              # Real-time communication
│   └── index.js                # Server entry point
├── src/                        # Frontend (React 19 + Vite)
│   ├── pages/                  # Page components
│   │   ├── DashboardPage.jsx   # Overview dashboard
│   │   ├── AgentsPage.jsx      # Agent list
│   │   ├── AgentBuilderPage.jsx # Agent creation/edit
│   │   ├── AgentDetailPage.jsx # Agent details
│   │   ├── SchedulePage.jsx    # Scheduling
│   │   ├── MonitorPage.jsx     # Real-time monitoring
│   │   ├── ResultsPage.jsx     # Run results
│   │   └── SettingsPage.jsx    # Settings
│   ├── components/             # Reusable components
│   │   ├── ui/                 # Base UI components
│   │   └── [feature]/          # Feature-specific components
│   ├── stores/                 # Zustand state management
│   ├── lib/                    # Utilities
│   │   └── api.js              # API client
│   ├── hooks/                  # Custom React hooks
│   └── App.jsx                 # App entry point
├── data/                       # SQLite database files
│   └── clawops.db              # Main database
├── backups/                    # Database backups
├── docs/                       # Documentation
│   └── archive/                # Historical documentation
├── dev-utils/                  # Development utilities (archived)
├── public/                     # Static assets
├── scripts/                    # Utility scripts
├── .claude/                    # Claude Code configuration
├── START-CLAWOPS.bat           # Launch servers
├── START-CLEAN.bat             # Clean start (reset DB)
├── STOP-CLAWOPS.bat            # Stop servers
├── README.md                   # Main documentation
├── QUICKSTART.md               # Getting started guide
├── ROADMAP.md                  # Development roadmap (2.0 plan)
├── package.json                # Dependencies
└── vite.config.js              # Vite configuration
```

---

## Key Technologies

**Backend:**
- Node.js + Express (REST API)
- SQLite via sql.js (in-memory + disk persistence)
- Socket.io (real-time communication)
- Zod (schema validation)
- bcrypt (password hashing)
- JWT (authentication)

**Frontend:**
- React 19 (UI framework)
- Vite (build tool)
- Tailwind CSS 4 (styling)
- Zustand (state management)
- React Router (routing)
- Lucide React (icons)

**Integration:**
- OpenClaw CLI via WSL (agent execution)
- Command-line bridge with secure arg passing

---

## Architecture Layers

### 1. Frontend (Port 5173)
- React SPA with Vite dev server
- Communicates with backend via REST + WebSocket
- JWT token stored in localStorage

### 2. Backend (Port 3001)
- Express REST API
- SQLite database (sql.js)
- WebSocket server for real-time updates
- Authentication & authorization
- Audit logging

### 3. OpenClaw Bridge (WSL)
- Executes OpenClaw CLI commands via `wsl.exe`
- Secure argument passing (array-based, no shell injection)
- Process management with timeouts
- JSON output parsing

### 4. Database (SQLite)
- In-memory operation with disk persistence
- Tables: users, agents, runs, chat_threads, chat_messages, audit_log, settings, credentials
- File location: `data/clawops.db`

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/register` - Register user
- `POST /api/auth/clear-rate-limit` - Clear rate limit

### Agents
- `GET /api/agents` - List agents
- `GET /api/agents/:id` - Get agent details
- `POST /api/agents` - Create agent
- `PUT /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent
- `POST /api/agents/:id/run` - Execute agent

### Chat
- `GET /api/chat/threads` - List threads
- `POST /api/chat/threads` - Create thread
- `GET /api/chat/threads/:id` - Get messages
- `POST /api/chat/threads/:id/messages` - Send message

### Runs
- `GET /api/runs` - List runs
- `GET /api/runs/:id` - Get run details

### Settings
- `GET /api/settings` - Get all settings
- `PUT /api/settings/:key` - Update setting

### Health
- `GET /api/health` - System health check

---

## Database Schema

### Core Tables

**users** - Authentication
- id, email, password, name, role

**agents** - Agent registry
- id, name, description, target_system, status, config, domains, permissions, instructions, metrics

**runs** - Execution history
- id, agent_id, user_id, status, trigger, timing, costs, results, safety

**chat_threads** - Conversations
- id, title, user_id, run_id, is_active

**chat_messages** - Messages
- id, thread_id, sender_type, content, msg_type, metadata

**audit_log** - Audit trail (immutable)
- id, timestamp, user_id, action, resource, details, outcome

**settings** - Configuration
- key, value, description

**credentials** - Encrypted credentials (planned)
- id, name, target_system, encrypted_value

---

## Development Commands

```bash
# Install dependencies
npm install

# Start development servers (frontend + backend)
./START-CLAWOPS.bat

# Start clean (reset database)
./START-CLEAN.bat

# Stop servers
./STOP-CLAWOPS.bat

# Frontend only
npm run dev

# Backend only
npm run server

# Build for production
npm run build
```

---

## Security Features

1. **Authentication**: JWT tokens with bcrypt password hashing
2. **Rate Limiting**: Brute-force protection on login (5 attempts / 15 min)
3. **Command Injection Prevention**: Array-based spawn args, no shell
4. **Input Validation**: Zod schema validation on all endpoints
5. **Audit Logging**: Every action logged to immutable audit_log table
6. **Security Headers**: Helmet.js (CSP, HSTS, X-Frame-Options)
7. **CORS**: Tightened to localhost origins

---

## Configuration

**Environment Variables:**
- `JWT_SECRET` - JWT signing key (min 32 chars)
- `OPENCLAW_PATH` - Path to OpenClaw in WSL (default: `/home/sjpilche/projects/openclaw-v1`)
- `OPENCLAW_MODE` - Execution mode: `shell` (default)
- `PORT` - Backend port (default: 3001)
- `NODE_ENV` - Environment: `development` | `production`

**Settings (via UI or database):**
- `max_concurrent_agents` - Max agents running simultaneously (default: 3)
- `max_cost_per_run` - Max USD per run (default: $5.00)
- `max_duration_per_run` - Max seconds per run (default: 300)
- `max_tokens_per_run` - Max tokens per run (default: 100,000)
- `data_retention_days` - Auto-purge results (default: 90 days)

---

## Archived Development Utilities

Located in `dev-utils/`:
- `check-db.js` - Database inspection utility
- `clear-auth.html` - Auth testing page
- `clear-rate-limit.js` - Rate limit reset script
- `test-agent-run.js` - Agent execution testing
- `test-connection.js` - OpenClaw connection test
- `test-phase0.js` - Phase 0 validation tests
- `test-server.bat` - Server testing script

These utilities are preserved for reference but not needed for normal operation.

---

## Next Steps

See [ROADMAP.md](ROADMAP.md) for the **Multi-Domain Platform** (v2.0) transformation plan.

**Key Enhancements:**
- Multiple business domains (marketing, operations, finance, etc.)
- Extension management (discover and configure OpenClaw plugins)
- Agent hierarchies (commander → coordinators → specialists)
- Tool discovery and access control
- Domain-specific dashboards
- Advanced orchestration patterns

---

## Contributing

This is an internal project. For questions or issues, consult:
- Main documentation: [README.md](README.md)
- Quick start guide: [QUICKSTART.md](QUICKSTART.md)
- Development roadmap: [ROADMAP.md](ROADMAP.md)
- Implementation plan: `.claude/plans/staged-seeking-flask.md`

---

*Last Updated: February 12, 2026*
