# OpenClaw Trader

**Autonomous AI-powered trading system with recursive learning.**

A TypeScript/Node.js microservice that runs two parallel trading engines — a rule-based strategy engine and an LLM analyst panel — both feeding into a 4-layer learning brain that gets smarter with every trade. Deployed as part of the OpenClaw Console and managed via PM2.

---

## What It Does

Two paths to every trade, both guarded by 9 risk checks and a kill switch:

```
Market Data (Alpaca bars, 170 symbols)
    ↓
Strategy Engine (5 strategies, every 5 min)     AI Panel (4 analysts, every 3 min)
    ↓                                                ↓
Signal (symbol, side, strength, reason)         AggregatedPick (consensus-scored)
    ↓                                                ↓
OrderRouter (9 risk checks)                     OpenClawExecutor (4 risk checks)
    ↓                                                ↓
Alpaca (fractional shares, market orders)       Alpaca (notional orders)
    ↓                                                ↓
Brain (outcome tracking → learning)             Brain (outcome tracking → learning)
```

**Path 1: Strategy Engine** — Five rule-based strategies analyze technical indicators every 5 minutes and fire buy/sell signals when conditions are met.

**Path 2: AI Panel** — Four LLM analysts (Ollama, GPT-4o-mini, Grok) review live market data every 3 minutes and score opportunities by consensus. Cost: ~$0.018/run.

Both paths write outcomes back into a 4-layer SQLite learning database. The system observes what worked, what didn't, and surfaces patterns for future decisions.

---

## Quick Start

```bash
# Install
cd services/trader-service
npm install

# Configure
cp .env.trader .env.local
# Fill in: ALPACA_KEY, ALPACA_SECRET, OPENAI_API_KEY, GROK_API_KEY

# Run database migrations
npm run db:migrate

# Start (dev)
npm run dev

# Start (production via PM2)
pm2 start ecosystem.config.cjs
```

**Prerequisites:** Node 20+, Ollama running locally (`ollama pull llama3.1:8b`), Alpaca paper trading account.

---

## System Architecture

### Component Map

```
src/
├── server.ts                    # Entry point, startup sequence
├── config/index.ts              # Zod-validated config (25+ options)
├── singletons.ts                # Cross-module shared instances
│
├── api/
│   ├── routes/                  # 12 REST routers, 50+ endpoints
│   └── middleware/
│       ├── auth.ts              # JWT + role-based access
│       └── validate.ts          # Zod request validation
│
├── engine/
│   ├── strategy/                # Rule-based signal generation
│   │   ├── strategy_runner.ts   # 5-min orchestrator
│   │   ├── strategy_registry.ts # DB-persisted lifecycle
│   │   ├── universe-scanner.ts  # 200+ symbol movers scan
│   │   └── strategies/          # 5 strategy implementations
│   │
│   ├── ai-panel/                # LLM analyst panel
│   │   ├── panel-runner.ts      # 3-min orchestrator
│   │   ├── scheduler.ts         # Market-hours-aware loop
│   │   ├── analyst-prompts.ts   # 4 analyst system prompts
│   │   ├── cost-tier-config.ts  # Ollama/GPT/Grok routing
│   │   ├── llm-client.ts        # Provider abstraction
│   │   ├── panel-aggregator.ts  # Consensus scoring
│   │   ├── market-data.ts       # 7 parallel skill fetches
│   │   ├── trade-executor.ts    # Post-aggregation execution
│   │   └── openclaw-executor.ts # Portfolio rebalancing
│   │
│   ├── execution/               # Order submission
│   │   ├── order_router.ts      # Risk checks → broker
│   │   ├── fill_handler.ts      # 5s fill polling
│   │   └── broker/
│   │       ├── alpaca.ts        # Alpaca SDK adapter
│   │       ├── polymarket.ts    # Prediction markets (read-only)
│   │       └── types.ts         # IBrokerAdapter interface
│   │
│   ├── risk/                    # Safety enforcement
│   │   ├── risk_engine.ts       # 9-check validation
│   │   └── kill_switch.ts       # Emergency halt
│   │
│   ├── learning/                # Brain — 4-layer memory
│   │   ├── brain-store.ts       # SQLite learning DB
│   │   ├── outcome-tracker.ts   # Fill → brain feedback loop
│   │   ├── brain-context.ts     # Context builder for analysts
│   │   ├── distillation.ts      # Daily pattern promotion
│   │   └── performance-tracker.ts # Sharpe, drawdown, win rate
│   │
│   ├── portfolio/
│   │   └── position_manager.ts  # Position tracking + reconciliation
│   │
│   └── copy-trade/
│       └── copy-trade-engine.ts # Mirror Polymarket wallets
│
└── db/
    ├── exec-store.ts            # SQLite execution adapter
    ├── pool.ts                  # PostgreSQL (optional)
    └── migrations/              # 15-table schema
```

