import { getExecStore } from '../../singletons';
import { ExecStore } from '../../db/exec-store';
import { IBrokerAdapter } from './broker/types';
import { AlpacaAdapter } from './broker/alpaca';
import { config } from '../../config';
import { v4 as uuidv4 } from 'uuid';

export interface Fill {
  fillId: string;
  orderId: string;
  brokerOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  qty: number;
  fee: number;
  fillTs: Date;
}

export type OnFillCallback = (fill: Fill) => Promise<void>;

export class FillHandler {
  private broker: IBrokerAdapter;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private onFillCallback: OnFillCallback | null = null;

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

  private get exec(): ExecStore {
    const store = getExecStore();
    if (!store) throw new Error('ExecStore not initialized');
    return store;
  }

  async startPolling(intervalMs: number = 5000): Promise<void> {
    if (!this.broker) {
      console.log('⏭️  Fill Handler: Skipping (no broker configured)');
      return;
    }
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('🔄 Fill Handler: Starting (polling every ' + intervalMs + 'ms)');

    await this.broker.connect();

    try { await this.pollForFills(); } catch (error: any) {
      console.warn('⚠️  Fill poll initial error:', error.message);
    }

    this.pollInterval = setInterval(async () => {
      try { await this.pollForFills(); } catch {}
    }, intervalMs);
  }

  async stopPolling(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    if (this.broker) await this.broker.disconnect();
    console.log('🛑 Fill Handler: Stopped');
  }

  setOnFillCallback(callback: OnFillCallback): void {
    this.onFillCallback = callback;
    console.log('🔗 Fill Handler: onFill callback registered');
  }

  private async pollForFills(): Promise<void> {
    const openOrders = this.exec.getOpenOrders();
    if (openOrders.length === 0) return;

    for (const order of openOrders) {
      try {
        await this.checkOrderForFills(order);
      } catch (error: any) {
        console.error(`Error checking order ${order.broker_order_id}:`, error.message);
      }
    }
  }

  private async checkOrderForFills(order: any): Promise<void> {
    if (!order.broker_order_id) return;

    // Get order status from broker
    const brokerOrder = await this.broker.getOrder(order.broker_order_id);

    // Update order status
    this.exec.updateOrderStatus(order.order_id, brokerOrder.status);

    // If filled or partially filled, record the fill
    if (brokerOrder.filledQty > 0) {
      const existingFills = this.exec.getFillsForOrder(order.order_id);
      const totalFilledQty = existingFills.reduce((sum: number, f: any) => sum + f.qty, 0);

      if (brokerOrder.filledQty > totalFilledQty) {
        const newFillQty = brokerOrder.filledQty - totalFilledQty;

        const fill: Fill = {
          fillId: uuidv4(),
          orderId: order.order_id,
          brokerOrderId: order.broker_order_id,
          symbol: brokerOrder.symbol || order.symbol,
          side: brokerOrder.side || order.side,
          price: brokerOrder.filledAvgPrice || 0,
          qty: newFillQty,
          fee: 0,
          fillTs: brokerOrder.filledAt || new Date(),
        };

        // Record fill + update position atomically
        this.exec.transaction(() => {
          this.exec.insertFill({
            fillId: fill.fillId,
            orderId: fill.orderId,
            symbol: fill.symbol,
            side: fill.side,
            price: fill.price,
            qty: fill.qty,
            fee: fill.fee,
            fillTs: fill.fillTs instanceof Date ? fill.fillTs.toISOString() : String(fill.fillTs),
          });

          this.exec.updateOrderStatus(
            order.order_id,
            brokerOrder.status,
            brokerOrder.filledAvgPrice,
            brokerOrder.filledQty
          );

          this.exec.logAudit('system', 'fill_recorded', fill.orderId, {
            fillId: fill.fillId, symbol: fill.symbol, side: fill.side, qty: fill.qty, price: fill.price,
          });

          // Update position snapshot
          this.updatePositionSync(fill);
        });

        console.log(`✓ FILL RECORDED: ${fill.side.toUpperCase()} ${fill.qty} ${fill.symbol} @ $${fill.price}`);

        // Notify outcome tracker (non-blocking)
        if (this.onFillCallback) {
          this.onFillCallback(fill).catch(err =>
            console.warn('Fill callback error (non-fatal):', err.message)
          );
        }

        // Update daily P&L
        const today = new Date().toISOString().slice(0, 10);
        if (fill.side === 'sell') {
          const position = this.exec.getLatestPosition(fill.symbol);
          if (position) {
            const realizedPnl = fill.qty * (fill.price - position.avg_price);
            this.exec.updateDailyPnl(today, realizedPnl, 0, fill.fee, 1);
          }
        }
      }
    }
  }

  private updatePositionSync(fill: Fill): void {
    const current = this.exec.getLatestPosition(fill.symbol);
    let qty = current?.qty || 0;
    let avgPrice = current?.avg_price || 0;

    if (fill.side === 'buy') {
      const totalCost = (qty * avgPrice) + (fill.qty * fill.price);
      qty += fill.qty;
      avgPrice = qty > 0 ? totalCost / qty : 0;
    } else {
      qty -= fill.qty;
    }

    const unrealizedPnl = qty * (fill.price - avgPrice);
    this.exec.insertPositionSnapshot(fill.symbol, qty, avgPrice, fill.price, unrealizedPnl);

    console.log(`✓ Position: ${fill.symbol} qty=${qty} avg=$${avgPrice.toFixed(2)} uPnL=$${unrealizedPnl.toFixed(2)}`);
  }

  async processOrder(brokerOrderId: string): Promise<void> {
    const order = this.exec.getOrderByBrokerId(brokerOrderId);
    if (!order) throw new Error(`Order not found: ${brokerOrderId}`);
    await this.checkOrderForFills(order);
  }
}
