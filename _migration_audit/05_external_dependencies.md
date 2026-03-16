# 05 — External Dependencies

Everything this system needs beyond the repo itself.

---

## Runtimes

| Runtime | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| Node.js | 24.x | Server, client, all services | `nvm install 24` or download from nodejs.org |
| npm | (bundled) | Package management | Comes with Node.js |
| Python 3 | 3.10+ | yt-dlp for RSE transcripts | `winget install python` or python.org |
| tsx | (npm) | TypeScript execution for trader service | `npm install` (in devDependencies) |

---

## CLIs (Global Installs)

| CLI | Version | Purpose | Install Command |
|-----|---------|---------|-----------------|
| `openclaw` | v2026.3.12 | Agent execution bridge | `npm install -g openclaw` |
| `pm2` | latest | Process management (3 services) | `npm install -g pm2` |
| `ollama` | latest | Local LLM inference ($0) | Download from ollama.com |
| `yt-dlp` | latest | YouTube transcript extraction | `pip install yt-dlp` |

---

## Ollama Models (Must Be Pulled)

| Model | Size | Used By | Pull Command |
|-------|------|---------|--------------|
| `llama3.2:3b` | ~2 GB | RSE signal scorer, opportunity scanner, idle trainer, DOM extractor | `ollama pull llama3.2:3b` |
| `deepseek-coder-v2:16b` | ~9 GB | Software factory, RSE code builder | `ollama pull deepseek-coder-v2:16b` |

---

## External API Services

| Service | Env Var(s) | Used By | Cost | Critical? |
|---------|-----------|---------|------|-----------|
| **OpenAI** | `OPENAI_API_KEY` | All LLM agents (GPT-4o/mini) | ~$0.025/run | YES |
| **Ollama** (local) | `OLLAMA_HOST`, `OLLAMA_PORT` | RSE, Opportunity Engine, fallbacks | $0 | YES (for $0 agents) |
| **Azure SQL** | `AZURE_SQL_SERVER/DATABASE/USER/PASSWORD` | Collective brain (4 tables) | included | YES (brain) |
| **SendGrid** | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | outreach-sender, email campaigns | pay-per-send | YES (outreach) |
| **Discord** | `DISCORD_WEBHOOK_URL`, `DISCORD_BOT_TOKEN` | All agents (notifications) | $0 | NO (graceful fail) |
| **GitHub** | `GITHUB_TOKEN` | hoa-cms-publisher (blog deploy) | $0 | NO (blog only) |
| **Facebook** | `FACEBOOK_*` (2 apps) | hoa-facebook-poster, lead gen | $0 | NO |
| **LinkedIn** | `LINKEDIN_*` | linkedin-direct-poster | $0 | NO |
| **Twitter/X** | `TWITTER_*` | jake-twitter-poster | $0 | NO |
| **Brave Search** | `BRAVE_API_KEY` | Contact discovery (fallback) | $0 (free tier) | NO |
| **Alpaca** | `BROKER_API_KEY/SECRET` | Trader service (paper trading) | $0 (paper) | NO (separate service) |
| **Grok (xAI)** | `GROK_API_KEY` | Trader AI panel | per-call | NO (trader only) |
| **Twilio** | `TWILIO_*` | sms-follow-up | $0.0075/sms | NO |
| **Polymarket** | `POLYMARKET_*` | Trader prediction markets | read-only | NO |

---

## Ports

| Port | Service | Protocol | Binding |
|------|---------|----------|---------|
| 3001 | ClawOps Server (Express) | HTTP | localhost |
| 5174 | ClawOps Client (Vite dev) | HTTP | localhost |
| 3002 | Trader Service | HTTP | localhost |
| 18789 | OpenClaw Gateway | WebSocket | 127.0.0.1 |
| 11434 | Ollama | HTTP | 127.0.0.1 |
| 6379 | Redis (optional) | TCP | localhost |
| 8096 | DC Site Intel (optional) | HTTP | localhost |
| 9090 | Prometheus (trader) | HTTP | localhost |

---

## Databases

| Database | Type | Location | Size | Purpose |
|----------|------|----------|------|---------|
| clawops.db | SQLite (sql.js) | `data/clawops.db` | 59.7 MB | Primary — agents, runs, schedules, leads, brain fallback |
| trader-brain.sqlite | SQLite | `services/trader-service/data/` | 4 KB+ | Trading brain (4-layer learning) |
| hoa_leads.sqlite | SQLite | root | 1.3 MB | Legacy HOA leads |
| empcapmaster2 | Azure SQL | empirecapital.database.windows.net | — | Collective brain (brain.* schema) |

