// =============================================================================
// Market Data — Real free APIs replacing broken OpenClaw skills
// =============================================================================
// Provides actual market data to analysts via:
//   1. Yahoo Finance — quotes, P/E, volume, 52-week range, earnings
//   2. CNN Fear & Greed Index — market regime detection
//   3. Yahoo Finance trending — top movers / unusual volume
//   4. Market indices — S&P 500, Dow, NASDAQ, VIX, 10Y yield
//   5. Alpaca bars — 20-day price history for portfolio + watchlist
//
// Returns SkillsContext interface for drop-in replacement of skills-fetcher.
// =============================================================================

import { SkillsContext } from './skills-fetcher';
import { PortfolioSnapshot } from './index';
import { RegimeInput } from '../allocation/types';

export interface MarketDataResult {
  skillsContext: SkillsContext;
  regimeInput: RegimeInput;
}

const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const YAHOO_TRENDING_URL = 'https://query1.finance.yahoo.com/v1/finance/trending/US';
const FEAR_GREED_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
const INDEX_SYMBOLS = ['^GSPC', '^DJI', '^IXIC', '^VIX', '^TNX'];

const ALPACA_BASE = process.env.BROKER_BASE_URL || 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.BROKER_API_KEY || '';
const ALPACA_SECRET = process.env.BROKER_API_SECRET || '';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
  'Content-Type': 'application/json',
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

interface YahooQuote {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  trailingPE?: number;
  forwardPE?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  earningsTimestamp?: number;
}

// ---------------------------------------------------------------------------
// Yahoo Finance quotes + fundamentals
// ---------------------------------------------------------------------------

async function fetchYahooQuotes(symbols: string[]): Promise<string> {
  try {
    const joined = symbols.join(',');
    const url = `${YAHOO_QUOTE_URL}?symbols=${joined}&fields=shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,averageDailyVolume3Month,trailingPE,forwardPE,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,fiftyDayAverage,twoHundredDayAverage,earningsTimestamp`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) throw new Error(`Yahoo API ${resp.status}`);
    const data: any = await resp.json();
    const quotes: YahooQuote[] = data?.quoteResponse?.result || [];

    if (quotes.length === 0) return '(No quote data returned)';

    const lines = quotes.map((q) => {
      const pctFromHigh = q.fiftyTwoWeekHigh && q.regularMarketPrice
        ? (((q.regularMarketPrice - q.fiftyTwoWeekHigh) / q.fiftyTwoWeekHigh) * 100).toFixed(1)
        : 'N/A';
      const volRatio = q.regularMarketVolume && q.averageDailyVolume3Month
        ? (q.regularMarketVolume / q.averageDailyVolume3Month).toFixed(2)
        : 'N/A';
      const above50d = q.regularMarketPrice && q.fiftyDayAverage
        ? q.regularMarketPrice > q.fiftyDayAverage ? 'ABOVE' : 'BELOW'
        : 'N/A';
      const above200d = q.regularMarketPrice && q.twoHundredDayAverage
        ? q.regularMarketPrice > q.twoHundredDayAverage ? 'ABOVE' : 'BELOW'
        : 'N/A';
      const earnings = q.earningsTimestamp
        ? new Date(q.earningsTimestamp * 1000).toISOString().split('T')[0]
        : 'N/A';

      return [
        `${q.symbol} (${q.shortName || 'N/A'})`,
        `  Price: $${q.regularMarketPrice?.toFixed(2) || 'N/A'}  Chg: ${q.regularMarketChangePercent?.toFixed(2) || 'N/A'}%`,
        `  P/E Trail: ${q.trailingPE?.toFixed(1) || 'N/A'}  Fwd: ${q.forwardPE?.toFixed(1) || 'N/A'}  MCap: ${formatMarketCap(q.marketCap)}`,
        `  52w: $${q.fiftyTwoWeekLow?.toFixed(2) || '?'} – $${q.fiftyTwoWeekHigh?.toFixed(2) || '?'} (${pctFromHigh}% from high)`,
        `  Volume: ${formatNumber(q.regularMarketVolume)} (${volRatio}x avg)`,
        `  50d MA: ${above50d}  200d MA: ${above200d}`,
        `  Next Earnings: ${earnings}`,
      ].join('\n');
    });

    return lines.join('\n\n');
  } catch (error: any) {
    console.warn('[market-data] Yahoo quotes failed:', error.message, '— falling back to Alpaca snapshots');
    return fetchAlpacaQuotes(symbols);
  }
}

// ---------------------------------------------------------------------------
// Alpaca Snapshots — fallback when Yahoo Finance is down (401, rate-limited, etc.)
// ---------------------------------------------------------------------------

