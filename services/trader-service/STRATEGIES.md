# OpenClaw Trader — Strategy Documentation

> Last updated: 2026-03-16. 5 strategies, 170 symbols, $100 budget.

---

## How It Works

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

Two paths to trades:
1. **Strategy Engine** — rule-based signals from technical indicators
2. **AI Panel** — LLM analysts (GPT-4o-mini) scoring opportunities from market data

Both feed into Alpaca paper trading with risk limits enforced.

---

## Strategy 1: Moving Average Crossover

**ID:** `c3f8b8e0-4d1c-4c9f-8f3a-1e5b7a9c6d2e`
**File:** `strategies/moving_average_crossover.ts`

**Thesis:** When the fast MA crosses above the slow MA, momentum is shifting bullish. When it crosses below, bearish. Classic trend-following signal.

**Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| fastPeriod | 10 | Fast moving average lookback (days) |
| slowPeriod | 30 | Slow moving average lookback (days) |
| positionSize | 25 | USD per trade |
| symbols | 170 | Full broad universe |

**Signal conditions:**
- BUY: Fast MA crosses above Slow MA (bullish crossover)
- SELL: Fast MA crosses below Slow MA (bearish crossover)
- Requires 30+ bars of history
- Duplicate signal prevention (won't re-signal same direction)

**When it fires:** Trend reversals. Works in trending markets, whipsaws in sideways markets.

**Order type:** Market

---

## Strategy 2: RSI Mean Reversion

**ID:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
**File:** `strategies/rsi_mean_reversion.ts`

**Thesis:** Extreme RSI readings (oversold/overbought) tend to revert to the mean. Buy when everyone is selling, sell when everyone is buying.

**Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| rsiPeriod | 14 | RSI calculation period |
| oversoldThreshold | 35 | Buy when RSI drops below this |
| overboughtThreshold | 65 | Sell when RSI rises above this |
| positionSize | 25 | USD per trade |
| symbols | 170 | Full broad universe |

**Signal conditions:**
- BUY: RSI < 35 (oversold)
- SELL: RSI > 65 (overbought)
- Signal strength scales with extremity (RSI 20 = stronger than RSI 34)
- Resets when RSI returns to neutral zone (35-65)

**When it fires:** Market corrections, sector rotations, earnings overreactions.

**Order type:** Market

---

## Strategy 3: Bollinger Band Reversion

**ID:** `d4e5f6a7-b8c9-0123-4567-89abcdef0123`
**File:** `strategies/bollinger_reversion.ts`

**Thesis:** Price touching the Bollinger Bands signals a deviation from normal. Bands adapt to volatility — in quiet markets, touches happen more often (more trades). In volatile markets, only extreme moves touch the bands.

**Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| bbPeriod | 20 | Lookback for SMA + std dev |
| bbStdDev | 2.0 | Number of standard deviations |
| positionSize | 25 | USD per trade |
| symbols | 170 | Full broad universe |

**Signal conditions:**
- BUY: Price at or below lower band (oversold relative to recent range)
- SELL: Price at or above upper band (overbought relative to recent range)
- Logs band width % for volatility context
- Resets when price returns to middle zone

**When it fires:** Any market regime. More frequent in low-volatility environments. Caught XOM and CVX on 2026-03-16.

**Order type:** Market

---

## Strategy 4: Volume Spike Momentum

**ID:** `e5f6a7b8-c9d0-1234-5678-9abcdef01234`
**File:** `strategies/volume_spike_momentum.ts`

**Thesis:** Unusual volume (2x+ average) combined with price direction signals institutional activity. Follow the smart money — high volume + price up = momentum buy, high volume + price down = momentum sell.

**Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| volumeMultiplier | 2.0 | Minimum volume vs 20-day avg |
| minPriceChange | 1.0 | Minimum % price move to confirm direction |
| lookbackDays | 20 | Days to average volume over |
| positionSize | 25 | USD per trade |
| symbols | 170 | Full broad universe |

**Signal conditions:**
- BUY: Volume ≥ 2x avg AND price up ≥ 1%
- SELL: Volume ≥ 2x avg AND price down ≥ 1%
- One signal per symbol per day (prevents piling in)

**When it fires:** Earnings reactions, analyst upgrades/downgrades, sector rotations, breaking news.

**Order type:** Market

---

## Strategy 5: Gap Reversal ("ADBE Catcher")

**ID:** `f6a7b8c9-d0e1-2345-6789-abcdef012345`
**File:** `strategies/gap_reversal.ts`

**Thesis:** Large intraday gaps (5%+) tend to be overreactions. The crowd panics, price overshoots, then mean-reverts over 1-3 days. Buy the dip on big drops, fade the rip on big gaps up.

**Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| dropThreshold | 5.0 | Minimum % drop to trigger buy |
| gapUpThreshold | 5.0 | Minimum % gap up to trigger sell |
| minVolumeRatio | 1.2 | Minimum volume vs avg to confirm move is real |
| positionSize | 25 | USD per trade |
| symbols | 170 | Full broad universe |

**Signal conditions:**
- BUY: Price down ≥ 5% from prev close AND volume ≥ 1.2x avg
- SELL: Price up ≥ 5% from prev close AND volume ≥ 1.2x avg
- One signal per symbol per day
- Signal strength scales with gap magnitude

**When it fires:** Earnings misses (ADBE -10%), analyst downgrades, sector crashes. Caught VXX -7.7% on 2026-03-16.

**Order type:** Market

---

## AI Analyst Panel

4 analysts run every 3 minutes via GPT-4o-mini (~$0.002/run):

| Analyst | Role | What it looks for |
|---------|------|-------------------|
| **Value Hunter** | Fundamental analysis | Undervalued stocks, low P/E, catalysts, earnings plays |
| **Risk Sentinel** | Defensive analysis | Overexposed positions, correlation risk, macro threats |
| **Momentum Scanner** | Technical analysis | Trend breakouts, relative strength, sector rotation |
| **Special Situations** | Event-driven | Earnings gaps, M&A, unusual options activity |

Picks are aggregated by consensus scoring:
```
compositeScore = (avgConviction/5 × 100) + ((analystCount-1) × 10)
```
Score ≥ 35 = actionable trade. Positions sized within $100 budget via `TRADING_BUDGET` env var.

---

## Dynamic Universe Scanner

Scans 200+ US stocks every 15 minutes via Alpaca snapshots. Finds:
- Gaps ≥ 5% (up or down)
- Volume spikes ≥ 3x average
- Moves ≥ 3% on ≥ 1.5x volume

New movers are automatically added to the Gap Reversal strategy's symbol list.

**API:**
- `GET /api/universe/scan` — trigger scan, returns movers
- `GET /api/universe/symbols` — current symbol universe

---

## Risk Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Max daily loss | $50 | Halt all trading for the day |
| Max position | $100 | Cap any single position |
| Max gross exposure | $200 | Total portfolio exposure ceiling |
| Max trades/day | 50 | Prevent runaway trading |
| Max slippage | 50 bps | Order quality check |
| Trading budget | $100 | Cap portfolio value used for weight calcs |

Set in `.env.trader`. Kill switch available at `POST /api/kill-switch/activate`.

---

## Adding a New Strategy

1. Create a new TypeScript file in `strategies/`
2. Implement `IStrategy` interface (getId, getName, getVersion, getConfig, initialize, generateSignals, signalToIntent, cleanup)
3. Import and register in `server.ts` `initializeStrategies()`
4. Restart trader: `pm2 restart openclaw-trader`

Or just describe the thesis to Claude and it'll build it.

---

## Key Files

| What | Where |
|------|-------|
| Strategy engine | `src/engine/strategy/strategy_runner.ts` |
| Strategy types | `src/engine/strategy/types.ts` |
| Strategy implementations | `src/engine/strategy/strategies/*.ts` |
| Universe scanner | `src/engine/strategy/universe-scanner.ts` |
| AI analyst panel | `src/engine/ai-panel/panel-runner.ts` |
| Analyst prompts | `src/engine/ai-panel/analyst-prompts.ts` |
| Cost tier config | `src/engine/ai-panel/cost-tier-config.ts` |
| Trade executor | `src/engine/ai-panel/openclaw-executor.ts` |
| Order router | `src/engine/execution/order_router.ts` |
| Risk engine | `src/engine/risk/risk_engine.ts` |
| Alpaca adapter | `src/engine/execution/broker/alpaca.ts` |
| Brain (learning) | `src/engine/learning/brain-store.ts` |
| Server config | `src/config/index.ts` |
| Environment | `.env.trader` |
