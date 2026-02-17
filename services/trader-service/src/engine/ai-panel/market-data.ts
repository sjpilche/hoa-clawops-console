// =============================================================================
// Market Data Fetcher
// =============================================================================
// Pulls portfolio state from Alpaca and assembles market context for analysts.
// This is what each analyst "sees" when they scan the market.
// =============================================================================

import { PortfolioSnapshot, PositionInfo } from '../types';

const ALPACA_BASE = process.env.BROKER_BASE_URL || 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.BROKER_API_KEY || '';
const ALPACA_SECRET = process.env.BROKER_API_SECRET || '';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
  'Content-Type': 'application/json',
};

/** Fetch current portfolio state from Alpaca */
export async function getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  // Get account info
  const accountRes = await fetch(`${ALPACA_BASE}/v2/account`, { headers: alpacaHeaders });
  if (!accountRes.ok) throw new Error(`Alpaca account error: ${accountRes.status}`);
  const account = await accountRes.json();

  // Get positions
  const positionsRes = await fetch(`${ALPACA_BASE}/v2/positions`, { headers: alpacaHeaders });
  if (!positionsRes.ok) throw new Error(`Alpaca positions error: ${positionsRes.status}`);
  const rawPositions = await positionsRes.json();

  const totalValue = parseFloat(account.equity);
  const cash = parseFloat(account.cash);

  const positions: PositionInfo[] = rawPositions.map((p: any) => {
    const marketValue = parseFloat(p.market_value);
    return {
      symbol: p.symbol,
      qty: parseInt(p.qty),
      marketValue,
      weight: totalValue > 0 ? marketValue / totalValue : 0,
      avgEntryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      unrealizedPnl: parseFloat(p.unrealized_pl),
      unrealizedPnlPercent: parseFloat(p.unrealized_plpc) * 100,
    };
  });

  return {
    timestamp: new Date(),
    totalValue,
    cash,
    positions,
  };
}

/** Format portfolio for LLM prompt consumption */
export function formatPortfolioForPrompt(snapshot: PortfolioSnapshot): string {
  const lines = [
    `Total Portfolio Value: $${snapshot.totalValue.toFixed(2)}`,
    `Cash: $${snapshot.cash.toFixed(2)} (${((snapshot.cash / snapshot.totalValue) * 100).toFixed(1)}%)`,
    '',
  ];

  if (snapshot.positions.length === 0) {
    lines.push('Positions: NONE (100% cash)');
  } else {
    lines.push('Open Positions:');
    lines.push('Symbol | Qty | Avg Entry | Current | P&L | Weight');
    lines.push('-------|-----|-----------|---------|-----|-------');
    for (const p of snapshot.positions) {
      lines.push(
        `${p.symbol} | ${p.qty} | $${p.avgEntryPrice.toFixed(2)} | $${p.currentPrice.toFixed(2)} | ${p.unrealizedPnlPercent >= 0 ? '+' : ''}${p.unrealizedPnlPercent.toFixed(1)}% ($${p.unrealizedPnl.toFixed(2)}) | ${(p.weight * 100).toFixed(1)}%`
      );
    }
  }

  return lines.join('\n');
}

/** Fetch recent bars for a list of symbols (for technical context) */
export async function getRecentBars(symbols: string[], days: number = 20): Promise<Record<string, any[]>> {
  if (symbols.length === 0) return {};

  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const params = new URLSearchParams({
    symbols: symbols.join(','),
    timeframe: '1Day',
    start,
    end,
    limit: String(days),
    feed: 'iex',  // Free data feed
  });

  const res = await fetch(
    `https://data.alpaca.markets/v2/stocks/bars?${params}`,
    { headers: alpacaHeaders }
  );

  if (!res.ok) {
    console.warn(`Failed to fetch bars: ${res.status}`);
    return {};
  }

  const data = await res.json();
  return data.bars || {};
}

/** Build market context string for analyst prompts */
export async function buildMarketContext(
  portfolio: PortfolioSnapshot,
  watchlist: string[] = []
): Promise<string> {
  // Get bars for held symbols + watchlist
  const allSymbols = [
    ...portfolio.positions.map(p => p.symbol),
    ...watchlist,
    'SPY', 'QQQ', 'TLT', 'VIX',  // Always include market benchmarks
  ];
  const uniqueSymbols = [...new Set(allSymbols)];

  let barsContext = '';
  try {
    const bars = await getRecentBars(uniqueSymbols, 20);
    const summaries: string[] = [];

    for (const [symbol, barList] of Object.entries(bars)) {
      if (!Array.isArray(barList) || barList.length === 0) continue;

      const latest = barList[barList.length - 1];
      const oldest = barList[0];
      const prices = barList.map((b: any) => b.c);
      const volumes = barList.map((b: any) => b.v);

      const change20d = ((latest.c - oldest.c) / oldest.c * 100).toFixed(1);
      const avgVolume = Math.round(volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length);
      const high20d = Math.max(...prices);
      const low20d = Math.min(...prices);

      summaries.push(
        `${symbol}: Last $${latest.c.toFixed(2)} | 20d Change: ${change20d}% | Range: $${low20d.toFixed(2)}-$${high20d.toFixed(2)} | Avg Vol: ${(avgVolume / 1000).toFixed(0)}K`
      );
    }

    barsContext = summaries.join('\n');
  } catch (err) {
    barsContext = '(Market data temporarily unavailable)';
  }

  const today = new Date();
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];

  return [
    `Date: ${today.toISOString().split('T')[0]} (${dayOfWeek})`,
    '',
    '20-Day Price Summary:',
    barsContext,
    '',
    'Note: Use this data directionally. For precise real-time quotes, the execution engine will check current prices before trading.',
  ].join('\n');
}

/** Get a default watchlist of liquid, well-known names */
export function getDefaultWatchlist(): string[] {
  return [
    // Mega cap tech
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
    // Financials
    'JPM', 'BAC', 'GS',
    // Healthcare
    'UNH', 'JNJ', 'PFE',
    // Consumer
    'WMT', 'COST', 'HD',
    // Energy
    'XOM', 'CVX',
    // ETFs
    'SPY', 'QQQ', 'IWM', 'TLT', 'GLD', 'XLF', 'XLE', 'XLV',
  ];
}
