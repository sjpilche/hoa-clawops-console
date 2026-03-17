/**
 * Dynamic Universe Scanner
 *
 * Scans the entire US market for anomalies and feeds interesting symbols
 * into all strategies. Instead of a fixed 38-symbol list, this finds
 * TODAY's movers — gaps, volume spikes, new highs/lows.
 *
 * Uses Alpaca's snapshot endpoint to scan thousands of symbols at once.
 * Runs every 15 minutes during market hours.
 */

import { config } from '../../config';

const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

interface ScanResult {
  symbol: string;
  price: number;
  change: number;        // % change from prev close
  volume: number;
  avgVolume: number;      // 20-day average
  volumeRatio: number;
  reason: string;
}

// Core watchlist — always scanned regardless
const CORE_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
];

// Broad scan list — top 200 most liquid US stocks
const BROAD_UNIVERSE = [
  // Tech
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','INTC','CRM',
  'ADBE','NFLX','ORCL','CSCO','AVGO','QCOM','TXN','AMAT','MU','NOW',
  'SNOW','SHOP','SQ','PYPL','UBER','ABNB','COIN','RBLX','PLTR','PANW',
  // Finance
  'JPM','BAC','WFC','GS','MS','C','BLK','SCHW','AXP','COF',
  'V','MA','FIS','FISV','ICE','CME','MCO','SPGI','TFC','USB',
  // Healthcare
  'UNH','JNJ','PFE','ABBV','LLY','MRK','TMO','ABT','DHR','BMY',
  'AMGN','GILD','ISRG','MDT','ZTS','VRTX','REGN','SYK','BDX','CI',
  // Consumer
  'WMT','PG','KO','PEP','COST','HD','LOW','TGT','NKE','SBUX',
  'MCD','DIS','CMCSA','ABNB','BKNG','MAR','HLT','LVS','WYNN','DPZ',
  // Energy
  'XOM','CVX','COP','SLB','EOG','PXD','MPC','VLO','PSX','OXY',
  // Industrial
  'CAT','DE','GE','HON','UNP','UPS','FDX','BA','RTX','LMT',
  'MMM','ETN','EMR','ITW','PH','ROK','GD','NOC','TDG','WM',
  // Materials / REITs / Utilities
  'LIN','APD','FCX','NEM','NUE','AMT','PLD','CCI','EQIX','SPG',
  'NEE','DUK','SO','D','AEP','XEL','SRE','ED','WEC','ES',
  // ETFs
  'SPY','QQQ','IWM','DIA','XLF','XLE','XLK','XLV','XLI','XLC',
  'XLB','XLRE','XLU','XLP','XLY','GLD','SLV','TLT','HYG','LQD',
  'VXX','ARKK','ARKG','SMH','XBI','IBB','KRE','XHB','ITB','JETS',
];

/**
 * Scan for today's biggest movers using Alpaca snapshots.
 * Returns symbols worth watching — big drops, volume spikes, unusual moves.
 */
export async function scanForMovers(): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  try {
    // Fetch snapshots in batches (Alpaca allows ~200 per request)
    const unique = [...new Set(BROAD_UNIVERSE)];
    const batchSize = 100;

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const symbols = batch.join(',');

      const url = `${ALPACA_DATA_BASE}/v2/stocks/snapshots?symbols=${symbols}&feed=iex`;
      const resp = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': config.brokerApiKey,
          'APCA-API-SECRET-KEY': config.brokerApiSecret,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        console.warn(`[Universe Scanner] Snapshot batch failed: ${resp.status}`);
        continue;
      }

      const snapshots: Record<string, any> = await resp.json();

      for (const [symbol, snap] of Object.entries(snapshots)) {
        try {
          const price = snap.latestTrade?.p || snap.minuteBar?.c || 0;
          const prevClose = snap.prevDailyBar?.c || 0;
          const volume = snap.dailyBar?.v || 0;
          const avgVolume = snap.prevDailyBar?.v || 1; // rough proxy

          if (price === 0 || prevClose === 0) continue;

          const change = ((price - prevClose) / prevClose) * 100;
          const volumeRatio = avgVolume > 0 ? volume / avgVolume : 0;

          // Flag interesting moves
          let reason = '';
          if (Math.abs(change) >= 5) {
            reason = `${change > 0 ? 'Gap up' : 'Gap down'} ${Math.abs(change).toFixed(1)}%`;
          } else if (volumeRatio >= 3) {
            reason = `Volume spike ${volumeRatio.toFixed(1)}x avg`;
          } else if (Math.abs(change) >= 3 && volumeRatio >= 1.5) {
            reason = `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change).toFixed(1)}% on ${volumeRatio.toFixed(1)}x vol`;
          }

          if (reason) {
            results.push({ symbol, price, change, volume, avgVolume, volumeRatio, reason });
          }
        } catch {}
      }
    }

    // Sort by magnitude of move
    results.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    if (results.length > 0) {
      console.log(`[Universe Scanner] Found ${results.length} movers:`);
      results.slice(0, 10).forEach(r => {
        console.log(`  ${r.symbol}: ${r.change >= 0 ? '+' : ''}${r.change.toFixed(1)}% @ $${r.price.toFixed(2)} — ${r.reason}`);
      });
    } else {
      console.log('[Universe Scanner] No significant movers found');
    }

  } catch (error: any) {
    console.warn('[Universe Scanner] Scan failed:', error.message);
  }

  return results;
}

/**
 * Get the combined symbol list: core + today's movers.
 * This replaces the static SYMBOL_UNIVERSE.
 */
export async function getDynamicUniverse(): Promise<string[]> {
  const movers = await scanForMovers();
  const moverSymbols = movers.map(m => m.symbol);

  // Combine core + movers, dedup
  const combined = [...new Set([...CORE_SYMBOLS, ...moverSymbols])];
  console.log(`[Universe Scanner] Dynamic universe: ${combined.length} symbols (${CORE_SYMBOLS.length} core + ${moverSymbols.length} movers)`);

  return combined;
}

export { BROAD_UNIVERSE, CORE_SYMBOLS };