### Startup Sequence

When `server.ts` starts, components initialize in this order:

1. Express app (CORS, compression, helmet, routes)
2. Kill switch monitoring armed
3. Fill handler polls broker every 5s
4. Strategy runner starts (5-minute interval)
5. Trader Brain SQLite DB initializes (4-layer schema)
6. AI Panel scheduler starts (3-minute interval)
7. Copy-trade engine ready (inactive until targets added)

---

## The Five Strategies

All strategies scan 170 symbols every 5 minutes. Each fires buy/sell signals that flow through the OrderRouter's 9 risk checks before hitting Alpaca.

### Strategy 1: Moving Average Crossover

**Thesis:** When the fast MA crosses above the slow MA, momentum is shifting bullish. Classic trend-following signal.

| Parameter | Default | Description |
|-----------|---------|-------------|
| fastPeriod | 10 | Fast MA lookback (days) |
| slowPeriod | 30 | Slow MA lookback (days) |
| positionSize | $25 | USD per trade |
| symbols | 170 | Full universe |

- **BUY:** Fast MA crosses above slow MA
- **SELL:** Fast MA crosses below slow MA
- Requires 30+ bars of history; duplicate signal prevention per symbol
- Works in trending markets, whipsaws in sideways

---

### Strategy 2: RSI Mean Reversion

**Thesis:** Extreme RSI readings tend to revert to the mean. Buy when everyone is selling, sell when everyone is buying.

| Parameter | Default | Description |
|-----------|---------|-------------|
| rsiPeriod | 14 | RSI calculation period |
| oversoldThreshold | 35 | Buy when RSI drops below this |
| overboughtThreshold | 65 | Sell when RSI rises above this |
| positionSize | $25 | USD per trade |

- **BUY:** RSI < 35 (oversold)
- **SELL:** RSI > 65 (overbought)
- Signal strength scales with extremity (RSI 20 = stronger than RSI 34)
- Resets when RSI returns to neutral zone (35–65)
- Fires on: corrections, sector rotations, earnings overreactions

---

### Strategy 3: Bollinger Band Reversion

**Thesis:** Price touching Bollinger Bands signals deviation from normal. Bands adapt to volatility — quiet markets generate more signals, volatile markets only flag extremes.

| Parameter | Default | Description |
|-----------|---------|-------------|
| bbPeriod | 20 | SMA + std dev lookback |
| bbStdDev | 2.0 | Standard deviations for bands |
| positionSize | $25 | USD per trade |

- **BUY:** Price at or below lower band
- **SELL:** Price at or above upper band
- Logs band width % for volatility context
- Works in any market regime

---

### Strategy 4: Volume Spike Momentum

**Thesis:** Unusual volume (2x+ average) combined with price direction signals institutional activity. Follow the smart money.

| Parameter | Default | Description |
|-----------|---------|-------------|
| volumeMultiplier | 2.0 | Minimum volume vs 20-day avg |
| minPriceChange | 1.0% | Minimum price move to confirm direction |
| lookbackDays | 20 | Avg volume period |
| positionSize | $25 | USD per trade |

- **BUY:** Volume ≥ 2× avg AND price up ≥ 1%
- **SELL:** Volume ≥ 2× avg AND price down ≥ 1%
- One signal per symbol per day (prevents piling in)
- Fires on: earnings, analyst upgrades, sector rotations, breaking news

---

### Strategy 5: Gap Reversal ("ADBE Catcher")

**Thesis:** Large intraday gaps (5%+) tend to be overreactions. The crowd panics, price overshoots, then mean-reverts over 1–3 days. Buy the dip, fade the rip.