---

## npm Dependencies (Key Packages)

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| express | 5.2 | HTTP server |
| sql.js | 1.13 | SQLite WebAssembly driver |
| mssql | 12.2 | Azure SQL client |
| pg | 8.18 | PostgreSQL client (trader) |
| openai | 4.104 | OpenAI API client |
| playwright | 1.58 | Browser automation |
| discord.js | 14.25 | Discord bot |
| @sendgrid/mail | 8.1 | Email delivery |
| @alpacahq/alpaca-trade-api | 3.0.4 | Stock trading |
| jsonwebtoken | 9.x | JWT auth |
| helmet | 8.x | Security headers |
| axios | 1.x | HTTP client |
| chromadb | 1.9 | Vector DB |
| dotenv | 16.x | Environment loading |

### Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.x | UI framework |
| react-router-dom | 6.x | Routing |
| zustand | 5.0 | Global state |
| @tanstack/react-query | 5.90 | Server state |
| recharts | 2.x | Charts |
| tailwindcss | 4.1 | Styling |

### Dev
| Package | Version | Purpose |
|---------|---------|---------|
| vite | 7.3 | Build tool |
| vitest | — | Test runner |
| tsx | — | TypeScript execution |

---

## Complete Environment Variable Reference

### Server Core
```
SERVER_PORT=3001
VITE_DEV_PORT=5173
NODE_ENV=development
JWT_SECRET=<64-byte hex>
JWT_EXPIRY=24h
DEFAULT_ADMIN_EMAIL=admin@clawops.local
DEFAULT_ADMIN_PASSWORD=changeme123
DB_PATH=./data/clawops.db
```

### OpenClaw
```
OPENCLAW_PATH=<path to npm global bin>
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<gateway auth token>
```

### AI / LLM
```
OPENAI_API_KEY=<key>
GROK_API_KEY=<key>
OLLAMA_HOST=127.0.0.1
OLLAMA_PORT=11434
OLLAMA_DEFAULT_MODEL=llama3.2:3b
```

### Azure SQL
```
AZURE_SQL_SERVER=empirecapital.database.windows.net
AZURE_SQL_DATABASE=empcapmaster2
AZURE_SQL_USER=<user>
AZURE_SQL_PASSWORD=<password>
```

### Email
```
SENDGRID_API_KEY=<key>
SENDGRID_FROM_EMAIL=info@hoaprojectfunding.com
SENDGRID_FROM_NAME=HOA Project Funding
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<app password>
SMTP_FROM=ClawOps Daily Digest <email>
```

### Social / Messaging
```
DISCORD_ENABLED=true
DISCORD_BOT_TOKEN=<token>
DISCORD_WEBHOOK_URL=<url>
FACEBOOK_APP_ID, FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN
JAKE_FACEBOOK_APP_ID, JAKE_FACEBOOK_APP_SECRET, JAKE_FACEBOOK_PAGE_ID, JAKE_FACEBOOK_ACCESS_TOKEN
LINKEDIN_CLIENT_ID, LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORGANIZATION_ID
TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
GITHUB_TOKEN, GITHUB_REPO
BRAVE_API_KEY
```

### Webhooks
```
HOA_WEBHOOK_SECRET, HOA_WEBHOOK_API_URL
CONTENT_WEBHOOK_SECRET, CONTENT_API_URL
FACEBOOK_WEBHOOK_VERIFY_TOKEN
```

### Trading
```
PORT=3002
TRADING_MODE=paper
BROKER_API_KEY, BROKER_API_SECRET, BROKER_BASE_URL
RISK_MAX_DAILY_LOSS, RISK_MAX_POSITION_USD, RISK_MAX_GROSS_EXPOSURE_USD, RISK_MAX_TRADES_PER_DAY
KILL_SWITCH_ENABLED=true
```

### Safety Limits
```
MAX_CONCURRENT_AGENTS=3
MAX_COST_PER_RUN=5.00
MAX_DURATION_PER_RUN=300
MAX_TOKENS_PER_RUN=100000
MAX_RUNS_PER_HOUR=20
```

### Frontend
```
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```