async function fetchAlpacaQuotes(symbols: string[]): Promise<string> {
  try {
    // Filter out index symbols (Alpaca doesn't support ^GSPC etc.)
    const stockSymbols = symbols.filter(s => !s.startsWith('^'));
    if (stockSymbols.length === 0) return '(No stock symbols to quote)';

    const params = new URLSearchParams({ symbols: stockSymbols.join(','), feed: 'iex' });
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?${params}`;

    const resp = await fetch(url, {
      headers: alpacaHeaders,
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) throw new Error(`Alpaca snapshots ${resp.status}`);
    const snapshots: Record<string, any> = await resp.json();

    if (Object.keys(snapshots).length === 0) return '(No Alpaca snapshot data)';

    const lines = Object.entries(snapshots).map(([symbol, snap]) => {
      const price = snap.latestTrade?.p || snap.minuteBar?.c || 0;
      const prevClose = snap.prevDailyBar?.c || 0;
      const change = prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0;
      const volume = snap.dailyBar?.v || 0;

      return [
        `${symbol}`,
        `  Price: $${price.toFixed(2)}  Chg: ${change.toFixed(2)}%`,
        `  Volume: ${formatNumber(volume)}`,
        `  (via Alpaca fallback — fundamentals unavailable)`,
      ].join('\n');
    });

    console.log(`[market-data] Alpaca snapshot fallback: got ${Object.keys(snapshots).length} quotes`);
    return lines.join('\n\n');
  } catch (error: any) {
    console.warn('[market-data] Alpaca quotes fallback also failed:', error.message);
    return `(Quotes unavailable — Yahoo and Alpaca both failed: ${error.message})`;
  }
}

// ---------------------------------------------------------------------------
// CNN Fear & Greed Index
// ---------------------------------------------------------------------------

async function fetchFearGreed(): Promise<string> {
  try {
    const resp = await fetch(FEAR_GREED_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) throw new Error(`CNN API ${resp.status}`);
    const data: any = await resp.json();

    const current = data?.fear_and_greed?.score;
    const rating = data?.fear_and_greed?.rating;
    const previous = data?.fear_and_greed_historical?.previousClose;
    const weekAgo = data?.fear_and_greed_historical?.oneWeekAgo;
    const monthAgo = data?.fear_and_greed_historical?.oneMonthAgo;

    if (!current && current !== 0) return '(Fear & Greed data unavailable)';

    const regime = current <= 25 ? 'EXTREME FEAR — contrarian buy signal'
      : current <= 45 ? 'FEAR — cautious, watch for bottoms'
      : current <= 55 ? 'NEUTRAL — no strong directional bias'
      : current <= 75 ? 'GREED — momentum up, watch for overextension'
      : 'EXTREME GREED — contrarian sell signal, high risk';

    return [
      `Fear & Greed Index: ${Math.round(current)} (${rating || 'N/A'})`,
      `Regime: ${regime}`,
      `Previous Close: ${Math.round(previous?.score || 0)}`,
      `1 Week Ago: ${Math.round(weekAgo?.score || 0)}`,
      `1 Month Ago: ${Math.round(monthAgo?.score || 0)}`,
    ].join('\n');
  } catch (error: any) {
    console.warn('[market-data] Fear & Greed failed:', error.message);
    return `(Fear & Greed unavailable: ${error.message})`;
  }
}

// ---------------------------------------------------------------------------
// Market indices (S&P, Dow, NASDAQ, VIX, 10Y)
// ---------------------------------------------------------------------------

async function fetchIndices(): Promise<string> {
  try {
    const joined = INDEX_SYMBOLS.join(',');
    const url = `${YAHOO_QUOTE_URL}?symbols=${joined}&fields=shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) throw new Error(`Yahoo indices ${resp.status}`);
    const data: any = await resp.json();
    const quotes: YahooQuote[] = data?.quoteResponse?.result || [];

    if (quotes.length === 0) return '(Index data unavailable)';

    const lines = quotes.map((q) => {
      const name = q.symbol === '^GSPC' ? 'S&P 500'
        : q.symbol === '^DJI' ? 'Dow Jones'
        : q.symbol === '^IXIC' ? 'NASDAQ'
        : q.symbol === '^VIX' ? 'VIX'
        : q.symbol === '^TNX' ? '10Y Yield'
        : q.shortName || q.symbol;
      const price = q.regularMarketPrice?.toFixed(2) || 'N/A';
      const chg = q.regularMarketChangePercent?.toFixed(2) || 'N/A';
      const dir = (q.regularMarketChangePercent || 0) >= 0 ? '+' : '';
      return `  ${name}: ${price} (${dir}${chg}%)`;
    });

    return 'Market Indices:\n' + lines.join('\n');
  } catch (error: any) {
    console.warn('[market-data] Indices failed:', error.message, '— falling back to Alpaca ETF proxies');
    return fetchAlpacaIndices();
  }
}