| Parameter | Default | Description |
|-----------|---------|-------------|
| dropThreshold | 5.0% | Minimum drop to trigger buy |
| gapUpThreshold | 5.0% | Minimum gap up to trigger sell |
| minVolumeRatio | 1.2× | Volume confirmation |
| positionSize | $25 | USD per trade |

- **BUY:** Price down ≥ 5% + volume ≥ 1.2× avg
- **SELL:** Price up ≥ 5% + volume ≥ 1.2× avg
- One signal per symbol per day
- Signal strength scales with gap magnitude
- Named after ADBE –10% catch; also caught VXX –7.7%

---

## AI Analyst Panel

Four LLM analysts run every 3 minutes in market hours. Each has a different analytical lens and runs on a different LLM tier to balance cost and quality.

### The Analysts

| Analyst | LLM Tier | Role |
|---------|----------|------|
| **Value Hunter** | Ollama (free) | Fundamental analysis — undervalued stocks, P/E ratios, catalysts, earnings plays |
| **Risk Sentinel** | Ollama (free) | Defensive — overexposed positions, correlation risk, macro threats |
| **Momentum Scanner** | OpenAI GPT-4o-mini ($0.003) | Technical — trend breakouts, relative strength, sector rotation |
| **Special Situations** | Grok ($0.015) | Event-driven — earnings gaps, M&A rumors, unusual options activity |

**Estimated cost per run:** ~$0.018 (mostly the Grok call)
**Daily cost at max frequency:** ~$5.00 (15 runs/hour × 7 market hours × $0.018)

### How the Panel Runs

```
1. Fetch portfolio state from Alpaca
2. Build market context (7 parallel skill fetches):
   - Yahoo Finance quotes
   - Fear & Greed Index
   - S&P 500, Nasdaq, Dow, VIX
   - Sector performance (via Alpaca snapshots)
   - Alpaca bars (daily + intraday)
   - News sentiment
3. Build brain context per analyst:
   - Personal win/loss feedback history
   - Similar trade episodes from memory
   - Recent market regime patterns
4. Run Tier 0 (Ollama) analysts sequentially (RAM-safe)
5. Run Tier 1+2 analysts in parallel
6. Aggregate picks via consensus scoring:
   compositeScore = (avgConviction/5 × 100) + ((analystCount-1) × 10)
   Threshold: score ≥ 35 = actionable
7. Risk engine checks
8. Execute trades via OpenClawExecutor
9. Register outcomes with OutcomeTracker (feeds the brain)
```

### Dynamic Universe Scanner

Scans 200+ US stocks every 15 minutes looking for movers:
- Gaps ≥ 5% (up or down)
- Volume spikes ≥ 3× average
- Moves ≥ 3% on ≥ 1.5× volume

New movers are automatically added to the Gap Reversal strategy's symbol list.

```
GET /api/universe/scan     — trigger scan, returns movers
GET /api/universe/symbols  — current symbol universe
```

---

## The Brain — 4-Layer Learning System

Every trade outcome is recorded and the system learns from it. The brain is a SQLite database (`trader.db`) with four distinct layers.

### Layer 1: Observations

Per-run context snapshots — raw input data captured at the time of each panel run.

- Market data state, portfolio positions, skill fetch results
- Indexed by: `run_id`, `analyst_id`, `obs_type`
- Used to reconstruct what the analysts "saw" when they made a call

### Layer 2: Feedback

Analyst accuracy signals — was this analyst right or wrong?

| Signal | Meaning |
|--------|---------|
| `profitable` | Trade closed positive |
| `loss` | Trade closed negative |
| `stopped_out` | Hit stop loss |
| `missed` | Analyst called it but we didn't trade (regret) |
| `correct_sell` | Sell signal was right |
| `flat` | No meaningful move |

Each analyst accumulates a personal feedback history. This is passed back to them on future runs as "here's what you got right and wrong recently."

### Layer 3: Episodes

Full trade outcome memory — the core learning record.

