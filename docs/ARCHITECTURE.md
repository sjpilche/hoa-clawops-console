# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     BROWSER                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │            React Frontend (Vite)                   │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────────┐ │  │
│  │  │ Sidebar  │ │  Header  │ │   Kill Switch      │ │  │
│  │  │   Nav    │ │  + Status│ │   (always visible)  │ │  │
│  │  └─────────┘ └──────────┘ └────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │              Page Content                    │  │  │
│  │  │   (Dashboard / Agents / Monitor / etc.)     │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│         │ HTTP (REST)              │ WebSocket           │
└─────────┼──────────────────────────┼────────────────────┘
          ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│              Express BFF Server (port 3001)               │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Middleware: Auth → RateLimit → AuditLog → Routes │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌────────────┐  ┌─────────────┐  ┌────────────────┐   │
│  │  Routes    │  │  Services   │  │  WebSocket     │   │
│  │  (CRUD)    │  │  (Bridge)   │  │  (Socket.io)   │   │
│  └────────────┘  └──────┬──────┘  └────────────────┘   │
│         │               │                               │
│    ┌────▼────┐    ┌─────▼──────┐                       │
│    │ SQLite  │    │  OpenClaw  │                       │
│    │   DB    │    │   Bridge   │                       │
│    └─────────┘    └─────┬──────┘                       │
└─────────────────────────┼───────────────────────────────┘
                          ▼
              ┌───────────────────┐
              │     OpenClaw      │
              │  (Browser Agent   │
              │   Framework)      │
              └───────────────────┘
```

## Data Flow: Agent Run

```
1. User types "/run ap-invoice-extractor" in chat
2. ChatInput parses slash command
3. Frontend POST /api/agents/:id/run
4. Middleware pipeline: Auth → RateLimit → AuditLog
5. Route handler calls openclawBridge.runAgent()
6. Bridge validates: domain allowlist, budget limits
7. Bridge calls OpenClaw API to start the agent
8. WebSocket broadcasts agent:status = 'running'
9. Agent runs, streaming logs via WebSocket
10. On completion: results stored in SQLite
11. WebSocket broadcasts agent:status = 'success'
12. Chat shows completion message with results summary
```

## Safety Flow

```
User Intent → Confirmation Gate → Budget Check → Domain Check → Execution → Audit Log
                  ↓                    ↓              ↓              ↓          ↓
              "Run agent?"       Under budget?    Allowed URL?    OpenClaw     SQLite
              [Yes] [No]         Hard-stop if not  Block if not   API call     audit_log
```