// ---------------------------------------------------------------------------
// Alpaca ETF Indices fallback — SPY/QQQ/IWM/GLD as index proxies
// ---------------------------------------------------------------------------

async function fetchAlpacaIndices(): Promise<string> {
  try {
    const etfProxies = ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'];
    const params = new URLSearchParams({ symbols: etfProxies.join(','), feed: 'iex' });
    const url = `https://data.alpaca.markets/v2/stocks/snapshots?${params}`;

    const resp = await fetch(url, {
      headers: alpacaHeaders,
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) throw new Error(`Alpaca indices ${resp.status}`);
    const snapshots: Record<string, any> = await resp.json();

    const nameMap: Record<string, string> = {
      SPY: 'S&P 500 (SPY)', QQQ: 'NASDAQ (QQQ)', IWM: 'Russell 2000 (IWM)',
      GLD: 'Gold (GLD)', TLT: '20Y Treasury (TLT)',
    };

    const lines = Object.entries(snapshots).map(([symbol, snap]) => {
      const price = snap.latestTrade?.p || snap.minuteBar?.c || 0;
      const prevClose = snap.prevDailyBar?.c || 0;
      const change = prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0;
      const dir = change >= 0 ? '+' : '';
      return `  ${nameMap[symbol] || symbol}: ${price.toFixed(2)} (${dir}${change.toFixed(2)}%)`;
    });

    console.log('[market-data] Alpaca ETF index fallback succeeded');
    return 'Market Indices (ETF proxies via Alpaca):\n' + lines.join('\n');
  } catch (error: any) {
    console.warn('[market-data] Alpaca indices fallback also failed:', error.message);
    return `(Market indices unavailable: ${error.message})`;
  }
}

// ---------------------------------------------------------------------------
// Trending / market movers
// ---------------------------------------------------------------------------

async function fetchMarketMovers(): Promise<string> {
  try {
    const url = `${YAHOO_TRENDING_URL}?count=10`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) throw new Error(`Yahoo trending ${resp.status}`);
    const data: any = await resp.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];

    if (quotes.length === 0) return '(No trending data)';

    const symbols = quotes.map((q: any) => q.symbol).slice(0, 10);

    // Get actual quote data for trending symbols
    const detailUrl = `${YAHOO_QUOTE_URL}?symbols=${symbols.join(',')}&fields=shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume`;
    const detailResp = await fetch(detailUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    if (!detailResp.ok) return `Trending: ${symbols.join(', ')} (details unavailable)`;
    const detailData: any = await detailResp.json();
    const details: YahooQuote[] = detailData?.quoteResponse?.result || [];

    const lines = details.map((q) => {
      const dir = (q.regularMarketChangePercent || 0) >= 0 ? '+' : '';
      return `  ${q.symbol}: $${q.regularMarketPrice?.toFixed(2) || '?'} (${dir}${q.regularMarketChangePercent?.toFixed(2) || '?'}%) Vol: ${formatNumber(q.regularMarketVolume)}`;
    });

    return 'Trending / Most Active:\n' + lines.join('\n');
  } catch (error: any) {
    console.warn('[market-data] Movers failed:', error.message);
    return `(Market movers unavailable: ${error.message})`;
  }
}

// ---------------------------------------------------------------------------
// Alpaca bars — 20-day price history
// ---------------------------------------------------------------------------