| Field | Description |
|-------|-------------|
| `symbol` | What was traded |
| `analyst_id` | Which analyst called it |
| `side` | BUY or SELL |
| `conviction` | Analyst's confidence (1–5) |
| `opportunity_type` | earnings_gap, breakout, reversion, etc. |
| `entry_price` / `exit_price` | Execution prices |
| `pnl_dollars` / `pnl_percent` | Outcome |
| `hold_days` | How long position was held |
| `outcome_type` | profit, loss, stop_hit, time_exit, target_hit, flat |
| `outcome_score` | –1.0 (disaster) to +1.0 (perfect) |
| `thesis` | What the analyst said at the time |
| `market_context` | Market conditions snapshot |

When an analyst evaluates a symbol, similar past episodes are fetched and included in their prompt: *"Last time you traded AAPL in a similar setup, here's what happened."*

### Layer 4: Knowledge Base

Distilled patterns — promoted from episodes every day at 4:15 PM ET.

| Content Type | Description |
|--------------|-------------|
| `winning_pattern` | Repeatable profitable setups |
| `losing_pattern` | Setups to avoid |
| `market_regime` | Regime-specific observations |
| `best_thesis` | High-quality reasoning examples |

Quality scored 0–1. Top patterns are included in analyst prompts automatically.

### The Feedback Loop

```
Fill detected (5s poll)
    ↓
OutcomeTracker.onFill()
    → Layer 1: Record observation (what we saw at entry)

Position closes
    ↓
OutcomeTracker.onPositionClose()
    → Layer 2: Record feedback signal for analyst
    → Layer 3: Record full trade episode with outcome score

Daily at 4:15 PM ET
    ↓
Distillation job
    → Scan episodes with high outcome scores
    → Promote winning patterns to Layer 4 KB
    → Promote losing patterns as "avoid" entries

Next panel run
    ↓
BrainContext.buildContext()
    → Fetch similar episodes by symbol + analyst
    → Fetch recent personal feedback
    → Include in analyst prompt
```

---

## Risk Engine

Every order passes through 9 checks before hitting the broker. A single failure blocks the trade and logs the reason.

| Check | Limit | Purpose |
|-------|-------|---------|
| Mode Lock | Paper / Live config | Prevents live orders in paper mode |
| Position Limit | $100 max | Cap any single position |
| Gross Exposure | $200 max | Total portfolio exposure ceiling |
| Daily Loss | $50 max | Halt all trading for the day |
| Trade Count | 50/day max | Prevent runaway trading loops |
| Symbol Allow/Block | Configurable list | Keep only approved symbols |
| Market Hours | 9:30 AM – 4:00 PM ET | No off-hours orders |
| Slippage Guard | 50 bps max | Reject stale or fat-finger orders |
| Order Type | Market only | No limit orders (simplicity) |

All limits are configurable via `.env.trader`. The daily loss and trade count reset at midnight UTC.

### Kill Switch

Emergency halt available at any time.

```
POST /api/kill-switch/trigger    — Manual trigger (soft or hard)
GET  /api/kill-switch/status     — Current state
GET  /api/kill-switch/events     — Event log with actor + reason
POST /api/kill-switch/reset      — Re-arm (admin only)
```

**Soft mode:** Stops new orders, lets existing positions close naturally.
**Hard mode:** Stops everything, no further activity until manually reset.

The kill switch also auto-triggers on risk limit breach.

---

## API Reference

All endpoints prefixed with `/api/v1` when running behind the OpenClaw Console gateway.

### Strategies

```
GET    /api/strategies              List all strategies + status
GET    /api/strategies/:id          Strategy details + params
POST   /api/strategies/:id/enable   Enable strategy (admin)
POST   /api/strategies/:id/disable  Disable strategy (admin)
PUT    /api/strategies/:id/params   Update parameters (admin)
POST   /api/strategies/run          Manual trigger run
```

### Positions

```
GET  /api/positions                 All open positions with P&L
GET  /api/positions/pnl             Daily P&L summary
GET  /api/positions/:symbol         Single position details
GET  /api/positions/:symbol/history Position history
GET  /api/positions/portfolio/value Total portfolio value
POST /api/positions/reconcile       Reconcile vs broker
POST /api/positions/sync            Sync from Alpaca
```

### Orders

```
POST   /api/orders/submit           Submit order (admin/operator)
GET    /api/orders/:brokerOrderId   Order status
DELETE /api/orders/:brokerOrderId   Cancel order
GET    /api/orders                  Order history (paginated)
```

