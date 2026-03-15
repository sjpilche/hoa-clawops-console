import { getExecStore } from '../../singletons';
import { ExecStore } from '../../db/exec-store';
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
  private broker: IBrokerAdapter;

  constructor(broker?: IBrokerAdapter) {
    if (broker) {
      this.broker = broker;
    } else if (config.brokerApiKey && config.brokerApiSecret) {
      this.broker = new AlpacaAdapter({
        apiKey: config.brokerApiKey,
        apiSecret: config.brokerApiSecret,
        baseUrl: config.brokerBaseUrl,
      });
    } else {
      this.broker = null as unknown as IBrokerAdapter;
    }
  }

  private get exec(): ExecStore | null {
    return getExecStore();
  }

  async getCurrentPositions(): Promise<Position[]> {
    // Try broker first for real-time data
    if (this.broker) {
      try {
        await this.broker.connect();
        const brokerPositions = await this.broker.getPositions();
        return brokerPositions.map((p: any) => ({
          symbol: p.symbol,
          qty: parseFloat(p.qty),
          avgPrice: parseFloat(p.avg_entry_price || p.avgPrice || 0),
          marketPrice: parseFloat(p.current_price || p.marketPrice || 0),
          marketValue: parseFloat(p.market_value || p.marketValue || 0),
          costBasis: parseFloat(p.cost_basis || p.costBasis || 0),
          unrealizedPnl: parseFloat(p.unrealized_pl || p.unrealizedPnl || 0),
          unrealizedPnlPct: parseFloat(p.unrealized_plpc || p.unrealizedPnlPct || 0),
          side: parseFloat(p.qty) > 0 ? 'long' as const : parseFloat(p.qty) < 0 ? 'short' as const : 'flat' as const,
          lastUpdated: new Date(),
        }));
      } catch (err: any) {
        console.warn('⚠️  Broker positions unavailable, falling back to SQLite:', err.message);
      }
    }

    // Fallback to SQLite
    if (!this.exec) return [];
    return this.exec.getAllCurrentPositions().map((row: any) => this.mapRow(row));
  }

  async getPosition(symbol: string): Promise<Position | null> {
    if (!this.exec) return null;
    const row = this.exec.getLatestPosition(symbol);
    return row ? this.mapRow(row) : null;
  }

  async getPortfolioValue(): Promise<{ totalValue: number; cash: number; positions: Position[] }> {
    if (this.broker) {
      try {
        await this.broker.connect();
        const account = await this.broker.getAccount();
        const positions = await this.getCurrentPositions();
        return {
          totalValue: parseFloat(account.portfolio_value || account.equity || 0),
          cash: parseFloat(account.cash || 0),
          positions,
        };
      } catch {}
    }
    const positions = await this.getCurrentPositions();
    const totalValue = positions.reduce((s, p) => s + p.marketValue, 0);
    return { totalValue, cash: 0, positions };
  }

  async syncFromBroker(): Promise<void> {
    if (!this.broker || !this.exec) return;
    try {
      await this.broker.connect();
      const brokerPositions = await this.broker.getPositions();
      for (const p of brokerPositions) {
        this.exec.insertPositionSnapshot(
          p.symbol,
          parseFloat(p.qty),
          parseFloat(p.avg_entry_price || 0),
          parseFloat(p.current_price || 0),
          parseFloat(p.unrealized_pl || 0)
        );
      }
    } catch (err: any) {
      console.warn('⚠️  Position sync failed:', err.message);
    }
  }

  async reconcile(): Promise<PositionReconciliation[]> {
    const internal = await this.getCurrentPositions();
    if (!this.broker) return internal.map(p => ({ symbol: p.symbol, internalQty: p.qty, brokerQty: 0, difference: p.qty, matched: false }));

    try {
      await this.broker.connect();
      const brokerPositions = await this.broker.getPositions();
      const brokerMap = new Map(brokerPositions.map((p: any) => [p.symbol, parseFloat(p.qty)]));

      return internal.map(p => {
        const brokerQty = brokerMap.get(p.symbol) || 0;
        return { symbol: p.symbol, internalQty: p.qty, brokerQty, difference: Math.abs(p.qty - brokerQty), matched: p.qty === brokerQty };
      });
    } catch { return []; }
  }

  private mapRow(row: any): Position {
    const qty = row.qty || 0;
    const avgPrice = row.avg_price || 0;
    const marketPrice = row.market_price || 0;
    return {
      symbol: row.symbol,
      qty,
      avgPrice,
      marketPrice,
      marketValue: qty * marketPrice,
      costBasis: qty * avgPrice,
      unrealizedPnl: row.unrealized_pnl || 0,
      unrealizedPnlPct: avgPrice > 0 ? ((marketPrice - avgPrice) / avgPrice) * 100 : 0,
      side: qty > 0 ? 'long' : qty < 0 ? 'short' : 'flat',
      lastUpdated: new Date(row.ts || Date.now()),
    };
  }
}