export async function getRecentBars(symbols: string[], days: number = 20): Promise<Record<string, any[]>> {
  if (symbols.length === 0) return {};

  try {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const params = new URLSearchParams({
      symbols: symbols.join(','),
      timeframe: '1Day',
      start,
      end,
      limit: String(days),
      feed: 'iex',
    });

    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/bars?${params}`,
      { headers: alpacaHeaders }
    );

    if (!res.ok) {
      console.warn(`[market-data] Alpaca bars failed: ${res.status}`);
      return {};
    }

    const data: any = await res.json();
    return data.bars || {};
  } catch (error: any) {
    console.warn('[market-data] Alpaca bars error:', error.message);
    return {};
  }
}

function formatBarsContext(bars: Record<string, any[]>): string {
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
      `${symbol}: Last $${latest.c.toFixed(2)} | 20d: ${change20d}% | Range: $${low20d.toFixed(2)}-$${high20d.toFixed(2)} | Avg Vol: ${formatNumber(avgVolume)}`
    );
  }

  return summaries.length > 0 ? summaries.join('\n') : '(No bar data available)';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMarketCap(cap?: number): string {
  if (!cap) return 'N/A';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

function formatNumber(n?: number): string {
  if (!n) return 'N/A';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

/** Get a default watchlist of liquid, well-known names */
export function getDefaultWatchlist(): string[] {
  return [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
    'JPM', 'BAC', 'GS',
    'UNH', 'JNJ', 'PFE',
    'WMT', 'COST', 'HD',
    'XOM', 'CVX',
    'SPY', 'QQQ', 'IWM', 'TLT', 'GLD',
  ];
}

// ---------------------------------------------------------------------------
// Main: fetch all real market data → SkillsContext
// ---------------------------------------------------------------------------

export async function fetchRealMarketData(symbols: string[]): Promise<SkillsContext & { regimeInput: RegimeInput }> {
  console.log(`[market-data] Fetching real market data for ${symbols.length} symbols...`);
  const start = Date.now();

  const [quotes, fearGreed, indices, movers, bars] = await Promise.all([
    fetchYahooQuotes(symbols),
    fetchFearGreed(),
    fetchIndices(),
    fetchMarketMovers(),
    getRecentBars(symbols, 20),
  ]);

  const barsText = formatBarsContext(bars);
  const elapsed = Date.now() - start;
  console.log(`[market-data] Done in ${elapsed}ms`);

  const errors: string[] = [];
  if (quotes.startsWith('(')) errors.push('yahoo-quotes');
  if (fearGreed.startsWith('(')) errors.push('fear-greed');
  if (indices.startsWith('(')) errors.push('indices');
  if (movers.startsWith('(')) errors.push('movers');

  // Extract structured regime data from the text we already fetched
  const regimeInput = parseRegimeInputFromText(indices, fearGreed, quotes);

  return {
    technicals: `${indices}\n\n20-Day Price History:\n${barsText}`,
    polymarket: '(Replaced by Fear & Greed regime detection)',
    news: movers,
    fundamentals: quotes,
    stockAnalysis: fearGreed,
    predictions: '(Real market data replaces prediction markets)',
    accountState: '(Account state fetched directly via Alpaca API)',
    fetchedAt: new Date(),
    errors,
    regimeInput,
  };
}

/**
 * Extract structured regime inputs from the text output of our fetchers.
 * Since we generate the text, we know the exact format.
 */
function parseRegimeInputFromText(indicesText: string, fearGreedText: string, quotesText: string): RegimeInput {
  const input: RegimeInput = {};

  // VIX: from indices text → "  VIX: 18.42 (+1.23%)"
  const vixMatch = indicesText.match(/VIX:\s*([0-9]+\.?[0-9]*)/);
  if (vixMatch) input.vix = parseFloat(vixMatch[1]);

  // Fear & Greed: "Fear & Greed Index: 62 (Greed)"
  const fgMatch = fearGreedText.match(/Fear & Greed Index:\s*([0-9]+)/);
  if (fgMatch) input.fearGreedScore = parseFloat(fgMatch[1]);

  // S&P 500: "  S&P 500: 5234.18 (+0.45%)"
  const spyMatch = indicesText.match(/S&P 500:\s*([0-9,]+\.?[0-9]*)/);
  if (spyMatch) input.spyPrice = parseFloat(spyMatch[1].replace(/,/g, ''));

  // 10Y: "  10Y Yield: 4.23 (+0.03%)"
  const tnxMatch = indicesText.match(/10Y Yield:\s*([0-9]+\.?[0-9]*)/);
  if (tnxMatch) input.tenYearYield = parseFloat(tnxMatch[1]);

  // SPY 50d/200d MA: from quotes text → "SPY (SPDR S&P 500 ETF Trust)\n...50d MA: ABOVE  200d MA: ABOVE"
  // or from individual stock data → "50d MA: ABOVE"
  // We also get actual MA values from Yahoo: "fiftyDayAverage" in the raw quote
  // For now, extract from the per-stock format: "SPY...50d MA: ABOVE"
  const spyBlock = quotesText.match(/SPY[^]*?50d MA:\s*(ABOVE|BELOW)/);
  if (spyBlock && input.spyPrice != null) {
    // We don't have the exact 50d MA value from text, but we can infer trend
    // Set spy50dMA to a synthetic value that gives us the correct above/below result
    input.spy50dMA = spyBlock[1] === 'ABOVE'
      ? input.spyPrice * 0.99  // below current price → above_50d
      : input.spyPrice * 1.01; // above current price → below_50d
  }

  return input;
}

/** Format portfolio for LLM prompt consumption (used by analyst-runner) */
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

export function formatRealMarketData(ctx: SkillsContext): string {
  return [
    '=== LIVE MARKET DATA (real APIs) ===',
    '',
    '--- Stock Quotes & Fundamentals (Yahoo Finance) ---',
    ctx.fundamentals,
    '',
    '--- Market Indices + 20-Day History ---',
    ctx.technicals,
    '',
    '--- Fear & Greed Index (CNN) ---',
    ctx.stockAnalysis,
    '',
    '--- Trending / Most Active ---',
    ctx.news,
    '',
    `Fetched at: ${ctx.fetchedAt.toISOString()}`,
    '=== END MARKET DATA ===',
  ].join('\n');
}