### Broker

```
GET /api/broker/test          Test Alpaca connection
GET /api/broker/account       Cash, equity, buying power
GET /api/broker/positions     Live positions from broker
GET /api/broker/quote/:symbol Real-time quote
```

### AI Panel

```
POST /api/ai-panel/run     Execute panel run (dry-run option)
GET  /api/ai-panel/status  Panel config + analyst status
```

### Brain

```
GET  /api/brain/stats               Layer counts (obs, feedback, episodes, KB)
GET  /api/brain/episodes            Trade episodes (filterable)
GET  /api/brain/feedback            Recent feedback signals
GET  /api/brain/knowledge           Knowledge base entries by type
GET  /api/brain/analyst-performance Per-analyst stats (wins, P&L, symbols)
GET  /api/brain/scheduler           Scheduler status
POST /api/brain/trigger-run         Manual panel trigger
GET  /api/brain/panel-runs          Recent panel run history
GET  /api/brain/cost-summary        LLM cost tracking
GET  /api/brain/decisions           Trade decision rationale
GET  /api/brain/snapshots           Portfolio equity snapshots
GET  /api/brain/growth              30-day equity curve
POST /api/brain/seed-snapshot       Seed initial portfolio value
```

### Performance

```
GET /api/performance/summary   Verdict banner + Sharpe, drawdown, win rate
GET /api/performance/trades    Full trade history
GET /api/performance/drawdown  Drawdown series (for charting)
GET /api/performance/daily     Daily returns (for Sharpe calculation)
```

### Risk

```
GET /api/risk/limits   Current risk limits
GET /api/risk/breaches Historical breach log
```

### Kill Switch

```
POST /api/kill-switch/trigger  Manual kill (soft/hard)
GET  /api/kill-switch/status   Current state
GET  /api/kill-switch/events   Event log
POST /api/kill-switch/reset    Re-arm (admin)
```

### Polymarket

```
GET /api/polymarket/markets              Browse active markets
GET /api/polymarket/markets/:conditionId Market details
GET /api/polymarket/top-markets          Macro-relevant ($1k+ volume)
GET /api/polymarket/categories           Categories with volume
GET /api/polymarket/orderbook/:tokenId   Order book
GET /api/polymarket/prices/:conditionId  Price history
GET /api/polymarket/wallet-status        Wallet config status
```

### Copy Trade

```
GET    /api/copy-trade/status              Engine status
GET    /api/copy-trade/leaderboard         Top performing wallets
GET    /api/copy-trade/preview/:address    Recent trades from wallet
POST   /api/copy-trade/targets             Add target wallet
PUT    /api/copy-trade/targets/:address    Update target settings
DELETE /api/copy-trade/targets/:address    Remove target
GET    /api/copy-trade/actions             Recent copy actions
POST   /api/copy-trade/start               Start copying
POST   /api/copy-trade/stop                Stop copying
```

### Health

```
GET /health   Status, mode, kill switch state, uptime
```

---

## Configuration

All configuration in `.env.trader`. Key variables:

```env
# Broker
ALPACA_KEY=your_paper_key
ALPACA_SECRET=your_paper_secret
ALPACA_MODE=paper                          # paper | live

# Risk limits
DAILY_LOSS_LIMIT_USD=50
MAX_POSITION_USD=100
MAX_GROSS_EXPOSURE_USD=200
MAX_TRADES_PER_DAY=50
TRADING_BUDGET=100

# LLM
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=sk-...
GROK_API_KEY=xai-...

# Server
PORT=3002
JWT_SECRET=your_secret
```

---

## Database Schema

15 SQLite tables in `trader.db`:

| Table | Purpose |
|-------|---------|
| `orders` | All order submissions with broker IDs |
| `fills` | Execution fills |
| `positions` | Current and historical positions |
| `risk_checks` | Risk check audit log |
| `kill_switch_events` | Kill switch history |
| `strategy_signals` | Strategy signal history |
| `brain_observations` | Layer 1: per-run context snapshots |
| `brain_feedback` | Layer 2: analyst accuracy signals |
| `brain_episodes` | Layer 3: full trade outcome records |
| `brain_knowledge` | Layer 4: distilled patterns |
| `brain_snapshots` | Portfolio equity curve |
| `copy_trade_targets` | Mirror wallet addresses |
| `copy_trade_actions` | Copy trade execution log |
| `strategy_registry` | Strategy enable/disable state |
| `audit_log` | General audit trail |

