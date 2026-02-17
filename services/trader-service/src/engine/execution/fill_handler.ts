import { Pool, PoolClient } from 'pg';
import { getPool } from '../../db/pool';
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

export class FillHandler {
  private pool: Pool;
  private broker: IBrokerAdapter;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(pool?: Pool, broker?: IBrokerAdapter) {
    this.pool = pool || getPool();

    if (broker) {
      this.broker = broker;
    } else if (config.brokerApiKey && config.brokerApiSecret) {
      this.broker = new AlpacaAdapter({
        apiKey: config.brokerApiKey,
        apiSecret: config.brokerApiSecret,
        baseUrl: config.brokerBaseUrl,
      });
    } else {
      // No broker credentials — paper/dev mode (no live connection)
      this.broker = null as unknown as IBrokerAdapter;
    }
  }

  /**
   * Start polling for fills
   */
  async startPolling(intervalMs: number = 5000): Promise<void> {
    if (!this.broker) {
      console.log('⏭️  Fill Handler: Skipping (no broker configured — paper/dev mode)');
      return;
    }
    if (this.isRunning) {
      console.log('⚠️  Fill handler already running');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Fill Handler: Starting (polling every ' + intervalMs + 'ms)');

    await this.broker.connect();

    // Poll immediately, then on interval
    try {
      await this.pollForFills();
    } catch (error: any) {
      console.warn('⚠️  Fill poll skipped (DB unavailable):', error.message);
    }

    this.pollInterval = setInterval(async () => {
      try {
        await this.pollForFills();
      } catch (error: any) {
        // Silently skip — DB may not be available in dev
      }
    }, intervalMs);
  }

  /**
   * Stop polling
   */
  async stopPolling(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    if (this.broker) {
      await this.broker.disconnect();
    }
    console.log('🛑 Fill Handler: Stopped');
  }

  /**
   * Poll for fills from broker
   */
  private async pollForFills(): Promise<void> {
    // Get all open orders from database
    const openOrders = await this.getOpenOrders();

    if (openOrders.length === 0) {
      return; // No open orders to check
    }

    // Check each order for fills
    for (const order of openOrders) {
      try {
        await this.checkOrderForFills(order);
      } catch (error: any) {
        console.error(`Error checking order ${order.broker_order_id}:`, error.message);
      }
    }
  }

  /**
   * Check a specific order for fills (with row-level locking to prevent duplicate fills)
   */
  private async checkOrderForFills(order: any): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Lock the order row to prevent concurrent processing
      const orderLockResult = await client.query(
        `SELECT order_id, status FROM trd_order WHERE order_id = $1 FOR UPDATE`,
        [order.order_id]
      );

      if (orderLockResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return; // Order not found
      }

      // Get order status from broker
      const brokerOrder = await this.broker.getOrder(order.broker_order_id);

      // Update order status in database
      await client.query(
        `UPDATE trd_order
         SET status = $1, last_update_at = now()
         WHERE order_id = $2 AND status != $1`,
        [brokerOrder.status, order.order_id]
      );

      // If filled or partially filled, record the fill
      if (brokerOrder.filledQty > 0) {
        // Get existing fills with lock
        const existingFillsResult = await client.query(
          `SELECT * FROM trd_fill WHERE order_id = $1`,
          [order.order_id]
        );

        const existingFills = existingFillsResult.rows.map((row) => ({
          fillId: row.fill_id,
          orderId: row.order_id,
          price: parseFloat(row.price),
          qty: parseFloat(row.qty),
          fee: parseFloat(row.fee),
          fillTs: row.fill_ts,
        }));

        const totalFilledQty = existingFills.reduce((sum, f) => sum + f.qty, 0);

        // Only record new fills
        if (brokerOrder.filledQty > totalFilledQty) {
          const newFillQty = brokerOrder.filledQty - totalFilledQty;

          const fill: Fill = {
            fillId: uuidv4(),
            orderId: order.order_id,
            brokerOrderId: order.broker_order_id,
            symbol: brokerOrder.symbol,
            side: brokerOrder.side,
            price: brokerOrder.filledAvgPrice || 0,
            qty: newFillQty,
            fee: 0, // TODO: Get fee from broker if available
            fillTs: brokerOrder.filledAt || new Date(),
          };

          await this.recordFill(fill, client);

          console.log(`✓ FILL RECORDED: ${fill.side.toUpperCase()} ${fill.qty} ${fill.symbol} @ $${fill.price}`);
          console.log(`   Order: ${order.broker_order_id} | Fill: ${fill.fillId}`);

          // Update position
          await this.updatePosition(fill, client);

          // If order is fully filled, mark as complete
          if (brokerOrder.status === 'filled') {
            console.log(`✓ Order fully filled: ${order.broker_order_id}`);
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get open orders from database
   */
  private async getOpenOrders(): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT o.order_id, o.broker_order_id, o.status, i.symbol, i.side, i.qty
      FROM trd_order o
      JOIN trd_order_intent i ON i.intent_id = o.intent_id
      WHERE o.status IN ('new', 'accepted', 'pending_new', 'partially_filled')
      ORDER BY o.submitted_at ASC
    `);

    return result.rows;
  }

  /**
   * Get existing fills for an order
   */
  private async getExistingFills(orderId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM trd_fill WHERE order_id = $1`,
      [orderId]
    );

    return result.rows.map((row) => ({
      fillId: row.fill_id,
      orderId: row.order_id,
      price: parseFloat(row.price),
      qty: parseFloat(row.qty),
      fee: parseFloat(row.fee),
      fillTs: row.fill_ts,
    }));
  }

  /**
   * Update order status in database
   */
  private async updateOrderStatus(orderId: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE trd_order
       SET status = $1, last_update_at = now()
       WHERE order_id = $2 AND status != $1`,
      [status, orderId]
    );
  }

  /**
   * Record fill in database
   */
  private async recordFill(fill: Fill, client: PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO trd_fill (fill_id, order_id, price, qty, fee, fill_ts)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fill.fillId, fill.orderId, fill.price, fill.qty, fill.fee, fill.fillTs]
    );

    // Log to audit trail
    await client.query(
      `INSERT INTO trd_audit_log (actor, action, resource, diff_json)
       VALUES ($1, $2, $3, $4)`,
      [
        'system',
        'fill_recorded',
        fill.orderId,
        JSON.stringify({
          fillId: fill.fillId,
          symbol: fill.symbol,
          side: fill.side,
          qty: fill.qty,
          price: fill.price,
        }),
      ]
    );
  }

  /**
   * Update position after fill
   */
  private async updatePosition(fill: Fill, client: PoolClient): Promise<void> {
    // Get current position
    const currentPosition = await this.getCurrentPosition(fill.symbol, client);

    // Calculate new position
    let newQty = currentPosition.qty;
    let newAvgPrice = currentPosition.avgPrice;
    let newCostBasis = currentPosition.qty * currentPosition.avgPrice;

    if (fill.side === 'buy') {
      // Adding to position
      const fillCost = fill.qty * fill.price;
      newCostBasis += fillCost;
      newQty += fill.qty;
      newAvgPrice = newQty > 0 ? newCostBasis / newQty : 0;
    } else {
      // Reducing position (sell)
      newQty -= fill.qty;
      // Keep same avg price (realized P&L calculated separately)
    }

    // Get current market price from broker
    let marketPrice = fill.price; // Default to fill price
    try {
      const quote = await this.broker.getQuote(fill.symbol);
      marketPrice = quote.last || fill.price;
    } catch (error) {
      // Use fill price if quote fails
    }

    const unrealizedPnl = newQty * (marketPrice - newAvgPrice);

    // Insert position snapshot
    await client.query(
      `INSERT INTO trd_position_snapshot (symbol, qty, avg_price, market_price, unrealized_pnl)
       VALUES ($1, $2, $3, $4, $5)`,
      [fill.symbol, newQty, newAvgPrice, marketPrice, unrealizedPnl]
    );

    console.log(`✓ Position updated: ${fill.symbol}`);
    console.log(`   Qty: ${currentPosition.qty} → ${newQty}`);
    console.log(`   Avg Price: $${currentPosition.avgPrice.toFixed(2)} → $${newAvgPrice.toFixed(2)}`);
    console.log(`   Unrealized P&L: $${unrealizedPnl.toFixed(2)}`);
  }

  /**
   * Get current position for symbol
   */
  private async getCurrentPosition(symbol: string, client?: PoolClient): Promise<any> {
    const queryRunner = client || this.pool;
    const result = await queryRunner.query(
      `SELECT * FROM trd_position_snapshot
       WHERE symbol = $1
       ORDER BY ts DESC
       LIMIT 1`,
      [symbol]
    );

    if (result.rows.length === 0) {
      return {
        symbol,
        qty: 0,
        avgPrice: 0,
        marketPrice: 0,
        unrealizedPnl: 0,
      };
    }

    const row = result.rows[0];
    return {
      symbol: row.symbol,
      qty: parseFloat(row.qty),
      avgPrice: parseFloat(row.avg_price),
      marketPrice: parseFloat(row.market_price),
      unrealizedPnl: parseFloat(row.unrealized_pnl),
    };
  }

  /**
   * Manual: Process a specific order
   */
  async processOrder(brokerOrderId: string): Promise<void> {
    const result = await this.pool.query(
      `SELECT o.order_id, o.broker_order_id, o.status, i.symbol, i.side, i.qty
       FROM trd_order o
       JOIN trd_order_intent i ON i.intent_id = o.intent_id
       WHERE o.broker_order_id = $1`,
      [brokerOrderId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Order not found: ${brokerOrderId}`);
    }

    await this.checkOrderForFills(result.rows[0]);
  }
}
