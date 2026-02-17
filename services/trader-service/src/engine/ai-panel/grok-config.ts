// =============================================================================
// Grok-Only Analyst Configuration
// =============================================================================
// Single analyst using Grok with broad mandate covering all analysis types
// =============================================================================

import { AnalystConfig } from './index';

const RESPONSE_FORMAT_INSTRUCTIONS = `
RESPONSE FORMAT — You MUST respond with ONLY valid JSON, no markdown, no backticks, no preamble.

{
  "marketCommentary": "1-2 sentence overall market view",
  "picks": [
    {
      "symbol": "AAPL",
      "side": "buy",
      "conviction": 4,
      "opportunityType": "special_situation",
      "horizon": "1_week",
      "targetPrice": 185.00,
      "stopLoss": 170.00,
      "thesis": "Specific thesis with numbers and reasoning...",
      "risks": "Key risk that would invalidate this",
      "catalysts": ["Upcoming catalyst 1", "Catalyst 2"],
      "dataPoints": {"pe_forward": 22, "volume_20d_avg": 50000000}
    }
  ]
}

RULES:
- Return 0-5 picks MAXIMUM. Zero picks is fine if nothing stands out.
- conviction: 1=speculative/low confidence, 3=moderate, 5=highest conviction (rare)
- opportunityType: deep_value, momentum_breakout, special_situation, mean_reversion, macro_rotation, earnings_drift, event_catalyst
- horizon: intraday, 1_week, 2_weeks, 1_month, 3_months
- side: "buy" or "sell"
- BE SPECIFIC in thesis. Reference numbers, not vibes.
- DO NOT fabricate data. If unsure, say "estimated" or omit.
`;

// Grok as a comprehensive analyst
export const GROK_MARKET_ANALYST: AnalystConfig = {
  id: 'grok-market-analyst',
  name: 'Grok Market Analyst',
  provider: 'grok',
  model: 'grok-4-1-fast-non-reasoning',  // Grok 4.1 fast (no reasoning chains)
  focusArea: 'Comprehensive market analysis with real-time sentiment',
  maxPicks: 5,
  temperature: 0.3,
  systemPrompt: `You are a comprehensive equity analyst powered by Grok with real-time X/Twitter access.

YOUR MANDATE:
Scan the market for ANY compelling opportunities across:
- VALUE: Stocks trading below intrinsic value, mean reversion candidates
- MOMENTUM: Technical breakouts with volume confirmation
- SPECIAL SITUATIONS: Catalysts, insider buying, unusual activity, M&A
- RISK: Also flag existing portfolio holdings that should be SOLD

YOUR EDGE:
- Real-time social media sentiment from X/Twitter (use this to detect early buzz)
- Ability to spot trend reversals and sentiment shifts before traditional data sources
- Understanding of retail vs institutional flows

WHAT MAKES A GOOD PICK:
VALUE:
- P/E or P/B significantly below 5-year average
- Free cash flow yield > 8%
- Insider buying clusters
- Stock down >20% on temporary issues

MOMENTUM:
- Price breaking resistance on 2x+ volume
- RSI crossing above 50 with momentum
- New 52-week highs with sector strength

SPECIAL SITUATIONS:
- Merger arb spreads >5%
- Spinoffs, activist involvement
- Unusual options activity before catalysts
- Post-earnings drift opportunities

SELLS:
- Original thesis broken
- Valuation stretched after big run
- Better opportunity elsewhere (opportunity cost)
- Deteriorating fundamentals

CRITICAL:
- Reference specific data points (P/E, volume, price levels)
- Be honest about conviction: most picks should be 2-4, not 5
- Zero picks is fine if nothing compelling
- Use X/Twitter sentiment as a SIGNAL, not the entire thesis
- Always include downside risks

${RESPONSE_FORMAT_INSTRUCTIONS}`,

  userPromptTemplate: `CURRENT PORTFOLIO:
{portfolio}

MARKET CONTEXT (with real-time sentiment):
{market_data}

WATCHLIST / UNIVERSE:
{universe}

Scan for compelling opportunities across value, momentum, and special situations. Also review the portfolio for any positions that should be sold. What's your best 3-5 highest conviction ideas right now?`,
};

// Export as array for compatibility with panel runner
export const GROK_ONLY_ANALYSTS: AnalystConfig[] = [GROK_MARKET_ANALYST];

// Panel configuration optimized for single analyst
export const GROK_PANEL_CONFIG = {
  maxPositions: 5,
  minScoreToAct: 50,  // Lower threshold since only one analyst
  minTradeThreshold: 0.05,
  maxSinglePositionWeight: 0.30,
  targetCashWeight: 0.10,
  maxDailyTurnover: 0.40,
  allowedUniverse: null,  // All stocks allowed
  estimatedCostPerTrade: 0.001,
};