---

## Adding a New Strategy

1. Create a TypeScript file in `src/engine/strategy/strategies/`
2. Implement the `IStrategy` interface:

```typescript
interface IStrategy {
  getId(): string;           // UUID
  getName(): string;
  getVersion(): string;
  getConfig(): StrategyConfig;
  initialize(db: ExecStore): Promise<void>;
  generateSignals(data: MarketData[]): Signal[];
  signalToIntent(signal: Signal): OrderIntent;
  cleanup(): Promise<void>;
}
```

3. Import and register in `server.ts` → `initializeStrategies()`
4. Restart: `pm2 restart openclaw-trader`

---

## Performance Monitoring

The `/api/performance/summary` endpoint returns a verdict banner you can display in a dashboard:

```json
{
  "verdict": "green",           // green | yellow | red
  "sharpe_ratio": 1.24,
  "max_drawdown_pct": -8.3,
  "win_rate": 0.62,
  "profit_factor": 1.87,
  "total_trades": 147,
  "total_pnl_usd": 234.50
}
```

**Green:** Sharpe > 1.0, drawdown < 15%, win rate > 55%
**Yellow:** Borderline metrics — monitor closely
**Red:** Drawdown > 20% or Sharpe < 0 — consider stopping

---

## Deployment

```bash
# Start
pm2 start ecosystem.config.cjs

# Status
pm2 status openclaw-trader

# Logs
pm2 logs openclaw-trader

# Monitor (memory, CPU, restarts)
npm run monitor

# Restart
pm2 restart openclaw-trader

# Stop gracefully
pm2 stop openclaw-trader
```

**PM2 config:**
- Process name: `openclaw-trader`
- Memory limit: 500MB (auto-restart above)
- Max restarts: 50 (10s delay between)
- Graceful shutdown: 10s timeout
- Log rotation: 50MB max, keep 10 files

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, TypeScript |
| Framework | Express 4 |
| Database | SQLite (better-sqlite3), PostgreSQL optional |
| Broker | Alpaca Trade API |
| LLMs | Ollama (local), OpenAI GPT-4o-mini, xAI Grok |
| Prediction Markets | Polymarket CLOB API |
| Process Manager | PM2 |
| Auth | JWT (shared with OpenClaw Console) |
| Validation | Zod |

---

## Key Files Quick Reference

| What | File |
|------|------|
| Entry point | `src/server.ts` |
| Config schema | `src/config/index.ts` |
| Strategy runner | `src/engine/strategy/strategy_runner.ts` |
| Strategy interface | `src/engine/strategy/types.ts` |
| Strategies directory | `src/engine/strategy/strategies/` |
| Universe scanner | `src/engine/strategy/universe-scanner.ts` |
| AI panel runner | `src/engine/ai-panel/panel-runner.ts` |
| Analyst prompts | `src/engine/ai-panel/analyst-prompts.ts` |
| LLM cost tiers | `src/engine/ai-panel/cost-tier-config.ts` |
| Panel aggregator | `src/engine/ai-panel/panel-aggregator.ts` |
| Order router | `src/engine/execution/order_router.ts` |
| Alpaca adapter | `src/engine/execution/broker/alpaca.ts` |
| Risk engine | `src/engine/risk/risk_engine.ts` |
| Kill switch | `src/engine/risk/kill_switch.ts` |
| Brain store | `src/engine/learning/brain-store.ts` |
| Outcome tracker | `src/engine/learning/outcome-tracker.ts` |
| Brain context | `src/engine/learning/brain-context.ts` |
| Daily distillation | `src/engine/learning/distillation.ts` |
| Performance | `src/engine/learning/performance-tracker.ts` |
| Position manager | `src/engine/portfolio/position_manager.ts` |
| Copy trade engine | `src/engine/copy-trade/copy-trade-engine.ts` |
| DB adapter | `src/db/exec-store.ts` |
| Strategy docs | `STRATEGIES.md` |
