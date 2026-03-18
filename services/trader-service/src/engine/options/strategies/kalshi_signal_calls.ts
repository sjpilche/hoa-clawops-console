/**
 * Kalshi Signal → Options Bridge
 *
 * When the Kalshi prediction market goes oversold on S&P/Nasdaq EOY contracts,
 * that same signal triggers SPY/QQQ CALL buys in the Alpaca paper account.
 *
 * The edge: prediction markets are LEADING indicators. Retail panic-sells Kalshi
 * YES contracts → price drops → we buy Kalshi AND buy the leveraged SPY call.
 * If the index recovers (it usually does from intraday dips), both pay off.
 * The option multiplies the equity gain 5-10x.
 *
 * Strategy rules:
 *   - Signal: Kalshi momentum_oversold on KXINXPOS or KXNASDAQ100POS
 *   - Entry: ATM call, 14 DTE (enough time for mean reversion)
 *   - Max premium per contract: $300 (1 contract = 100 shares leverage)
 *   - Max concurrent positions: 2 (one SPY, one QQQ)
 *   - Take profit: +50%
 *   - Stop loss: -40%
 *   - Time exit: close at 3 DTE to avoid gamma risk
 */

import { AlpacaOptionsClient } from '../alpaca-options';

export interface KalshiOptionsPosition {
  id: string;
  contractSymbol: string;
  underlyingSymbol: string;
  type: 'call';
  qty: number;
  entryPrice: number;
  entryDate: Date;
  expirationDate: string;
  daysToExpiry: number;
  kalshiSignalTicker: string;
  kalshiSignalStrength: number;
  entrySpyPrice: number;
  status: 'open' | 'closed';
  exitPrice?: number;
  exitDate?: Date;
  exitReason?: string;
  pnlDollars?: number;
  pnlPct?: number;
}

export interface KalshiOptionsStats {
  totalTrades: number;
  openPositions: number;
  winRate: number;
  totalPnlDollars: number;
  avgReturn: number;
  bestTrade: number;
  worstTrade: number;
}

const TARGET_DTE = 14;
const MAX_PREMIUM = 300;       // max $ to pay per contract
const TAKE_PROFIT_PCT = 0.50;  // +50%
const STOP_LOSS_PCT = 0.40;    // -40%
const MIN_DTE_EXIT = 3;        // close if ≤ 3 days left

// Kalshi series → underlying symbol + option type
const SERIES_MAP: Record<string, { underlying: string; type: 'call' }> = {
  KXINXPOS: { underlying: 'SPY', type: 'call' },
  KXNASDAQ100POS: { underlying: 'QQQ', type: 'call' },
};

export class KalshiSignalCallsStrategy {
  private client: AlpacaOptionsClient;
  private openPositions: Map<string, KalshiOptionsPosition> = new Map();
  private closedTrades: KalshiOptionsPosition[] = [];

  constructor() {
    this.client = new AlpacaOptionsClient();
  }

  /**
   * Called by the options engine each scan cycle with fresh Kalshi signals.
   * Returns a log of actions taken.
   */
  async evaluate(
    kalshiSignals: Array<{
      type: string;
      ticker: string;
      strength: number;
      priceCents: number;
    }>,
  ): Promise<Array<{ action: string; details: string }>> {
    const results: Array<{ action: string; details: string }> = [];

    // 1. Manage existing positions first
    const exitResults = await this.managePositions();
    results.push(...exitResults);

    // 2. Look for new entries from Kalshi oversold signals
    const oversoldSignals = kalshiSignals.filter(s =>
      s.type === 'momentum_oversold' && s.strength >= 0.5,
    );

    for (const signal of oversoldSignals) {
      // Extract series from ticker (e.g. KXINXPOS-26DEC31H1900-T6845.5 → KXINXPOS)
      const series = Object.keys(SERIES_MAP).find(k => signal.ticker.startsWith(k));
      if (!series) continue;

      const { underlying } = SERIES_MAP[series];

      // Already have a position in this underlying? Skip.
      const alreadyOpen = [...this.openPositions.values()].some(
        p => p.underlyingSymbol === underlying && p.status === 'open',
      );
      if (alreadyOpen) continue;

      // Cap at 2 concurrent options positions
      const openCount = [...this.openPositions.values()].filter(p => p.status === 'open').length;
      if (openCount >= 2) continue;

      const entryResult = await this.enterPosition(underlying, signal.ticker, signal.strength);
      if (entryResult) results.push(entryResult);
    }

    return results;
  }

