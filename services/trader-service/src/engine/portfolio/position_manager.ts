import { Pool } from 'pg';
import { IBrokerAdapter } from '../execution/broker/types';
import { AlpacaAdapter } from '../execution/broker/alpaca';
import { config } from '../../config';

export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  side: 'long' | 'short' | 'flat';
  lastUpdated: Date;
}

export interface PositionReconciliation {
  symbol: string;
  internalQty: number;
  brokerQty: number;
  difference: number;
  matched: boolean;
}

export class PositionManager {
  private pool: Pool;
  private broker: IBrokerAdapter;

  constructor(pool?: Pool, broker?: IBrokerAdapter) {
    this.pool = pool || new Pool({ connectionString: config.dbUrl });

    if (broker) {
      this.broker = broker;
    } else if (config.brokerApiKey && config.brokerApiSecret) {
      this.broker = new AlpacaAdapter({
        apiKey: config.brokerApiKey,
        apiSecret: config.brokerApiSecret,
        baseUrl: config.brokerBaseUrl,
      });
    } else {
      // No broker credentials configured — paper/dev mode (no live connection)
      this.broker = null as unknown as IBrokerAdapter;
    }
  }

  /**
   * Get all current positions (latest snapshot)
   */
  async getCurrentPositions(): Promise<Position[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT ON (symbol)
        symbol,
        qty,
        avg_price,
        market_price,
        unrealized_pnl,
        ts
      FROM trd_position_snapshot
      WHERE qty != 0
      ORDER BY symbol, ts DESC
    `);

    return result.rows.map((row) => this.mapPosition(row));
  }

  /**
   * Get position for specific symbol
   */
  async getPosition(symbol: string): Promise<Position | null> {
    const result = await this.pool.query(
      `SELECT * FROM trd_position_snapshot
       WHERE symbol = $1
       ORDER BY ts DESC
       LIMIT 1`,
      [symbol]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapPosition(result.rows[0]);
  }

  /**
   * Get position history for a symbol
   */
  async getPositionHistory(symbol: string, limit: number = 100): Promise<Position[]> {
    const result = await this.pool.query(
      `SELECT * FROM trd_position_snapshot
       WHERE symbol = $1
       ORDER BY ts DESC
       LIMIT $2`,
      [symbol, limit]
    );

    return result.rows.map((row) => this.mapPosition(row));
  }

  /**
   * Get total portfolio value
   */
  async getPortfolioValue(): Promise<{
    totalValue: number;
    cash: number;
    longValue: number;
    shortValue: number;
    unrealizedPnl: number;
  }> {
    const positions = await this.getCurrentPositions();

    const longValue = positions
      .filter((p) => p.side === 'long')
      .reduce((sum, p) => sum + p.marketValue, 0);

    const shortValue = positions
      .filter((p) => p.side === 'short')
      .reduce((sum, p) => sum + Math.abs(p.marketValue), 0);

    const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    // Get cash from broker
    await this.broker.connect();
    const account = await this.broker.getAccount();

    return {
      totalValue: account.portfolioValue,
      cash: account.cash,
      longValue,
      shortValue,
      unrealizedPnl,
    };
  }

  /**
   * Reconcile internal positions vs broker positions
   */
  async reconcilePositions(): Promise<{
    matched: boolean;
    mismatches: PositionReconciliation[];
    summary: {
      totalPositions: number;
      matched: number;
      mismatched: number;
    };
  }> {
    console.log('🔍 Starting position reconciliation...');

    // Get internal positions
    const internalPositions = await this.getCurrentPositions();
    const internalMap = new Map<string, number>();
    internalPositions.forEach((p) => internalMap.set(p.symbol, p.qty));

    // Get broker positions
    await this.broker.connect();
    const brokerPositions = await this.broker.getPositions();
    const brokerMap = new Map<string, number>();
    brokerPositions.forEach((p) => brokerMap.set(p.symbol, p.qty));

    // Get all unique symbols
    const allSymbols = new Set([...internalMap.keys(), ...brokerMap.keys()]);

    const mismatches: PositionReconciliation[] = [];
    let matchedCount = 0;

    for (const symbol of allSymbols) {
      const internalQty = internalMap.get(symbol) || 0;
      const brokerQty = brokerMap.get(symbol) || 0;
      const difference = internalQty - brokerQty;
      const matched = Math.abs(difference) < 0.000001; // Float comparison tolerance

      if (!matched) {
        mismatches.push({
          symbol,
          internalQty,
          brokerQty,
          difference,
          matched: false,
        });

        console.log(`⚠️  MISMATCH: ${symbol}`);
        console.log(`   Internal: ${internalQty} | Broker: ${brokerQty} | Diff: ${difference}`);
      } else {
        matchedCount++;
      }
    }

    const allMatched = mismatches.length === 0;

    if (allMatched) {
      console.log('✓ Position reconciliation: ALL MATCHED');
    } else {
      console.log(`⚠️  Position reconciliation: ${mismatches.length} MISMATCHES`);
    }

    return {
      matched: allMatched,
      mismatches,
      summary: {
        totalPositions: allSymbols.size,
        matched: matchedCount,
        mismatched: mismatches.length,
      },
    };
  }

  /**
   * Update positions from broker (force sync)
   */
  async syncFromBroker(): Promise<void> {
    console.log('🔄 Syncing positions from broker...');

    await this.broker.connect();
    const brokerPositions = await this.broker.getPositions();

    for (const brokerPos of brokerPositions) {
      // Get current market price
      const quote = await this.broker.getQuote(brokerPos.symbol);
      const marketPrice = quote.last || brokerPos.currentPrice;

      // Insert position snapshot
      await this.pool.query(
        `INSERT INTO trd_position_snapshot (symbol, qty, avg_price, market_price, unrealized_pnl)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          brokerPos.symbol,
          brokerPos.qty,
          brokerPos.avgEntryPrice,
          marketPrice,
          brokerPos.unrealizedPl,
        ]
      );

      console.log(`✓ Synced position: ${brokerPos.symbol} (${brokerPos.qty} shares)`);
    }

    console.log(`✓ Synced ${brokerPositions.length} positions from broker`);
  }

  /**
   * Calculate exposure
   */
  async getExposure(): Promise<{
    grossExposure: number;
    netExposure: number;
    longExposure: number;
    shortExposure: number;
  }> {
    const positions = await this.getCurrentPositions();

    const longExposure = positions
      .filter((p) => p.side === 'long')
      .reduce((sum, p) => sum + Math.abs(p.marketValue), 0);

    const shortExposure = positions
      .filter((p) => p.side === 'short')
      .reduce((sum, p) => sum + Math.abs(p.marketValue), 0);

    const grossExposure = longExposure + shortExposure;
    const netExposure = longExposure - shortExposure;

    return {
      grossExposure,
      netExposure,
      longExposure,
      shortExposure,
    };
  }

  /**
   * Map database row to Position object
   */
  private mapPosition(row: any): Position {
    const qty = parseFloat(row.qty);
    const avgPrice = parseFloat(row.avg_price);
    const marketPrice = parseFloat(row.market_price);
    const costBasis = qty * avgPrice;
    const marketValue = qty * marketPrice;
    const unrealizedPnl = parseFloat(row.unrealized_pnl);
    const unrealizedPnlPct = costBasis !== 0 ? (unrealizedPnl / costBasis) * 100 : 0;

    return {
      symbol: row.symbol,
      qty,
      avgPrice,
      marketPrice,
      marketValue,
      costBasis,
      unrealizedPnl,
      unrealizedPnlPct,
      side: qty > 0 ? 'long' : qty < 0 ? 'short' : 'flat',
      lastUpdated: row.ts,
    };
  }
}
