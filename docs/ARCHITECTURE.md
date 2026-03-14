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
1. User clicks "Run" on an agent in the UI
2. Frontend POST /api/agents/:id/run  { message }
3. Server creates run with status='pending'
4. UI shows confirmation dialog
5. User confirms → POST /api/runs/:id/confirm
6. Middleware: Auth → RateLimit → AuditLog
7. Server routes to SPECIAL_HANDLER (deterministic, $0) OR OpenClaw CLI (LLM, ~$0.025)
8. Socket.io broadcasts run:log events (streaming output)
9. On completion: results stored in SQLite, agent status → 'idle'
10. Socket.io broadcasts run:completed
11. Discord notification fires
12. Post-processor routes LLM output to cfo_leads / cfo_content_pieces / cfo_outreach_sequences

Scheduled runs skip steps 3-5 (no confirmation gate).
```

## Safety Flow

```
User Intent → Confirmation Gate → Budget Check → Domain Check → Execution → Audit Log
                  ↓                    ↓              ↓              ↓          ↓
              "Run agent?"       Under budget?    Allowed URL?    OpenClaw     SQLite
              [Yes] [No]         Hard-stop if not  Block if not   API call     audit_log
```

## LLM Client Layer

All server-side LLM calls route through `server/services/llmClient.js` — a unified
client extracted from the Page Agent open-source framework. It replaces scattered
`http.request()` boilerplate across the codebase.

```
server/services/llmClient.js
  │
  ├── chat(systemPrompt, message, opts)       → string
  ├── chatJSON(systemPrompt, message, opts)   → parsed object (strips markdown fences)
  ├── chatMessages(messages, opts)            → string  (multi-turn)
  ├── pingOllama()                            → { ok, models }
  └── isModelAvailable(model)                → boolean

Provider auto-detection (opts.provider or inferred from model name / baseURL):
  ├── 'ollama'  → http://OLLAMA_HOST:OLLAMA_PORT/api/chat   ($0, local)
  └── 'openai'  → OPENAI_BASE_URL/chat/completions          (GPT-4o, Grok, Claude, etc.)

Features (from Page Agent @page-agent/llms):
  ├── Retry with exponential backoff (default: 2 retries)
  ├── Error classification: network | rate_limit | auth | context_length | timeout
  ├── Model-specific patches: Claude tool_choice, Qwen temperature, Grok reasoning
  └── Token usage tracking: prompt, completion, cached, reasoning tokens
```

**Which services use it:**

| Service | Provider | Purpose |
|---------|----------|---------|
| ollamaBridge.js | ollama | Agent runner (loads SOUL.md, runs via Ollama) |
| softwareFactory.js | ollama / openai | Prototype generation + launch copy |
| domExtractor.js | ollama | LLM-assisted contact extraction from web pages |
| signalIngest.js | ollama | Signal classification for Opportunity Engine |
| opportunityScorer.js | ollama | Cluster scoring fallback |
| idleTrainer.js | ollama | Training content generation |
| trainingReflector.js | ollama | Learn from agent failures/successes |
| trainingQA.js | ollama | QA grading of training candidates |
| chatService.js | openai | Console chat (gpt-4o-mini) |

**Important:** OpenClaw CLI agents (charlie, ralph, todd, etc.) are separate
subprocesses and do NOT use llmClient. They run via `openclawBridge.js` →
`openclaw agent --local --json` CLI. Only special handlers (Node.js) can use llmClient.

## DOM Extractor

`server/services/domExtractor.js` provides LLM-assisted contact extraction from
Playwright pages. Used as Step 5 (last resort) in the contact enrichment waterfall.

```
extractWithLLM(page, companyName)
  │
  ├── 1. page.evaluate(DOM_EXTRACT_SCRIPT)
  │         Extracts: meta tags, JSON-LD, mailto/tel links,
  │                   contact/about/team/footer sections, body text
  │         Returns labeled sections: [MAILTO], [TEL], [SECTION:*], [BODY]
  │         Capped at 8000 chars
  │
  ├── 2. chatJSON(EXTRACT_PROMPT, pageText, { provider: 'ollama' })
  │         $0 via Ollama (llama3.2:3b)
  │         ~$0.01-0.02 via GPT-4o fallback (opts.allowGPT)
  │
  └── 3. Returns { emails, phones, names, title, confidence, method }
```

Only fires when all 4 CSS/regex waterfall steps in `jakeContactEnricher.js` return
nothing. Enrichment method recorded as `llm_ollama` or `llm_gpt4o` in DB.