  private async enterPosition(
    underlying: string,
    kalshiTicker: string,
    signalStrength: number,
  ): Promise<{ action: string; details: string } | null> {
    try {
      const underlyingPrice = await this.client.getUnderlyingPrice(underlying);
      if (!underlyingPrice) throw new Error('Could not fetch price');

      // Find ATM call ~14 DTE
      const contract = await this.client.findContract(underlying, underlyingPrice, 'call', {
        moneyness: 0.005,       // nearly ATM (0.5% OTM for liquidity)
        daysToExpiry: TARGET_DTE,
        minOpenInterest: 100,
        maxSpreadPct: 0.15,
      });

      if (!contract) {
        console.log(`[KalshiOptions] ⚠️ No suitable ${underlying} call contract found`);
        return null;
      }

      const premium = (contract.lastPrice || 1) * contract.multiplier;
      if (premium > MAX_PREMIUM) {
        console.log(`[KalshiOptions] ⚠️ ${underlying} call too expensive: $${premium.toFixed(0)} > max $${MAX_PREMIUM}`);
        return null;
      }

      // Submit the order
      await this.client.submitOrder({
        contractSymbol: contract.symbol,
        qty: 1,
        side: 'buy',
        orderType: 'market',
      });

      const daysToExpiry = Math.ceil(
        (new Date(contract.expirationDate).getTime() - Date.now()) / 86400000,
      );

      const position: KalshiOptionsPosition = {
        id: `opt-${Date.now()}`,
        contractSymbol: contract.symbol,
        underlyingSymbol: underlying,
        type: 'call',
        qty: 1,
        entryPrice: contract.lastPrice || 0,
        entryDate: new Date(),
        expirationDate: contract.expirationDate,
        daysToExpiry,
        kalshiSignalTicker: kalshiTicker,
        kalshiSignalStrength: signalStrength,
        entrySpyPrice: underlyingPrice,
        status: 'open',
      };

      this.openPositions.set(position.id, position);

      const detail = `BUY 1x ${contract.symbol} @ ~$${(contract.lastPrice || 0).toFixed(2)} (${daysToExpiry}DTE, premium: $${premium.toFixed(0)}) — Kalshi signal: ${kalshiTicker}`;
      console.log(`[KalshiOptions] ✅ ${detail}`);
      return { action: 'buy_call', details: detail };
    } catch (err: any) {
      console.error(`[KalshiOptions] Entry failed for ${underlying}: ${err.message}`);
      return null;
    }
  }

  private async managePositions(): Promise<Array<{ action: string; details: string }>> {
    const results: Array<{ action: string; details: string }> = [];
    const alpacaPositions = await this.client.getOptionsPositions().catch(() => []);

    for (const [id, pos] of this.openPositions) {
      if (pos.status !== 'open') continue;

      // Find in Alpaca
      const live = alpacaPositions.find(p => p.contractSymbol === pos.contractSymbol);

      if (!live) {
        // Position gone (expired or closed externally)
        pos.status = 'closed';
        pos.exitDate = new Date();
        pos.exitReason = 'expired_or_closed';
        this.closedTrades.push({ ...pos });
        this.openPositions.delete(id);
        results.push({ action: 'closed', details: `${pos.contractSymbol} — no longer in Alpaca` });
        continue;
      }

      const currentPrice = live.currentPrice;
      const returnPct = pos.entryPrice > 0 ? (currentPrice - pos.entryPrice) / pos.entryPrice : 0;
      const daysLeft = live.daysToExpiry;

      // Update DTE
      pos.daysToExpiry = daysLeft;

      let exitReason: string | null = null;
      if (returnPct >= TAKE_PROFIT_PCT) exitReason = 'take_profit';
      else if (returnPct <= -STOP_LOSS_PCT) exitReason = 'stop_loss';
      else if (daysLeft <= MIN_DTE_EXIT) exitReason = 'near_expiry';

      if (exitReason) {
        try {
          await this.client.submitOrder({
            contractSymbol: pos.contractSymbol,
            qty: 1,
            side: 'sell',
            orderType: 'market',
          });

          const pnl = (currentPrice - pos.entryPrice) * pos.qty * 100;
          pos.status = 'closed';
          pos.exitPrice = currentPrice;
          pos.exitDate = new Date();
          pos.exitReason = exitReason;
          pos.pnlDollars = pnl;
          pos.pnlPct = returnPct;

          this.closedTrades.push({ ...pos });
          this.openPositions.delete(id);

          const detail = `SELL ${pos.contractSymbol}: ${exitReason} | ${returnPct >= 0 ? '+' : ''}${(returnPct * 100).toFixed(1)}% = ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`;
          console.log(`[KalshiOptions] 💰 ${detail}`);
          results.push({ action: exitReason, details: detail });
        } catch (err: any) {
          console.error(`[KalshiOptions] Exit failed: ${err.message}`);
        }
      }
    }

    return results;
  }

  getOpenPositions(): KalshiOptionsPosition[] {
    return [...this.openPositions.values()].filter(p => p.status === 'open');
  }

  getClosedTrades(): KalshiOptionsPosition[] {
    return [...this.closedTrades];
  }

  getStats(): KalshiOptionsStats {
    const closed = this.closedTrades;
    const wins = closed.filter(t => (t.pnlDollars || 0) > 0);
    const totalPnl = closed.reduce((s, t) => s + (t.pnlDollars || 0), 0);
    const returns = closed.map(t => t.pnlPct || 0);

    return {
      totalTrades: closed.length,
      openPositions: this.getOpenPositions().length,
      winRate: closed.length > 0 ? wins.length / closed.length : 0,
      totalPnlDollars: totalPnl,
      avgReturn: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0,
      bestTrade: returns.length > 0 ? Math.max(...returns) : 0,
      worstTrade: returns.length > 0 ? Math.min(...returns) : 0,
    };
  }

  getActiveCount(): number {
    return this.getOpenPositions().length;
  }
}
